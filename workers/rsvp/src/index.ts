type Env = {
	SUPABASE_URL: string;
	SUPABASE_SECRET_KEY: string;
	TURNSTILE_SECRET_KEY: string;
	ALLOWED_ORIGINS?: string;
};

type RsvpAction = "lookup" | "submit";

type RsvpRequest = {
	action?: RsvpAction;
	inviteCode?: string;
	memberResponses?: unknown;
	turnstileToken?: string;
};

const INVITE_CODE_PATTERN = /^[a-z0-9]{8}$/i;

function parseAllowedOrigins(env: Env) {
	return (env.ALLOWED_ORIGINS || "")
		.split(",")
		.map((origin) => origin.trim())
		.filter(Boolean);
}

function isAllowedOrigin(request: Request, env: Env) {
	const origin = request.headers.get("Origin");
	const allowedOrigins = parseAllowedOrigins(env);

	if (!origin || allowedOrigins.length === 0) {
		return true;
	}

	return allowedOrigins.includes(origin);
}

function corsHeaders(request: Request, env: Env) {
	const origin = request.headers.get("Origin");
	const allowedOrigins = parseAllowedOrigins(env);
	const allowOrigin =
		allowedOrigins.length === 0
			? "*"
			: origin && allowedOrigins.includes(origin)
				? origin
				: "null";

	return {
		"Access-Control-Allow-Origin": allowOrigin,
		"Access-Control-Allow-Headers": "Content-Type",
		"Access-Control-Allow-Methods": "POST, OPTIONS",
		Vary: "Origin",
	};
}

function jsonResponse(request: Request, env: Env, body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			...corsHeaders(request, env),
			"Content-Type": "application/json",
		},
	});
}

function getClientIp(request: Request) {
	return request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || "0.0.0.0";
}

async function callSupabaseRpc(env: Env, request: Request, functionName: string, body: unknown) {
	const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
			apikey: env.SUPABASE_SECRET_KEY,
			"Content-Type": "application/json",
			"Accept-Profile": "api",
			"Content-Profile": "api",
			"X-Forwarded-For": getClientIp(request),
		},
		body: JSON.stringify(body),
	});

	let payload: unknown = null;
	try {
		payload = await response.json();
	} catch {
		payload = null;
	}

	if (!response.ok) {
		const message =
			typeof payload === "object" && payload && "message" in payload
				? String(payload.message)
				: "The RSVP service is unavailable.";
		throw new Error(message);
	}

	return payload;
}

async function validateTurnstile(env: Env, token: string, clientIp: string) {
	const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			secret: env.TURNSTILE_SECRET_KEY,
			response: token,
			remoteip: clientIp,
		}),
	});

	let payload: unknown = null;
	try {
		payload = await response.json();
	} catch {
		payload = null;
	}

	return Boolean(response.ok && typeof payload === "object" && payload && "success" in payload && payload.success === true);
}

async function handleRsvp(request: Request, env: Env) {
	if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY || !env.TURNSTILE_SECRET_KEY) {
		return jsonResponse(request, env, { error: "RSVP service is not configured." }, 500);
	}

	if (!isAllowedOrigin(request, env)) {
		return jsonResponse(request, env, { error: "Origin not allowed." }, 403);
	}

	if (request.method === "OPTIONS") {
		return new Response("ok", { headers: corsHeaders(request, env) });
	}

	if (request.method !== "POST") {
		return jsonResponse(request, env, { error: "Method not allowed." }, 405);
	}

	let body: RsvpRequest;
	try {
		body = await request.json();
	} catch {
		return jsonResponse(request, env, { error: "Invalid JSON body." }, 400);
	}

	const inviteCode = body.inviteCode?.trim().toLowerCase();
	if (!inviteCode || !INVITE_CODE_PATTERN.test(inviteCode)) {
		return jsonResponse(request, env, { error: "A valid 8-character RSVP code is required." }, 400);
	}

	if (!body.turnstileToken || body.turnstileToken.length > 2048) {
		return jsonResponse(request, env, { error: "Complete the verification and try again." }, 400);
	}

	const isHuman = await validateTurnstile(env, body.turnstileToken, getClientIp(request));
	if (!isHuman) {
		return jsonResponse(request, env, { error: "Verification failed. Please try again." }, 400);
	}

	try {
		if (body.action === "lookup") {
			const data = await callSupabaseRpc(env, request, "get_group_by_invite_code", {
				lookup_invite_code: inviteCode,
			});

			return jsonResponse(request, env, { data });
		}

		if (body.action === "submit") {
			if (!Array.isArray(body.memberResponses)) {
				return jsonResponse(request, env, { error: "Member responses are required." }, 400);
			}

			await callSupabaseRpc(env, request, "submit_group_rsvp", {
				lookup_invite_code: inviteCode,
				member_responses: body.memberResponses,
			});

			return jsonResponse(request, env, { data: null });
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : "The RSVP service is unavailable.";
		return jsonResponse(request, env, { error: message }, 400);
	}

	return jsonResponse(request, env, { error: "Unknown RSVP action." }, 400);
}

export default {
	fetch: handleRsvp,
} satisfies ExportedHandler<Env>;
