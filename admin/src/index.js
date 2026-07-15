const ALLOWED_PLATFORMS = ["NS", "NS2", "PS4", "PS5", "XBOX", "Steam"];
const ALLOWED_PLATFORM_SET = new Set(ALLOWED_PLATFORMS);
const MAX_JSON_BYTES = 16 * 1024;
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

let jwksCache;

class HttpError extends Error {
	constructor(status, code, message) {
		super(message);
		this.status = status;
		this.code = code;
	}
}

function json(data, status = 200, headers = {}) {
	return Response.json(data, {
		status,
		headers: {
			"cache-control": "no-store",
			...headers,
		},
	});
}

function errorResponse(error) {
	if (error instanceof HttpError) {
		return json({ error: { code: error.code, message: error.message } }, error.status);
	}

	const message = error instanceof Error ? error.message : String(error);
	if (message.includes("UNIQUE constraint failed")) {
		return json({
			error: {
				code: "RELEASE_ALREADY_EXISTS",
				message: "동일한 게임명과 플랫폼 조합이 이미 존재합니다.",
			},
		}, 409);
	}

	console.error(JSON.stringify({
		event: "admin_api_error",
		message,
		stack: error instanceof Error ? error.stack : undefined,
	}));
	return json({
		error: {
			code: "INTERNAL_ERROR",
			message: "요청을 처리하지 못했습니다.",
		},
	}, 500);
}

function decodeBase64Url(value) {
	const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
	const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
	const binary = atob(normalized + padding);
	return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeJwtPart(value) {
	try {
		return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
	} catch {
		throw new HttpError(401, "INVALID_ACCESS_TOKEN", "유효하지 않은 Access 토큰입니다.");
	}
}

function getAccessToken(request) {
	const assertion = request.headers.get("Cf-Access-Jwt-Assertion");
	if (assertion) {
		return assertion;
	}

	const cookie = request.headers.get("Cookie") ?? "";
	for (const part of cookie.split(";")) {
		const [name, ...valueParts] = part.trim().split("=");
		if (name === "CF_Authorization") {
			return valueParts.join("=");
		}
	}

	throw new HttpError(401, "ACCESS_TOKEN_REQUIRED", "Cloudflare Access 인증이 필요합니다.");
}

async function fetchJwks(url, forceRefresh = false) {
	const now = Date.now();
	if (!forceRefresh && jwksCache?.url === url && jwksCache.expiresAt > now) {
		return jwksCache.keys;
	}

	let response;
	try {
		response = await fetch(url, { headers: { accept: "application/json" } });
	} catch {
		throw new HttpError(503, "ACCESS_KEYS_UNAVAILABLE", "Access 인증 키를 불러오지 못했습니다.");
	}

	if (!response.ok) {
		throw new HttpError(503, "ACCESS_KEYS_UNAVAILABLE", "Access 인증 키를 불러오지 못했습니다.");
	}

	const body = await response.json();
	if (!Array.isArray(body.keys)) {
		throw new HttpError(503, "ACCESS_KEYS_INVALID", "Access 인증 키 응답이 올바르지 않습니다.");
	}

	jwksCache = {
		url,
		keys: body.keys,
		expiresAt: now + JWKS_CACHE_TTL_MS,
	};
	return body.keys;
}

async function getVerificationKey(jwksUrl, kid) {
	let keys = await fetchJwks(jwksUrl);
	let jwk = keys.find((key) => key.kid === kid && key.kty === "RSA");

	if (!jwk) {
		keys = await fetchJwks(jwksUrl, true);
		jwk = keys.find((key) => key.kid === kid && key.kty === "RSA");
	}

	if (!jwk) {
		throw new HttpError(401, "INVALID_ACCESS_TOKEN", "유효하지 않은 Access 토큰입니다.");
	}

	try {
		return await crypto.subtle.importKey(
			"jwk",
			jwk,
			{ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
			false,
			["verify"],
		);
	} catch {
		throw new HttpError(503, "ACCESS_KEYS_INVALID", "Access 인증 키를 사용할 수 없습니다.");
	}
}

async function verifyAccess(request, env) {
	const token = getAccessToken(request);
	const parts = token.split(".");
	if (parts.length !== 3) {
		throw new HttpError(401, "INVALID_ACCESS_TOKEN", "유효하지 않은 Access 토큰입니다.");
	}

	const [encodedHeader, encodedPayload, encodedSignature] = parts;
	const header = decodeJwtPart(encodedHeader);
	const payload = decodeJwtPart(encodedPayload);

	if (header.alg !== "RS256" || typeof header.kid !== "string") {
		throw new HttpError(401, "INVALID_ACCESS_TOKEN", "유효하지 않은 Access 토큰입니다.");
	}

	const key = await getVerificationKey(env.ACCESS_JWKS_URL, header.kid);
	let verified;
	try {
		verified = await crypto.subtle.verify(
			{ name: "RSASSA-PKCS1-v1_5" },
			key,
			decodeBase64Url(encodedSignature),
			new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
		);
	} catch {
		throw new HttpError(401, "INVALID_ACCESS_TOKEN", "유효하지 않은 Access 토큰입니다.");
	}

	const now = Math.floor(Date.now() / 1000);
	const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
	if (
		!verified
		|| payload.iss !== env.ACCESS_ISSUER
		|| !audience.includes(env.ACCESS_AUD)
		|| typeof payload.exp !== "number"
		|| payload.exp <= now
		|| (typeof payload.nbf === "number" && payload.nbf > now)
	) {
		throw new HttpError(401, "INVALID_ACCESS_TOKEN", "유효하지 않은 Access 토큰입니다.");
	}

	return payload;
}

function parseId(value) {
	if (!/^[1-9]\d*$/.test(value)) {
		throw new HttpError(400, "INVALID_ID", "id는 양의 정수여야 합니다.");
	}

	const id = Number(value);
	if (!Number.isSafeInteger(id)) {
		throw new HttpError(400, "INVALID_ID", "id가 올바르지 않습니다.");
	}
	return id;
}

function normalizePlatforms(value) {
	if (typeof value !== "string") {
		throw new HttpError(422, "INVALID_PLATFORM", "platform은 쉼표로 구분한 문자열이어야 합니다.");
	}

	const values = value.split(",").map((platform) => platform.trim());
	if (values.length === 0 || values.some((platform) => !platform)) {
		throw new HttpError(422, "INVALID_PLATFORM", "platform을 하나 이상 입력해 주세요.");
	}
	if (values.some((platform) => !ALLOWED_PLATFORM_SET.has(platform))) {
		throw new HttpError(
			422,
			"INVALID_PLATFORM",
			`platform은 ${ALLOWED_PLATFORMS.join(",")}만 사용할 수 있습니다.`,
		);
	}
	if (new Set(values).size !== values.length) {
		throw new HttpError(422, "DUPLICATE_PLATFORM", "같은 platform을 중복해서 입력할 수 없습니다.");
	}

	const selected = new Set(values);
	return ALLOWED_PLATFORMS.filter((platform) => selected.has(platform)).join(",");
}

function isValidDate(value) {
	if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return false;
	}
	const date = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateReleaseInput(body) {
	if (!body || typeof body !== "object" || Array.isArray(body)) {
		throw new HttpError(400, "INVALID_JSON", "JSON 객체를 전송해 주세요.");
	}

	if (typeof body.title !== "string" || !body.title.trim()) {
		throw new HttpError(422, "INVALID_TITLE", "title을 입력해 주세요.");
	}
	const title = body.title.trim();
	if (title.length > 200) {
		throw new HttpError(422, "INVALID_TITLE", "title은 200자 이하여야 합니다.");
	}
	if (!isValidDate(body.release_date)) {
		throw new HttpError(422, "INVALID_RELEASE_DATE", "release_date는 유효한 YYYY-MM-DD 형식이어야 합니다.");
	}

	return {
		title,
		platform: normalizePlatforms(body.platform),
		release_date: body.release_date,
	};
}

async function readJson(request) {
	const contentType = request.headers.get("Content-Type") ?? "";
	if (!contentType.toLowerCase().includes("application/json")) {
		throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type은 application/json이어야 합니다.");
	}

	const contentLength = Number(request.headers.get("Content-Length") ?? 0);
	if (contentLength > MAX_JSON_BYTES) {
		throw new HttpError(413, "PAYLOAD_TOO_LARGE", "요청 본문은 16KB 이하여야 합니다.");
	}

	if (!request.body) {
		throw new HttpError(400, "INVALID_JSON", "올바른 JSON을 전송해 주세요.");
	}

	const reader = request.body.getReader();
	const decoder = new TextDecoder();
	let receivedBytes = 0;
	let text = "";

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			receivedBytes += value.byteLength;
			if (receivedBytes > MAX_JSON_BYTES) {
				await reader.cancel();
				throw new HttpError(413, "PAYLOAD_TOO_LARGE", "요청 본문은 16KB 이하여야 합니다.");
			}
			text += decoder.decode(value, { stream: true });
		}
		text += decoder.decode();
		return JSON.parse(text);
	} catch {
		if (receivedBytes > MAX_JSON_BYTES) {
			throw new HttpError(413, "PAYLOAD_TOO_LARGE", "요청 본문은 16KB 이하여야 합니다.");
		}
		throw new HttpError(400, "INVALID_JSON", "올바른 JSON을 전송해 주세요.");
	}
}

async function getRelease(env, id) {
	return env.DB.prepare(`
		SELECT id, title, platform, release_date
		  FROM game_release
		 WHERE id = ?
	`).bind(id).first();
}

function encodeCursor(release) {
	const value = JSON.stringify({ release_date: release.release_date, id: release.id });
	return btoa(value).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function decodeCursor(value) {
	if (!value || value.length > 512) {
		throw new HttpError(400, "INVALID_CURSOR", "cursor가 올바르지 않습니다.");
	}

	try {
		const cursor = JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
		if (!isValidDate(cursor.release_date) || !Number.isSafeInteger(cursor.id) || cursor.id < 1) {
			throw new Error("Invalid cursor payload");
		}
		return cursor;
	} catch {
		throw new HttpError(400, "INVALID_CURSOR", "cursor가 올바르지 않습니다.");
	}
}

function parseListOptions(url) {
	const query = url.searchParams.get("q")?.trim() ?? "";
	if (query.length > 100) {
		throw new HttpError(400, "INVALID_QUERY", "검색어는 100자 이하여야 합니다.");
	}

	const excludeReleasedValue = url.searchParams.get("exclude_released") ?? "true";
	if (excludeReleasedValue !== "true" && excludeReleasedValue !== "false") {
		throw new HttpError(400, "INVALID_EXCLUDE_RELEASED", "exclude_released는 true 또는 false여야 합니다.");
	}

	const limitValue = url.searchParams.get("limit") ?? String(DEFAULT_PAGE_SIZE);
	if (!/^\d+$/.test(limitValue)) {
		throw new HttpError(400, "INVALID_LIMIT", `limit은 1부터 ${MAX_PAGE_SIZE} 사이의 정수여야 합니다.`);
	}
	const limit = Number(limitValue);
	if (limit < 1 || limit > MAX_PAGE_SIZE) {
		throw new HttpError(400, "INVALID_LIMIT", `limit은 1부터 ${MAX_PAGE_SIZE} 사이의 정수여야 합니다.`);
	}

	const cursorValue = url.searchParams.get("cursor");
	return {
		query,
		excludeReleased: excludeReleasedValue === "true",
		limit,
		cursor: cursorValue ? decodeCursor(cursorValue) : null,
	};
}

function escapeLike(value) {
	return value.replace(/[\\%_]/g, "\\$&");
}

async function listReleases(env, url) {
	const options = parseListOptions(url);
	const conditions = [];
	const values = [];

	if (options.excludeReleased) {
		conditions.push("release_date >= date('now', '+9 hours')");
	}
	if (options.query) {
		conditions.push("title LIKE ? ESCAPE '\\'");
		values.push(`%${escapeLike(options.query)}%`);
	}
	if (options.cursor) {
		conditions.push("(release_date > ? OR (release_date = ? AND id > ?))");
		values.push(options.cursor.release_date, options.cursor.release_date, options.cursor.id);
	}

	const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
	const { results } = await env.DB.prepare(`
		SELECT id, title, platform, release_date
		  FROM game_release
		  ${whereClause}
		 ORDER BY release_date, id
		 LIMIT ?
	`).bind(...values, options.limit + 1).all();

	const hasMore = results.length > options.limit;
	const releases = hasMore ? results.slice(0, options.limit) : results;
	const lastRelease = releases.at(-1);
	return json({
		releases,
		next_cursor: hasMore && lastRelease ? encodeCursor(lastRelease) : null,
		has_more: hasMore,
	});
}

async function createRelease(request, env) {
	const input = validateReleaseInput(await readJson(request));
	const result = await env.DB.prepare(`
		INSERT INTO game_release (title, platform, release_date)
		VALUES (?, ?, ?)
	`).bind(input.title, input.platform, input.release_date).run();
	const release = await getRelease(env, result.meta.last_row_id);
	return json({ release }, 201, { location: `/api/releases/${result.meta.last_row_id}` });
}

async function updateRelease(request, env, id) {
	const input = validateReleaseInput(await readJson(request));
	const result = await env.DB.prepare(`
		UPDATE game_release
		   SET title = ?,
		       platform = ?,
		       release_date = ?,
		       updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now')
		 WHERE id = ?
	`).bind(input.title, input.platform, input.release_date, id).run();

	if (result.meta.changes === 0) {
		throw new HttpError(404, "RELEASE_NOT_FOUND", "게임 발매 일정을 찾을 수 없습니다.");
	}
	return json({ release: await getRelease(env, id) });
}

async function deleteRelease(env, id) {
	const result = await env.DB.prepare("DELETE FROM game_release WHERE id = ?").bind(id).run();
	if (result.meta.changes === 0) {
		throw new HttpError(404, "RELEASE_NOT_FOUND", "게임 발매 일정을 찾을 수 없습니다.");
	}
	return new Response(null, { status: 204 });
}

async function handleApi(request, env, url) {
	await verifyAccess(request, env);

	if (url.pathname === "/api/releases") {
		if (request.method === "GET") return listReleases(env, url);
		if (request.method === "POST") return createRelease(request, env);
		return json({ error: { code: "METHOD_NOT_ALLOWED", message: "허용되지 않은 요청 방식입니다." } }, 405, {
			allow: "GET, POST",
		});
	}

	const match = url.pathname.match(/^\/api\/releases\/([^/]+)$/);
	if (match) {
		const id = parseId(match[1]);
		if (request.method === "PUT") return updateRelease(request, env, id);
		if (request.method === "DELETE") return deleteRelease(env, id);
		return json({ error: { code: "METHOD_NOT_ALLOWED", message: "허용되지 않은 요청 방식입니다." } }, 405, {
			allow: "PUT, DELETE",
		});
	}

	throw new HttpError(404, "API_NOT_FOUND", "API를 찾을 수 없습니다.");
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
			try {
				return await handleApi(request, env, url);
			} catch (error) {
				return errorResponse(error);
			}
		}

		return env.ASSETS.fetch(request);
	},
};

export const testing = {
	normalizePlatforms,
	validateReleaseInput,
	resetJwksCache() {
		jwksCache = undefined;
	},
};
