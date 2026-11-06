// Validates build-time configuration. Only PUBLIC values may live in VITE_* variables:
// the Supabase URL and the publishable (anon) key. Anything else is a mistake, and a
// service-role key in the browser bundle would be catastrophic — so we refuse to start.

function decodeJwtPayload(token) {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function validateEnv(raw) {
  const problems = [];
  const url = (raw.VITE_SUPABASE_URL || "").trim();
  const key = (raw.VITE_SUPABASE_ANON_KEY || "").trim();

  if (!url) problems.push("VITE_SUPABASE_URL is not set.");
  else {
    let parsed = null;
    try {
      parsed = new URL(url);
    } catch {
      problems.push("VITE_SUPABASE_URL is not a valid URL.");
    }
    if (parsed) {
      const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
      if (parsed.protocol !== "https:" && !local) problems.push("VITE_SUPABASE_URL must use https.");
    }
  }

  if (!key) problems.push("VITE_SUPABASE_ANON_KEY is not set.");
  else {
    if (key.startsWith("sb_secret_")) {
      problems.push("VITE_SUPABASE_ANON_KEY contains a SECRET key. Use the publishable/anon key only.");
    } else if (!key.startsWith("sb_publishable_")) {
      const payload = decodeJwtPayload(key);
      if (!payload) problems.push("VITE_SUPABASE_ANON_KEY does not look like a Supabase key.");
      else if (payload.role === "service_role") {
        problems.push("VITE_SUPABASE_ANON_KEY is a SERVICE-ROLE key. Never ship that to a browser; use the anon key.");
      } else if (payload.role && payload.role !== "anon") {
        problems.push(`VITE_SUPABASE_ANON_KEY has unexpected role "${payload.role}" (expected "anon").`);
      }
    }
  }

  return problems.length ? { ok: false, problems } : { ok: true, url, anonKey: key };
}

export const env = validateEnv(import.meta.env ?? {});
