import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import worker, { testing } from "../src/index.js";

const ACCESS_AUD = "test-audience";
const ACCESS_ISSUER = "https://test.cloudflareaccess.com";
const ACCESS_JWKS_URL = `${ACCESS_ISSUER}/cdn-cgi/access/certs`;
const keyId = "test-key";

let privateKey;
let publicJwk;

function encodeBase64Url(value) {
	const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function createToken(overrides = {}) {
	const header = encodeBase64Url(JSON.stringify({ alg: "RS256", kid: keyId, typ: "JWT" }));
	const now = Math.floor(Date.now() / 1000);
	const payload = encodeBase64Url(JSON.stringify({
		iss: ACCESS_ISSUER,
		aud: [ACCESS_AUD],
		exp: now + 300,
		nbf: now - 1,
		sub: "admin@example.com",
		...overrides,
	}));
	const unsignedToken = `${header}.${payload}`;
	const signature = await crypto.subtle.sign(
		{ name: "RSASSA-PKCS1-v1_5" },
		privateKey,
		new TextEncoder().encode(unsignedToken),
	);
	return `${unsignedToken}.${encodeBase64Url(signature)}`;
}

function createEnv(db) {
	return {
		DB: db,
		ACCESS_AUD,
		ACCESS_ISSUER,
		ACCESS_JWKS_URL,
	};
}

async function apiRequest(path, options = {}) {
	const headers = new Headers(options.headers);
	headers.set("Cf-Access-Jwt-Assertion", await createToken());
	return new Request(`https://admin.example.com${path}`, { ...options, headers });
}

beforeAll(async () => {
	const keyPair = await crypto.subtle.generateKey(
		{
			name: "RSASSA-PKCS1-v1_5",
			modulusLength: 2048,
			publicExponent: new Uint8Array([1, 0, 1]),
			hash: "SHA-256",
		},
		true,
		["sign", "verify"],
	);
	privateKey = keyPair.privateKey;
	publicJwk = { ...await crypto.subtle.exportKey("jwk", keyPair.publicKey), kid: keyId };
});

beforeEach(() => {
	testing.resetJwksCache();
	vi.restoreAllMocks();
	vi.stubGlobal("fetch", vi.fn(async () => Response.json({ keys: [publicJwk] })));
});

describe("input validation", () => {
	it("normalizes platforms into the canonical order", () => {
		expect(testing.normalizePlatforms("Steam, PS5,NS2")).toBe("NS2,PS5,Steam");
	});

	it("rejects unknown and duplicate platforms", () => {
		expect(() => testing.normalizePlatforms("PS5,PC")).toThrow("platform은");
		expect(() => testing.normalizePlatforms("PS5,PS5")).toThrow("중복");
	});

	it("rejects impossible release dates", () => {
		expect(() => testing.validateReleaseInput({
			title: "Game",
			platform: "PS5",
			release_date: "2026-02-30",
		})).toThrow("YYYY-MM-DD");
	});
});

describe("Access authentication", () => {
	it("rejects API requests without an Access token", async () => {
		const response = await worker.fetch(
			new Request("https://admin.example.com/api/releases"),
			createEnv({}),
		);
		expect(response.status).toBe(401);
		expect((await response.json()).error.code).toBe("ACCESS_TOKEN_REQUIRED");
	});

	it("rejects a token for another audience", async () => {
		const request = new Request("https://admin.example.com/api/releases", {
			headers: { "Cf-Access-Jwt-Assertion": await createToken({ aud: ["other"] }) },
		});
		const response = await worker.fetch(request, createEnv({}));
		expect(response.status).toBe(401);
		expect((await response.json()).error.code).toBe("INVALID_ACCESS_TOKEN");
	});
});

describe("release API", () => {
	it("lists the first 50 upcoming releases by default", async () => {
		const releases = [{ id: 1, title: "Game", platform: "PS5", release_date: "2026-08-01" }];
		const all = vi.fn(async () => ({ results: releases }));
		const bind = vi.fn(() => ({ all }));
		const db = { prepare: vi.fn(() => ({ bind })) };
		const response = await worker.fetch(await apiRequest("/api/releases"), createEnv(db));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ releases, next_cursor: null, has_more: false });
		expect(db.prepare.mock.calls[0][0]).toContain("date('now', '+9 hours')");
		expect(db.prepare.mock.calls[0][0]).not.toContain("created_at");
		expect(db.prepare.mock.calls[0][0]).not.toContain("updated_at");
		expect(bind).toHaveBeenCalledWith(51);
	});

	it("searches titles while escaping LIKE wildcard characters", async () => {
		const all = vi.fn(async () => ({ results: [] }));
		const bind = vi.fn(() => ({ all }));
		const db = { prepare: vi.fn(() => ({ bind })) };
		const response = await worker.fetch(
			await apiRequest("/api/releases?q=100%25_%5C&exclude_released=false&limit=10"),
			createEnv(db),
		);

		expect(response.status).toBe(200);
		expect(db.prepare.mock.calls[0][0]).toContain("title LIKE ? ESCAPE");
		expect(db.prepare.mock.calls[0][0]).not.toContain("date('now'");
		expect(bind.mock.calls[0][0]).toBe("%100\\%\\_\\\\%");
		expect(bind.mock.calls[0][1]).toBe(11);
	});

	it("returns a cursor when another page exists", async () => {
		const releases = Array.from({ length: 51 }, (_, index) => ({
			id: index + 1,
			title: `Game ${index + 1}`,
			platform: "Steam",
			release_date: "2026-08-01",
		}));
		const all = vi.fn(async () => ({ results: releases }));
		const bind = vi.fn(() => ({ all }));
		const db = { prepare: vi.fn(() => ({ bind })) };
		const response = await worker.fetch(await apiRequest("/api/releases"), createEnv(db));
		const body = await response.json();

		expect(body.releases).toHaveLength(50);
		expect(body.has_more).toBe(true);
		expect(typeof body.next_cursor).toBe("string");

		await worker.fetch(
			await apiRequest(`/api/releases?cursor=${encodeURIComponent(body.next_cursor)}`),
			createEnv(db),
		);
		expect(bind.mock.calls[1]).toEqual(["2026-08-01", "2026-08-01", 50, 51]);
	});

	it("rejects invalid pagination parameters before querying D1", async () => {
		const db = { prepare: vi.fn() };
		const response = await worker.fetch(await apiRequest("/api/releases?limit=101"), createEnv(db));

		expect(response.status).toBe(400);
		expect((await response.json()).error.code).toBe("INVALID_LIMIT");
		expect(db.prepare).not.toHaveBeenCalled();
	});

	it("creates a normalized release and returns 201", async () => {
		const release = { id: 28, title: "New Game", platform: "PS5,Steam", release_date: "2026-09-01" };
		const insertRun = vi.fn(async () => ({ meta: { last_row_id: 28, changes: 1 } }));
		const first = vi.fn(async () => release);
		const bind = vi.fn((...values) => values.length === 3 ? { run: insertRun } : { first });
		const db = { prepare: vi.fn(() => ({ bind })) };
		const response = await worker.fetch(await apiRequest("/api/releases", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ title: "  New Game  ", platform: "Steam,PS5", release_date: "2026-09-01" }),
		}), createEnv(db));

		expect(response.status).toBe(201);
		expect(response.headers.get("Location")).toBe("/api/releases/28");
		expect(bind.mock.calls[0]).toEqual(["New Game", "PS5,Steam", "2026-09-01"]);
		expect(await response.json()).toEqual({ release });
	});

	it("updates every editable field and updated_at", async () => {
		const release = { id: 3, title: "Updated", platform: "NS2", release_date: "2026-10-01" };
		const run = vi.fn(async () => ({ meta: { changes: 1 } }));
		const first = vi.fn(async () => release);
		const bind = vi.fn((...values) => values.length === 4 ? { run } : { first });
		const db = { prepare: vi.fn(() => ({ bind })) };
		const response = await worker.fetch(await apiRequest("/api/releases/3", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ title: "Updated", platform: "NS2", release_date: "2026-10-01" }),
		}), createEnv(db));

		expect(response.status).toBe(200);
		expect(db.prepare.mock.calls[0][0]).toContain("updated_at = strftime");
		expect(bind.mock.calls[0]).toEqual(["Updated", "NS2", "2026-10-01", 3]);
	});

	it("returns 404 when the delete target does not exist", async () => {
		const run = vi.fn(async () => ({ meta: { changes: 0 } }));
		const db = { prepare: vi.fn(() => ({ bind: () => ({ run }) })) };
		const response = await worker.fetch(await apiRequest("/api/releases/99", {
			method: "DELETE",
		}), createEnv(db));

		expect(response.status).toBe(404);
		expect((await response.json()).error.code).toBe("RELEASE_NOT_FOUND");
	});

	it("deletes a release by id", async () => {
		const run = vi.fn(async () => ({ meta: { changes: 1 } }));
		const bind = vi.fn(() => ({ run }));
		const db = { prepare: vi.fn(() => ({ bind })) };
		const response = await worker.fetch(await apiRequest("/api/releases/7", {
			method: "DELETE",
		}), createEnv(db));

		expect(response.status).toBe(204);
		expect(bind).toHaveBeenCalledWith(7);
		expect(run).toHaveBeenCalledOnce();
	});
});
