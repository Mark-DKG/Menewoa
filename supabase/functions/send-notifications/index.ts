// Scheduled push + in-app notifications. Invoke hourly (see docs/DEPLOYMENT.md) with the header
//   x-cron-secret: <CRON_SECRET>
// What it does, per user, in THEIR time zone:
//   * upcoming_period  - 2 days before the estimated start       (woman)
//   * period_started   - on the estimated start day              (woman)
//   * partner_update   - 2 days before, ONLY if she shares "expected period" with her partner
//   * tracking_reminder- at 20:00 local if nothing has been logged today (opt-in)
// Privacy rules enforced here:
//   * In-app rows go through public.create_notification(), which honours each recipient's prefs.
//   * Push payloads contain a fixed `type` only ({v:1,type,details?}); no names, dates, moods or
//     symptoms ever leave the database in a push. `details:true` is sent solely for users who
//     opted in, and the service worker still looks the wording up from its own fixed table.
//   * Dedupe: at most one notification of a kind per user per 20 hours.
//   * Subscriptions the push service reports as gone (404/410) are deleted.
import webpush from "npm:web-push@3.6.7";
import { adminClient, env, json, preflight } from "../_shared/http.ts";

type Kind = "upcoming_period" | "period_started" | "tracking_reminder" | "partner_update";

function localParts(tz: string, now = new Date()): { date: string; hour: number } {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}
const dayNum = (iso: string) => Math.floor(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000);

function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json(req, 405, { error: "Method not allowed." });
  if (!timingSafeEqual(req.headers.get("x-cron-secret") ?? "", env("CRON_SECRET"))) return json(req, 401, { error: "Unauthorized." });

  webpush.setVapidDetails(env("VAPID_SUBJECT"), env("VAPID_PUBLIC_KEY"), env("VAPID_PRIVATE_KEY"));
  const db = adminClient();
  const stats = { considered: 0, queued: 0, pushed: 0, removed: 0, failed: 0 };

  const recentlySent = async (userId: string, kind: Kind): Promise<boolean> => {
    const since = new Date(Date.now() - 20 * 3600_000).toISOString();
    const { count } = await db.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("kind", kind).gte("created_at", since);
    return (count ?? 0) > 0;
  };

  const notify = async (userId: string, kind: Kind, related: string | null) => {
    if (await recentlySent(userId, kind)) return;
    const before = new Date().toISOString();
    const { error } = await db.rpc("create_notification", { p_user: userId, p_kind: kind, p_related: related });
    if (error) { stats.failed++; return; }
    // create_notification silently skips users whose preference is off; only push if a row appeared.
    const { count } = await db.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("kind", kind).gte("created_at", before);
    if (!count) return;
    stats.queued++;

    const { data: prefs } = await db.from("notification_preferences").select("show_details_on_lock_screen").eq("user_id", userId).maybeSingle();
    const payload = JSON.stringify({ v: 1, type: kind, ...(prefs?.show_details_on_lock_screen ? { details: true } : {}) });
    const { data: subs } = await db.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", userId);
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600, urgency: "normal" });
        stats.pushed++;
        await db.from("push_subscriptions").update({ last_success_at: new Date().toISOString() }).eq("id", s.id);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) { await db.from("push_subscriptions").delete().eq("id", s.id); stats.removed++; }
        else stats.failed++;
      }
    }
  };

  // Active women with a prediction.
  const { data: rows, error } = await db
    .from("cycle_predictions")
    .select("user_id,next_period_start, profiles!inner(timezone,status,role)")
    .eq("profiles.status", "active").eq("profiles.role", "woman");
  if (error) return json(req, 500, { error: "Query failed." });

  for (const r of rows ?? []) {
    stats.considered++;
    const prof = (r as unknown as { profiles: { timezone: string } }).profiles;
    let local;
    try { local = localParts(prof.timezone); } catch { continue; }
    const until = dayNum(r.next_period_start) - dayNum(local.date);

    if (until === 2) {
      await notify(r.user_id, "upcoming_period", null);
      // Partner heads-up only while an active connection shares the expected period.
      const { data: conns } = await db.from("partner_connections").select("id,partner_id,sharing_permissions!inner(share_expected_period)").eq("woman_id", r.user_id).eq("status", "active");
      for (const c of conns ?? []) {
        const perm = (c as unknown as { sharing_permissions: { share_expected_period: boolean } | { share_expected_period: boolean }[] }).sharing_permissions;
        const shares = Array.isArray(perm) ? perm[0]?.share_expected_period : perm?.share_expected_period;
        if (shares) await notify(c.partner_id, "partner_update", c.id);
      }
    }
    if (until === 0) await notify(r.user_id, "period_started", null);
  }

  // Tracking reminders (opt-in): 20:00 local, nothing logged today.
  const { data: reminderUsers } = await db
    .from("notification_preferences")
    .select("user_id, profiles!inner(timezone,status,role)")
    .eq("tracking_reminders", true).eq("profiles.status", "active").eq("profiles.role", "woman");
  for (const u of reminderUsers ?? []) {
    const tz = (u as unknown as { profiles: { timezone: string } }).profiles.timezone;
    let local;
    try { local = localParts(tz); } catch { continue; }
    if (local.hour !== 20) continue;
    const logged = await Promise.all(
      ["mood_entries", "daily_logs", "symptom_logs", "period_entries"].map(async (t) => {
        const col = t === "period_entries" ? "start_date" : "log_date";
        const { count } = await db.from(t).select("user_id", { count: "exact", head: true }).eq("user_id", u.user_id).eq(col, local.date);
        return (count ?? 0) > 0;
      }),
    );
    if (!logged.some(Boolean)) await notify(u.user_id, "tracking_reminder", null);
  }

  return json(req, 200, { ok: true, stats }); // counts only
});
