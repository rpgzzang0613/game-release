import {
	createExecutionContext,
	waitOnExecutionContext,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src/index.js";

describe("game release worker", () => {
	it("returns upcoming releases", async () => {
		const releases = [
			{
				title: "테스트 게임",
				platform: "PS5, Steam",
				release_date: "2026-08-01",
			},
		];
		const env = {
			DB: {
				prepare: () => ({
					all: async () => ({ results: releases }),
				}),
			},
		};
		const request = new Request("http://example.com/api/releases");
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(releases);
	});
});
