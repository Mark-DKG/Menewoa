// All database access lives here. Every call goes through Supabase with the signed-in
// user's JWT, so Row Level Security and the SECURITY DEFINER functions decide what is
// allowed — nothing in this file (or the UI) is trusted to enforce access.
// Errors are converted to friendly, non-technical messages; health data is never logged.
import { supabase } from "../lib/supabase.js";
import { friendlyError } from "../lib/errors.js";
import { addDaysISO, deviceTimeZone, todayISO } from "../lib/dates.js";
import { cleanText } from "../lib/validation.js";

export class AppError extends Error {
  constructor(err) {
    super(friendlyError(err));
    this.name = "AppError";
    this.cause = err;
  }
}
const ok = ({ data, error }) => {
  if (error) throw new AppError(error);
  return data;
};
const rpc = async (fn, args) => ok(await supabase.rpc(fn, args));

export const MOODS = ["happy", "calm", "irritated", "sad", "anxious", "energetic", "tired", "other"];
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/* ------------------------------ sharing keys ----------------------------- */
// UI keys <-> database permission names
export const PERM_KEYS = {
  periodDates: "period_dates",
  expectedPeriod: "expected_period",
  mood: "mood",
  symptoms: "symptoms",
  fertility: "fertility",
  notes: "private_notes",
  otherSensitive: "other_sensitive",
  supportTips: "support_tips",
};
export const sharingFromPerms = (p = {}) =>
  Object.fromEntries(Object.entries(PERM_KEYS).map(([ui, db]) => [ui, !!p[db]]));
export const permsFromSharing = (s = {}) =>
  Object.fromEntries(Object.entries(PERM_KEYS).map(([ui, db]) => [db, !!s[ui]]));

const TRACK_COLS = { period: "track_period", symptoms: "track_symptoms", mood: "track_mood", sleepEnergy: "track_sleep_energy", notes: "track_notes" };
const NOTIF_COLS = {
  upcomingPeriod: "upcoming_period", periodStarted: "period_started", trackingReminders: "tracking_reminders",
  partnerUpdates: "partner_updates", announcements: "announcements", revealOnLockscreen: "show_details_on_lock_screen",
};

/* ================================ WOMAN =================================== */

export async function loadWomanData(profile, email) {
  const since = addDaysISO(todayISO(), -400);
  const q = supabase;
  const [settings, prefs, periods, symLogs, catalog, moods, dailies, tips, conn] = await Promise.all([
    q.from("cycle_settings").select("*").maybeSingle(),
    q.from("notification_preferences").select("*").maybeSingle(),
    q.from("period_entries").select("id,start_date,end_date,flow").order("start_date", { ascending: true }).limit(400),
    q.from("symptom_logs").select("log_date,symptom_id").gte("log_date", since).limit(5000),
    q.from("symptom_catalog").select("id,name,sort_order").order("sort_order"),
    q.from("mood_entries").select("id,log_date,mood").gte("log_date", since).order("log_date").limit(1000),
    q.from("daily_logs").select("id,log_date,sleep_hours,energy_level,note").gte("log_date", since).order("log_date").limit(1000),
    q.from("support_tips").select("id,tip").order("created_at"),
    q.rpc("get_my_connection"),
  ]);
  const s = ok(settings) || {};
  const np = ok(prefs) || {};
  const cat = ok(catalog);
  const nameById = new Map(cat.map((c) => [c.id, c.name]));
  const byDate = new Map();
  for (const r of ok(symLogs)) {
    if (!byDate.has(r.log_date)) byDate.set(r.log_date, []);
    byDate.get(r.log_date).push(nameById.get(r.symptom_id));
  }
  const c = ok(conn) || { status: "none" };
  return {
    profile: { name: profile.display_name, email },
    onboarded: profile.onboarding_completed,
    timezone: profile.timezone,
    cycleSettings: { cycleLength: s.cycle_length ?? 28, periodLength: s.period_length ?? 5 },
    trackingPrefs: {
      period: s.track_period ?? true, symptoms: s.track_symptoms ?? true, mood: s.track_mood ?? true,
      sleepEnergy: s.track_sleep_energy ?? false, notes: s.track_notes ?? true,
    },
    periods: ok(periods).map((p) => ({ id: p.id, start: p.start_date, end: p.end_date, flow: p.flow })),
    symptomLogs: [...byDate.entries()].map(([date, items]) => ({ id: date, date, items })),
    symptomCatalog: cat.map((x) => x.name),
    symptomIds: Object.fromEntries(cat.map((x) => [x.name, x.id])),
    moodLogs: ok(moods).map((m) => ({ id: m.id, date: m.log_date, mood: cap(m.mood) })),
    dailyLogs: ok(dailies).map((d) => ({ id: d.id, date: d.log_date, sleep: d.sleep_hours, energy: d.energy_level, note: d.note })),
    sharing: sharingFromPerms(c.permissions),
    partnerConnection: {
      status: c.status === "active" ? "connected" : c.status === "invited" ? "invited" : "none",
      connectionId: c.connection_id ?? null,
      partnerName: c.counterpart_name ?? null,
      since: c.since ?? null,
      expiresAt: c.invitation_expires_at ?? null,
      hasBlocked: !!c.has_blocked,
    },
    supportTips: ok(tips).map((t) => ({ id: t.id, text: t.tip })),
    notificationPrefs: {
      upcomingPeriod: np.upcoming_period ?? true, periodStarted: np.period_started ?? true,
      trackingReminders: np.tracking_reminders ?? false, partnerUpdates: np.partner_updates ?? true,
      announcements: np.announcements ?? true, revealOnLockscreen: np.show_details_on_lock_screen ?? false,
    },
  };
}

export function womanActions(userId, getState) {
  const T = supabase;
  return {
    async savePeriod({ id, start, end, flow }) {
      const row = { start_date: start, end_date: end || null, flow: flow ? String(flow).toLowerCase() : null };
      if (id) ok(await T.from("period_entries").update(row).eq("id", id));
      else ok(await T.from("period_entries").insert({ user_id: userId, ...row }));
    },
    async removePeriod(id) {
      ok(await T.from("period_entries").delete().eq("id", id));
    },
    async saveSymptoms(date, names) {
      const ids = names.map((n) => getState().symptomIds[n]).filter(Boolean);
      await rpc("set_day_symptoms", { p_date: date, p_symptom_ids: ids });
    },
    async saveMood(date, label) {
      const mood = String(label).toLowerCase();
      if (!MOODS.includes(mood)) throw new AppError({ message: "invalid mood" });
      await rpc("upsert_mood", { p_date: date, p_mood: mood });
    },
    async saveDaily(date, { sleep, energy, note }) {
      await rpc("upsert_daily_log", { p_date: date, p_sleep_hours: sleep ?? null, p_energy: energy ?? null, p_note: note ? cleanText(note) : null });
    },
    async setCycleSettings({ cycleLength, periodLength }) {
      ok(await T.from("cycle_settings").update({ cycle_length: cycleLength, period_length: periodLength }).eq("user_id", userId));
    },
    async setTrackingPref(key, value) {
      ok(await T.from("cycle_settings").update({ [TRACK_COLS[key]]: value }).eq("user_id", userId));
    },
    async setNotificationPref(key, value) {
      ok(await T.from("notification_preferences").update({ [NOTIF_COLS[key]]: value }).eq("user_id", userId));
    },
    async setSharing(key, value) {
      const id = getState().partnerConnection.connectionId;
      if (!id) throw new AppError({ message: "not_found" });
      const res = ok(await T.from("sharing_permissions").update({ ["share_" + PERM_KEYS[key]]: value }).eq("connection_id", id).select("connection_id"));
      if (!res?.length) throw new AppError({ message: "forbidden" });
    },
    async addTip(text) {
      ok(await T.from("support_tips").insert({ user_id: userId, tip: cleanText(text) }));
    },
    async removeTip(id) {
      ok(await T.from("support_tips").delete().eq("id", id));
    },
    async createInvitation(permissions) {
      const r = await rpc("create_partner_invitation", { p_consent: true, p_permissions: permsFromSharing(permissions) });
      return { code: r.code, expiresAt: r.expires_at };
    },
    async revokeInvitation() { await rpc("revoke_partner_invitation"); },
    async revokeConnection(id) { await rpc("revoke_partner_connection", { p_connection_id: id }); },
    async blockConnection(id) { await rpc("block_connection_counterpart", { p_connection_id: id }); },
    async unblockAll() { ok(await T.from("blocked_users").delete().eq("blocker_id", userId)); },
    // Order matters: `onboarding_completed` is set LAST so a failure part-way leaves the
    // user on the onboarding screen to retry, rather than in the app with half a setup.
    async completeOnboarding({ name, lastPeriod, cycleLength, periodLength, tracking, sharing, connectPartner }) {
      ok(await T.from("cycle_settings").update({
        cycle_length: cycleLength, period_length: periodLength,
        track_period: !!tracking.period, track_symptoms: !!tracking.symptoms, track_mood: !!tracking.mood,
        track_sleep_energy: !!tracking.sleepEnergy, track_notes: !!tracking.notes,
      }).eq("user_id", userId));
      if (lastPeriod) {
        const r = await T.from("period_entries").insert({ user_id: userId, start_date: lastPeriod });
        // A retry after a partial failure may hit the "already logged" guard — that is fine.
        if (r.error && !["23P01", "23505"].includes(r.error.code)) throw new AppError(r.error);
      }
      ok(await T.from("profiles").update({ display_name: cleanText(name) || undefined, timezone: deviceTimeZone(), onboarding_completed: true }).eq("id", userId));
      if (connectPartner === "now") return this.createInvitation(sharing);
      return null;
    },
  };
}

/* ================================ PARTNER ================================= */

export async function loadPartnerData(profile, email) {
  const [view, suggestions, prefs, notifs] = await Promise.all([
    supabase.rpc("get_partner_view"),
    supabase.from("support_suggestions").select("id,suggestion").eq("active", true).order("sort_order"),
    supabase.from("notification_preferences").select("*").maybeSingle(),
    supabase.from("notifications").select("id,kind,created_at,read_at").order("created_at", { ascending: false }).limit(30),
  ]);
  const v = ok(view) || { connected: false };
  const np = ok(prefs) || {};
  return {
    profile: { name: profile.display_name, email },
    onboarded: profile.onboarding_completed,
    view: v,
    suggestions: ok(suggestions).map((s) => s.suggestion),
    notifications: { periodUpdates: np.upcoming_period ?? true, appAnnouncements: np.announcements ?? true },
    inbox: ok(notifs),
  };
}

export const partnerActions = (userId) => ({
  async setNotification(key, value) {
    const col = key === "periodUpdates" ? "upcoming_period" : "announcements";
    ok(await supabase.from("notification_preferences").update({ [col]: value }).eq("user_id", userId));
  },
  async preview(code) { return rpc("preview_partner_invitation", { p_code: code }); },
  async redeem(code) { return rpc("redeem_partner_invitation", { p_code: code }); },
  async disconnect(id) { await rpc("revoke_partner_connection", { p_connection_id: id }); },
  async block(id) { await rpc("block_connection_counterpart", { p_connection_id: id }); },
  async completeOnboarding(name) {
    ok(await supabase.from("profiles").update({ display_name: cleanText(name) || undefined, timezone: deviceTimeZone(), onboarding_completed: true }).eq("id", userId));
  },
});

/* =============================== SHARED ==================================== */

export async function loadContent() {
  const [a, f, n] = await Promise.all([
    supabase.from("articles").select("id,slug,title,category,body").eq("published", true).order("created_at"),
    supabase.from("faqs").select("id,question,answer").eq("published", true).order("sort_order"),
    supabase.from("announcements").select("id,title,body,published_at").order("published_at", { ascending: false }).limit(5),
  ]);
  return { articles: ok(a), faqs: ok(f), announcements: ok(n) };
}

export async function updateProfileName(userId, name) {
  ok(await supabase.from("profiles").update({ display_name: cleanText(name) }).eq("id", userId));
}
export async function submitReport(userId, category, details) {
  ok(await supabase.from("reports").insert({ reporter_id: userId, category, details: cleanText(details) }));
}
export const loadMyAccessHistory = () => rpc("get_my_access_history");
export const exportMyData = () => rpc("export_my_data");
export const recordConsent = (termsVersion, healthConsent) =>
  rpc("record_consent", { p_terms_version: termsVersion, p_health_consent: healthConsent === true });

/* ================================= ADMIN =================================== */

export const admin = {
  overview: () => rpc("admin_overview"),
  analytics: () => rpc("admin_analytics"),
  listUsers: (search, limit = 25, offset = 0) => rpc("admin_list_users", { p_search: search || null, p_limit: limit, p_offset: offset }),
  setStatus: (id, status, reason) => rpc("admin_set_user_status", { p_user: id, p_status: status, p_reason: reason }),
  listReports: (status) => rpc("admin_list_reports", { p_status: status || null }),
  updateReport: (id, status, note) => rpc("admin_update_report", { p_id: id, p_status: status, p_note: note || null }),
  readLogs: (id, category, reason, includeNotes) => rpc("admin_read_user_logs", { p_target: id, p_category: category, p_reason: reason, p_include_notes: !!includeNotes }),
  auditLogs: (limit = 50, before = null) => rpc("admin_list_audit_logs", { p_limit: limit, p_before_id: before }),
  async content() {
    const [a, f, s, an, set] = await Promise.all([
      supabase.from("articles").select("id,slug,title,category,body,published").order("created_at"),
      supabase.from("faqs").select("id,question,answer,sort_order,published").order("sort_order"),
      supabase.from("support_suggestions").select("id,suggestion,sort_order,active").order("sort_order"),
      supabase.from("announcements").select("id,title,body,published_at,expires_at").order("created_at", { ascending: false }),
      supabase.from("app_settings").select("key,value"),
    ]);
    return { articles: ok(a), faqs: ok(f), suggestions: ok(s), announcements: ok(an), settings: Object.fromEntries(ok(set).map((r) => [r.key, r.value])) };
  },
  saveArticle: async (a) => {
    const row = { title: cleanText(a.title), category: a.category, body: a.body, published: !!a.published };
    if (a.id) ok(await supabase.from("articles").update(row).eq("id", a.id));
    else ok(await supabase.from("articles").insert({ ...row, slug: slugify(a.title) + "-" + Math.random().toString(36).slice(2, 6) }));
  },
  deleteArticle: async (id) => ok(await supabase.from("articles").delete().eq("id", id)),
  saveFaq: async (f) => (f.id
    ? ok(await supabase.from("faqs").update({ question: cleanText(f.question), answer: cleanText(f.answer), published: f.published !== false }).eq("id", f.id))
    : ok(await supabase.from("faqs").insert({ question: cleanText(f.question), answer: cleanText(f.answer), sort_order: f.sort_order ?? 0 }))),
  deleteFaq: async (id) => ok(await supabase.from("faqs").delete().eq("id", id)),
  addSuggestion: async (text) => ok(await supabase.from("support_suggestions").insert({ suggestion: cleanText(text) })),
  toggleSuggestion: async (id, active) => ok(await supabase.from("support_suggestions").update({ active }).eq("id", id)),
  deleteSuggestion: async (id) => ok(await supabase.from("support_suggestions").delete().eq("id", id)),
  addAnnouncement: async (title, body) => ok(await supabase.from("announcements").insert({ title: cleanText(title), body: cleanText(body), published_at: new Date().toISOString() })),
  deleteAnnouncement: async (id) => ok(await supabase.from("announcements").delete().eq("id", id)),
  setSetting: async (key, value, userId) => ok(await supabase.from("app_settings").upsert({ key, value, updated_by: userId }, { onConflict: "key" })),
};

function slugify(s) {
  return cleanText(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "article";
}

/* ========================= account lifecycle (functions) =================== */

export async function invokeFunction(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    // Edge Functions return { error: "message" } with a non-2xx status
    let msg = error.message;
    try { msg = (await error.context?.json?.())?.error || msg; } catch { /* keep generic */ }
    throw new AppError({ message: msg });
  }
  return data;
}
