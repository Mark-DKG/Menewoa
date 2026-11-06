// Owner-only deletion of ANOTHER user's account.
// Authorization lives in the database: `admin_authorize_delete` (run with the caller's own JWT)
// checks the caller is an active OWNER, refuses self/admin targets, requires a written reason and
// writes the audit entry — all in one transaction. Only when it succeeds do we use the
// service-role key to remove the auth user (which cascades to all of their data).
import { UUID_RE, adminClient, corsHeaders, json, preflight, readJson, userClient } from "../_shared/http.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json(req, 405, { error: "Method not allowed." });

  try {
    const body = await readJson(req);
    const userId = typeof body?.userId === "string" ? body.userId : "";
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    if (!UUID_RE.test(userId)) return json(req, 400, { error: "Invalid user." });
    if (reason.length < 5 || reason.length > 1000) return json(req, 400, { error: "A reason of at least 5 characters is required." });

    const { error: authzErr } = await userClient(req).rpc("admin_authorize_delete", { p_user: userId, p_reason: reason });
    if (authzErr) {
      const code = (authzErr as { code?: string }).code;
      if (code === "42501") return json(req, 403, { error: "You don't have permission to do that." });
      if (code === "P0002") return json(req, 404, { error: "That account no longer exists." });
      if (code === "28000" || authzErr.message?.includes("JWT")) return json(req, 401, { error: "Your session has expired. Please sign in again." });
      return json(req, 400, { error: "That request couldn't be completed." });
    }

    const { error: derr } = await adminClient().auth.admin.deleteUser(userId);
    if (derr) return json(req, 500, { error: "The account couldn't be deleted. Please try again." });
    return json(req, 200, { ok: true });
  } catch (_e) {
    return new Response(JSON.stringify({ error: "Something went wrong. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
