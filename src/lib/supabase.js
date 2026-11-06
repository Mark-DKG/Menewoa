import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

// Session tokens (not health data) are persisted by supabase-js so users stay signed in.
// PKCE flow keeps tokens out of URLs. No cycle/health data is ever written to
// localStorage/sessionStorage by this app — it lives only in memory and in the database.
export const supabase = env.ok
  ? createClient(env.url, env.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    })
  : null;
