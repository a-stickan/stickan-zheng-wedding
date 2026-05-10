import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/index";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

const env = {
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_SECRET_KEY: "test-secret-key",
	TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
	ALLOWED_ORIGINS: "https://example.com",
};

describe("RSVP worker", () => {
	it("handles CORS preflight for allowed origins", async () => {
		const request = new IncomingRequest("https://worker.example", {
			method: "OPTIONS",
			headers: {
				Origin: "https://example.com",
			},
		});
		const ctx = createExecutionContext();

		const response = await worker.fetch(request, env, ctx);

		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://example.com");
	});

	it("rejects disallowed browser origins", async () => {
		const request = new IncomingRequest("https://worker.example", {
			method: "POST",
			headers: {
				Origin: "https://evil.example",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ action: "lookup", inviteCode: "11111111-1111-4111-8111-111111111111" }),
		});
		const ctx = createExecutionContext();

		const response = await worker.fetch(request, env, ctx);
		const payload = await response.json();

		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(403);
		expect(payload).toEqual({ error: "Origin not allowed." });
	});

	it("validates invitation UUIDs before calling Supabase", async () => {
		const request = new IncomingRequest("https://worker.example", {
			method: "POST",
			headers: {
				Origin: "https://example.com",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ action: "lookup", inviteCode: "not-a-uuid" }),
		});
		const ctx = createExecutionContext();

		const response = await worker.fetch(request, env, ctx);
		const payload = await response.json();

		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(400);
		expect(payload).toEqual({ error: "A valid invitation UUID is required." });
	});

	it("requires Turnstile for lookup requests", async () => {
		const request = new IncomingRequest("https://worker.example", {
			method: "POST",
			headers: {
				Origin: "https://example.com",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ action: "lookup", inviteCode: "11111111-1111-4111-8111-111111111111" }),
		});
		const ctx = createExecutionContext();

		const response = await worker.fetch(request, env, ctx);
		const payload = await response.json();

		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(400);
		expect(payload).toEqual({ error: "Complete the verification and try again." });
	});
});
