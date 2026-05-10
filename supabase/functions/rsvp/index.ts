import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase Edge Function environment variables.");
}

const env = {
  supabaseUrl,
  serviceRoleKey,
};

function isAllowedOrigin(request: Request) {
  const origin = request.headers.get("origin");

  if (!origin || allowedOrigins.length === 0) {
    return true;
  }

  return allowedOrigins.includes(origin);
}

function getCorsHeaders(request: Request) {
  const origin = request.headers.get("origin");

  if (allowedOrigins.length === 0) {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin",
    };
  }

  return {
    "Access-Control-Allow-Origin": origin && allowedOrigins.includes(origin) ? origin : "null",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function jsonResponse(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(request),
      "Content-Type": "application/json",
    },
  });
}

function getClientIp(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "0.0.0.0"
  );
}

function createAdminClient(clientIp: string) {
  return createClient(env.supabaseUrl, env.serviceRoleKey, {
    db: { schema: "api" },
    global: {
      headers: {
        "x-forwarded-for": clientIp,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

Deno.serve(async (request) => {
  if (!isAllowedOrigin(request)) {
    return jsonResponse(request, { error: "Origin not allowed." }, 403);
  }

  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(request) });
  }

  if (request.method !== "POST") {
    return jsonResponse(request, { error: "Method not allowed." }, 405);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(request, { error: "Invalid JSON body." }, 400);
  }

  const action = body.action;
  const inviteCode = body.inviteCode;
  const supabaseAdmin = createAdminClient(getClientIp(request));

  if (typeof inviteCode !== "string" || inviteCode.length === 0) {
    return jsonResponse(request, { error: "Invitation UUID is required." }, 400);
  }

  if (action === "lookup") {
    const { data, error } = await supabaseAdmin.rpc("get_group_by_invite_code", {
      lookup_invite_code: inviteCode,
    });

    if (error) {
      return jsonResponse(request, { error: error.message }, 400);
    }

    return jsonResponse(request, { data });
  }

  if (action === "submit") {
    const memberResponses = body.memberResponses;

    if (!Array.isArray(memberResponses)) {
      return jsonResponse(request, { error: "Member responses are required." }, 400);
    }

    const { error } = await supabaseAdmin.rpc("submit_group_rsvp", {
      lookup_invite_code: inviteCode,
      member_responses: memberResponses,
    });

    if (error) {
      return jsonResponse(request, { error: error.message }, 400);
    }

    return jsonResponse(request, { data: null });
  }

  return jsonResponse(request, { error: "Unknown RSVP action." }, 400);
});
