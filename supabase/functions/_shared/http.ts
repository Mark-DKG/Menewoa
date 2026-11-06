// Shared helpers for Edge Functions (Deno). No health data is ever logged from here.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// The one browser origin allowed to call these functions. Override with the ALLOWED_ORIGIN secret
// (e.g. when a custom domain is added); the default is the production site so a missing secret
// fails closed to the real app rather than open to everyone.
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "https://menewoa.vercel.app";

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  // Only echo an origin we explicitly trust. No wildcard: these endpoints carry credentials.
  const allow = ALLOWED_ORIGIN && origin === ALLOWED_ORIGIN ? origin : "";
  return {
    ...(allow ? { "Access-Control-Allow-Origin": allow, Vary: "Origin" } : {}),
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
  };
}

export function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
}

export function preflight(req: Request): Response | null {
  return req.method === "OPTIONS" ? new Response(null, { status: 204, headers: corsHeaders(req) }) : null;
}

export function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`missing_env_${name}`);
  return v;
}

/** Client acting AS THE CALLER (their JWT): RLS and function authorization apply. */
export function userClient(req: Request): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Service-role client: bypasses RLS. Used only after the caller has been authorized. */
export function adminClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function readJson(req: Request, maxBytes = 4096): Promise<Record<string, unknown> | null> {
  const text = await req.text();
  if (text.length > maxBytes) return null;
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
