import { createClient } from "npm:@supabase/supabase-js@2.110.5";

const FUNCTION_VERSION = "2026-07-18.1";
const defaultOrigins = [
  "https://chef-jarvis.pages.dev",
  "http://localhost:3000",
  "http://localhost:4173",
  "http://localhost:5173",
  "http://127.0.0.1:4173",
];
const allowedOrigins = new Set([
  ...defaultOrigins,
  ...(Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
]);
const corsHeaders = (request: Request) => {
  const origin = request.headers.get("Origin");
  return {
    "Access-Control-Allow-Origin":
      origin && allowedOrigins.has(origin) ? origin : defaultOrigins[0],
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Chef-Jarvis-Function-Version": FUNCTION_VERSION,
    Vary: "Origin",
  };
};
const respond = (request: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(request),
  });

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") {
    if (origin && !allowedOrigins.has(origin)) {
      return new Response(null, { status: 403 });
    }
    return new Response("ok", { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return respond(req, { error: "Method not allowed." }, 405);
  }
  if (origin && !allowedOrigins.has(origin)) {
    return respond(req, { error: "Origin not allowed." }, 403);
  }

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return respond(req, { error: "Please sign in first." }, 401);
  }

  const body = (await req.json().catch(() => ({}))) as {
    confirmation?: string;
  };
  if (body.confirmation !== "DELETE") {
    return respond(
      req,
      { error: "Type DELETE exactly to confirm account deletion." },
      400,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    return respond(req, { error: "Account deletion is not configured." }, 503);
  }

  const client = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false },
  });
  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser(authorization.slice(7));
  if (userError || !user) {
    return respond(
      req,
      { error: "Your sign-in session has expired. Please sign in again." },
      401,
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await admin.auth.admin.deleteUser(user.id, false);
  if (error) {
    console.error("Account deletion failed", {
      userId: user.id,
      message: error.message,
    });
    return respond(req, { error: "Account deletion failed." }, 500);
  }

  return respond(req, { deleted: true });
});
