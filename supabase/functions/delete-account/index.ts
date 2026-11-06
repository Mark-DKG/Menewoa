// Deletes the CALLER's own account and all of their data.
//  1. The caller must present a valid session (JWT).
//  2. They must re-enter their password (so a stolen/unattended session can't wipe an account).
//  3. Administrators cannot self-delete here (an owner must remove admin rights first), so the
//     last owner can't lock the system out by accident.
// Deleting the auth user cascades to every table (all user data references profiles(id)
// ON DELETE CASCADE); the profiles delete trigger writes a health-data-free audit entry.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { adminClient, corsHeaders, env, json, preflight, readJson, userClient } from "../_shared/http.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json(req, 405, { error: "Method not allowed." });

  try {
    const body = await readJson(req);
    const password = typeof body?.password === "string" ? body.password : "";
    if (!password || password.length > 128) return json(req, 400, { error: "Enter your password to confirm." });

    const { data: u, error: uerr } = await userClient(req).auth.getUser();
    if (uerr || !u?.user?.email) return json(req, 401, { error: "Your session has expired. Please sign in again." });
    const user = u.user;

    // Re-authenticate with a throwaway client so this does not touch the caller's session.
    const verifier = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: perr } = await verifier.auth.signInWithPassword({ email: user.email, password });
    if (perr) return json(req, 403, { error: "That password isn't correct." });

    const admin = adminClient();
    const { data: isAdmin } = await admin.from("admin_users").select("user_id").eq("user_id", user.id).is("revoked_at", null).maybeSingle();
    if (isAdmin) return json(req, 403, { error: "Administrator accounts can't be deleted here. Ask an owner to remove admin access first." });

    const { error: derr } = await admin.auth.admin.deleteUser(user.id);
    if (derr) return json(req, 500, { error: "We couldn't delete your account. Please try again." });

    return json(req, 200, { ok: true });
  } catch (_e) {
    // Never echo internals (or anything user-supplied) back.
    return new Response(JSON.stringify({ error: "Something went wrong. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
