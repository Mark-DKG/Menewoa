import React, { useState, useMemo } from "react";
import {
  Home, Users, Settings, BarChart2, BookOpen, Flag, ShieldCheck, Search, Trash2,
  PenLine, LogOut, AlertCircle, Plus, X, ScrollText, Eye
} from "lucide-react";
import { COLORS, displayFont } from "../theme/tokens.js";
import { Button, Card, Field, Input, Toggle, Pill, EmptyState, SectionTitle, BarChart, HBarChart, AppShell } from "../components/ui.jsx";
import { fmt } from "../lib/dates.js";
import { friendlyError } from "../lib/errors.js";
import { useLoader } from "../data/hooks.js";
import { admin as adminApi, invokeFunction } from "../data/api.js";
import { ARTICLE_CATEGORY_LABELS } from "./shared.jsx";

/* Role gating here is for convenience only. Every admin RPC and RLS policy re-checks the
   caller's role in the database, so hiding a tab never grants or removes real access. */
const can = (role, ...allowed) => role === "owner" || allowed.includes(role);
const suppressed = (n) => (n == null ? "<5" : n);
const num = (n) => (n == null ? 0 : n);

const ADMIN_NAV_ALL = [
  { key: "dashboard", label: "Overview", icon: Home },
  { key: "users", label: "Users", icon: Users, roles: ["support"] },
  { key: "reports", label: "Reports", icon: Flag, roles: ["support"] },
  { key: "content", label: "Content", icon: BookOpen, roles: ["content"] },
  { key: "analytics", label: "Analytics", icon: BarChart2 },
  { key: "audit", label: "Audit log", icon: ScrollText, roles: [] },
  { key: "settings", label: "Settings", icon: Settings, roles: [] },
];

function LoadState({ loader, children }) {
  if (loader.status === "loading") return <p role="status" className="text-sm" style={{ color: COLORS.inkSoft }}>Loading…</p>;
  if (loader.status === "error") {
    return (
      <div role="alert" className="rounded-2xl p-4" style={{ backgroundColor: COLORS.dangerSoft }}>
        <p className="text-sm font-semibold mb-2" style={{ color: COLORS.danger }}>{loader.error}</p>
        <Button size="sm" variant="outline" onClick={() => loader.reload().catch(() => {})}>Try again</Button>
      </div>
    );
  }
  return children(loader.data);
}

export function AdminDashboard({ onSessionError }) {
  const loader = useLoader(() => adminApi.overview(), [], onSessionError);
  return (
    <LoadState loader={loader}>
      {(t) => (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              ["Total accounts", t.total_users],
              ["New this week", `+${t.new_users_7d}`],
              ["Active loggers (7d)", suppressed(t.active_loggers_7d)],
              ["Partner connections", t.active_connections],
              ["Open reports", t.open_reports],
              ["Suspended", t.suspended],
            ].map(([label, value]) => (
              <Card key={label}>
                <p className="text-xs font-semibold" style={{ color: COLORS.inkSoft }}>{label}</p>
                <p className="text-2xl font-bold mt-1" style={{ ...displayFont, color: COLORS.wine }}>{value}</p>
              </Card>
            ))}
          </div>
          <Card>
            <p className="text-sm font-semibold mb-1" style={{ color: COLORS.ink }}>Entries logged, last 30 days</p>
            <p className="text-xs mb-3" style={{ color: COLORS.inkSoft }}>Counts only. Values under 5 are hidden to protect privacy.</p>
            <BarChart
              data={[
                { label: "Periods", value: num(t.feature_usage_30d.period_entries) },
                { label: "Moods", value: num(t.feature_usage_30d.mood_entries) },
                { label: "Symptoms", value: num(t.feature_usage_30d.symptom_logs) },
                { label: "Daily", value: num(t.feature_usage_30d.daily_logs) },
              ]}
            />
          </Card>
        </div>
      )}
    </LoadState>
  );
}

const REASON_CATEGORIES = [
  ["user_request", "The user asked me to"],
  ["safety_investigation", "Safety investigation"],
  ["legal_obligation", "Legal obligation"],
  ["technical_support", "Technical support"],
];

/** Break-glass: logs are never shown without a category + written reason, which is audited first. */
function LogViewer({ user, onClose, onSessionError }) {
  const [category, setCategory] = useState("");
  const [reason, setReason] = useState("");
  const [includeNotes, setIncludeNotes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  const open = async () => {
    if (!category) { setError("Choose a reason category."); return; }
    if (reason.trim().length < 10) { setError("Explain the reason in at least 10 characters."); return; }
    setBusy(true);
    setError("");
    try { setData(await adminApi.readLogs(user.id, category, reason.trim(), includeNotes)); }
    catch (e) { if (e?.cause?.status === 401) onSessionError?.(); setError(friendlyError(e.cause || e)); }
    finally { setBusy(false); }
  };

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="font-bold" style={{ ...displayFont, color: COLORS.ink }}>Private logs — {user.display_name}</p>
          <p className="text-xs" style={{ color: COLORS.inkSoft }}>Last 90 days only.</p>
        </div>
        <button onClick={onClose} aria-label="Close"><X size={17} color={COLORS.inkSoft} /></button>
      </div>
      {!data ? (
        <div className="space-y-3">
          <div role="note" className="rounded-2xl px-3.5 py-3 text-xs" style={{ backgroundColor: COLORS.sand, color: COLORS.ink }}>
            This is sensitive health information. Opening it is recorded in the audit log with your name and reason, and the user can see that an administrator accessed their data.
          </div>
          <Field label="Reason category">
            <div className="flex flex-wrap gap-2">
              {REASON_CATEGORIES.map(([k, l]) => <Pill key={k} active={category === k} onClick={() => setCategory(k)}>{l}</Pill>)}
            </div>
          </Field>
          <Field label="Reason (required)" htmlFor="log-reason" hint="E.g. a ticket or report reference and why access is needed.">
            <textarea id="log-reason" rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-2xl border px-4 py-3 text-[15px] outline-none" style={{ borderColor: COLORS.line, backgroundColor: COLORS.inputBg, color: COLORS.ink }} />
          </Field>
          <label className="flex items-start gap-2 text-sm cursor-pointer" style={{ color: COLORS.ink }}>
            <input type="checkbox" checked={includeNotes} onChange={(e) => setIncludeNotes(e.target.checked)} className="mt-1 h-4 w-4" style={{ accentColor: "var(--c-wine)" }} />
            <span>Also show her personal notes <span className="text-xs" style={{ color: COLORS.inkSoft }}>(only if strictly necessary)</span></span>
          </label>
          {error && <p role="alert" className="text-sm" style={{ color: COLORS.danger }}>{error}</p>}
          <Button onClick={open} disabled={busy}>{busy ? "Opening…" : "Record reason and open logs"}</Button>
        </div>
      ) : (
        <LogsResult data={data} />
      )}
    </Card>
  );
}

function LogsResult({ data }) {
  const Section = ({ title, children }) => (
    <div><p className="text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: COLORS.wineSoft }}>{title}</p>{children}</div>
  );
  const empty = <p className="text-xs" style={{ color: COLORS.inkSoft }}>None.</p>;
  return (
    <div className="space-y-4">
      <p role="status" className="text-xs rounded-2xl px-3.5 py-2.5" style={{ backgroundColor: COLORS.sand, color: COLORS.ink }}>This access has been recorded.</p>
      <Section title="Periods">
        {data.period_entries.length ? <ul className="text-sm space-y-0.5" style={{ color: COLORS.ink }}>{data.period_entries.map((p, i) => <li key={i}>{fmt(p.start_date)}{p.end_date ? ` – ${fmt(p.end_date)}` : ""}{p.flow ? ` · ${p.flow}` : ""}</li>)}</ul> : empty}
      </Section>
      <Section title="Moods">
        {data.mood_entries.length ? <p className="text-sm" style={{ color: COLORS.ink }}>{data.mood_entries.map((m) => `${fmt(m.date)} ${m.mood}`).join(" · ")}</p> : empty}
      </Section>
      <Section title="Symptoms">
        {data.symptoms.length ? <p className="text-sm" style={{ color: COLORS.ink }}>{data.symptoms.map((s) => `${fmt(s.date)} ${s.symptom}`).join(" · ")}</p> : empty}
      </Section>
      <Section title="Sleep, energy & notes">
        {data.daily_logs.length ? (
          <ul className="text-sm space-y-0.5" style={{ color: COLORS.ink }}>
            {data.daily_logs.map((d, i) => <li key={i}>{fmt(d.date)}: {d.sleep_hours ?? "–"} h · energy {d.energy_level ?? "–"}{d.note ? ` · “${d.note}”` : ""}</li>)}
          </ul>
        ) : empty}
      </Section>
    </div>
  );
}

export function AdminUsers({ role, userId, act, onSessionError }) {
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const [offset, setOffset] = useState(0);
  const PAGE = 25;
  const loader = useLoader(() => adminApi.listUsers(applied, PAGE, offset), [applied, offset], onSessionError);
  const [viewing, setViewing] = useState(null);
  const [acting, setActing] = useState(null); // {user, kind:'status'|'delete'}
  const [reason, setReason] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [err, setErr] = useState("");

  const runStatus = (u) => {
    if (reason.trim().length < 5) { setErr("Add a reason (at least 5 characters)."); return; }
    const next = u.status === "active" ? "suspended" : "active";
    act(async () => { await adminApi.setStatus(u.id, next, reason.trim()); setActing(null); setReason(""); await loader.reload({ silent: true }); },
      next === "suspended" ? "Account suspended." : "Account reinstated.");
  };
  const runDelete = (u) => {
    if (reason.trim().length < 5) { setErr("Add a reason (at least 5 characters)."); return; }
    if (confirmText !== "DELETE") { setErr("Type DELETE to confirm."); return; }
    act(async () => { await invokeFunction("admin-delete-user", { userId: u.id, reason: reason.trim() }); setActing(null); setReason(""); setConfirmText(""); await loader.reload({ silent: true }); }, "Account deleted.");
  };

  return (
    <div className="space-y-4">
      <form className="relative" role="search" onSubmit={(e) => { e.preventDefault(); setOffset(0); setApplied(query.trim()); }}>
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" color={COLORS.inkSoft} aria-hidden="true" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or email, then press Enter" aria-label="Search users" className="pl-11" />
      </form>

      {viewing && <LogViewer user={viewing} onClose={() => setViewing(null)} onSessionError={onSessionError} />}

      <LoadState loader={loader}>
        {(res) => (
          <>
            <Card padded={false} className="overflow-hidden">
              <div className="divide-y" style={{ borderColor: COLORS.line }}>
                {res.users.length === 0 && <p className="p-5 text-sm" style={{ color: COLORS.inkSoft }}>No matching accounts.</p>}
                {res.users.map((u) => (
                  <div key={u.id} className="px-5 py-3.5">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate" style={{ color: COLORS.ink }}>{u.display_name || "(no name)"}</p>
                        <p className="text-xs truncate" style={{ color: COLORS.inkSoft }}>{u.email} · {u.role} · joined {fmt(u.created_at.slice(0, 10))}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                          style={{ backgroundColor: u.status === "active" ? COLORS.fertileSoft : COLORS.dangerSoft, color: u.status === "active" ? COLORS.fertile : COLORS.danger }}>{u.status}</span>
                        {u.id !== userId && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => { setActing({ user: u, kind: "status" }); setReason(""); setErr(""); }}>{u.status === "active" ? "Suspend" : "Reinstate"}</Button>
                            <Button size="sm" variant="outline" onClick={() => setViewing(u)}><Eye size={14} /> Logs</Button>
                            {role === "owner" && <Button size="sm" variant="ghost" aria-label={`Delete ${u.display_name}`} onClick={() => { setActing({ user: u, kind: "delete" }); setReason(""); setConfirmText(""); setErr(""); }}><Trash2 size={14} color={COLORS.danger} /></Button>}
                          </>
                        )}
                      </div>
                    </div>
                    {acting?.user.id === u.id && (
                      <div role="group" aria-label="Confirm action" className="mt-3 rounded-2xl p-3 space-y-2" style={{ backgroundColor: acting.kind === "delete" ? COLORS.dangerSoft : COLORS.sand }}>
                        {acting.kind === "delete" && <p className="text-xs font-semibold" style={{ color: COLORS.danger }}>Permanently deletes this account and all its data. This cannot be undone.</p>}
                        <Field label="Reason (recorded in the audit log)" htmlFor={`reason-${u.id}`}>
                          <Input id={`reason-${u.id}`} value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} />
                        </Field>
                        {acting.kind === "delete" && (
                          <Field label="Type DELETE to confirm" htmlFor={`confirm-${u.id}`}><Input id={`confirm-${u.id}`} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} /></Field>
                        )}
                        {err && <p role="alert" className="text-xs" style={{ color: COLORS.danger }}>{err}</p>}
                        <div className="flex gap-2">
                          <Button size="sm" variant={acting.kind === "delete" ? "danger" : "primary"} onClick={() => (acting.kind === "delete" ? runDelete(u) : runStatus(u))}>Confirm</Button>
                          <Button size="sm" variant="ghost" onClick={() => setActing(null)}>Cancel</Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
            <div className="flex items-center justify-between text-xs" style={{ color: COLORS.inkSoft }}>
              <span>{res.total} account{res.total === 1 ? "" : "s"}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Previous</Button>
                <Button size="sm" variant="outline" disabled={offset + PAGE >= res.total} onClick={() => setOffset(offset + PAGE)}>Next</Button>
              </div>
            </div>
          </>
        )}
      </LoadState>
    </div>
  );
}

const REPORT_STATUSES = ["open", "in_review", "resolved", "dismissed"];
export function AdminReports({ act, onSessionError }) {
  const [filter, setFilter] = useState("open");
  const loader = useLoader(() => adminApi.listReports(filter === "all" ? null : filter), [filter], onSessionError);
  const [note, setNote] = useState({});
  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {["open", "in_review", "resolved", "dismissed", "all"].map((s) => <Pill key={s} active={filter === s} onClick={() => setFilter(s)}>{s.replace("_", " ")}</Pill>)}
      </div>
      <LoadState loader={loader}>
        {(rows) => rows.length === 0 ? <EmptyState icon={Flag} title="No reports here" body="Nothing matches this filter." /> : (
          <div className="space-y-3">
            {rows.map((r) => (
              <Card key={r.id}>
                <div className="flex items-center gap-2 mb-1"><Flag size={15} color={COLORS.wine} /><p className="font-semibold text-sm" style={{ color: COLORS.ink }}>{String(r.category).replace(/_/g, " ")}</p>
                  <span className="text-xs ml-auto" style={{ color: COLORS.inkSoft }}>{r.status.replace("_", " ")} · {fmt(r.created_at.slice(0, 10))}</span></div>
                <p className="text-sm whitespace-pre-line" style={{ color: COLORS.ink }}>{r.details}</p>
                <p className="text-xs mt-1" style={{ color: COLORS.inkSoft }}>From {r.reporter_name || "a deleted account"}</p>
                {r.resolution_note && <p className="text-xs mt-1" style={{ color: COLORS.inkSoft }}>Note: {r.resolution_note}</p>}
                <div className="flex gap-2 items-end mt-3 flex-wrap">
                  <div className="flex-1 min-w-[10rem]"><Input aria-label="Resolution note" placeholder="Note (optional)" maxLength={2000} value={note[r.id] || ""} onChange={(e) => setNote({ ...note, [r.id]: e.target.value })} /></div>
                  {REPORT_STATUSES.filter((s) => s !== r.status).map((s) => (
                    <Button key={s} size="sm" variant="outline" onClick={() => act(async () => { await adminApi.updateReport(r.id, s, note[r.id]); await loader.reload({ silent: true }); }, `Marked ${s.replace("_", " ")}.`)}>{s.replace("_", " ")}</Button>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}
      </LoadState>
    </div>
  );
}

function TextArea({ id, value, onChange, rows = 6, maxLength }) {
  return <textarea id={id} rows={rows} maxLength={maxLength} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-2xl border px-4 py-3 text-[15px] outline-none" style={{ borderColor: COLORS.line, backgroundColor: COLORS.inputBg, color: COLORS.ink }} />;
}

function ArticleEditor({ article, onSave, onCancel }) {
  const [d, setD] = useState({ title: "", category: "menstrual_cycles", body: "", published: false, ...article });
  const valid = d.title.trim().length >= 3 && d.body.trim().length > 0;
  return (
    <Card className="space-y-3">
      <Field label="Title" htmlFor="art-title"><Input id="art-title" maxLength={160} value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} /></Field>
      <Field label="Category">
        <div className="flex flex-wrap gap-2">{Object.entries(ARTICLE_CATEGORY_LABELS).map(([k, l]) => <Pill key={k} active={d.category === k} onClick={() => setD({ ...d, category: k })}>{l}</Pill>)}</div>
      </Field>
      <Field label="Body" htmlFor="art-body" hint="Plain text. Cite sources and avoid medical claims you can't support."><TextArea id="art-body" maxLength={20000} value={d.body} onChange={(v) => setD({ ...d, body: v })} /></Field>
      <Toggle label="Published" description="Only published articles are visible to users. Review for accuracy first." checked={d.published} onChange={(v) => setD({ ...d, published: v })} />
      <div className="flex gap-2"><Button size="sm" disabled={!valid} onClick={() => onSave(d)}>Save</Button><Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button></div>
    </Card>
  );
}

export function AdminContent({ act, onSessionError }) {
  const loader = useLoader(() => adminApi.content(), [], onSessionError);
  const [section, setSection] = useState("articles");
  const [editing, setEditing] = useState(null); // article | {} for new
  const [faq, setFaq] = useState({ question: "", answer: "" });
  const [sug, setSug] = useState("");
  const [ann, setAnn] = useState({ title: "", body: "" });
  const reload = () => loader.reload({ silent: true });
  const run = (fn, msg) => act(async () => { await fn(); await reload(); }, msg);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {[["articles", "Articles"], ["faqs", "FAQs"], ["suggestions", "Support ideas"], ["announcements", "Announcements"]].map(([k, l]) => <Pill key={k} active={section === k} onClick={() => setSection(k)}>{l}</Pill>)}
      </div>
      <LoadState loader={loader}>
        {(c) => (
          <>
            {section === "articles" && (editing ? (
              <ArticleEditor article={editing} onCancel={() => setEditing(null)} onSave={(a) => run(async () => { await adminApi.saveArticle(a); setEditing(null); }, "Article saved.")} />
            ) : (
              <>
                <Button size="sm" onClick={() => setEditing({})}><Plus size={14} /> New article</Button>
                <Card padded={false}><div className="divide-y" style={{ borderColor: COLORS.line }}>
                  {c.articles.map((a) => (
                    <div key={a.id} className="flex items-center justify-between px-5 py-3.5 gap-2">
                      <div className="min-w-0"><p className="font-semibold text-sm truncate" style={{ color: COLORS.ink }}>{a.title}</p><p className="text-xs" style={{ color: COLORS.inkSoft }}>{ARTICLE_CATEGORY_LABELS[a.category]} · {a.published ? "published" : "draft"}</p></div>
                      <div className="flex shrink-0">
                        <button onClick={() => setEditing(a)} aria-label={`Edit ${a.title}`} className="p-2"><PenLine size={15} color={COLORS.wine} /></button>
                        <button onClick={() => run(() => adminApi.deleteArticle(a.id), "Article deleted.")} aria-label={`Delete ${a.title}`} className="p-2"><Trash2 size={15} color={COLORS.danger} /></button>
                      </div>
                    </div>
                  ))}
                </div></Card>
              </>
            ))}
            {section === "faqs" && (
              <>
                <Card className="space-y-3">
                  <Field label="Question" htmlFor="faq-q"><Input id="faq-q" maxLength={300} value={faq.question} onChange={(e) => setFaq({ ...faq, question: e.target.value })} /></Field>
                  <Field label="Answer" htmlFor="faq-a"><TextArea id="faq-a" rows={3} maxLength={4000} value={faq.answer} onChange={(v) => setFaq({ ...faq, answer: v })} /></Field>
                  <Button size="sm" disabled={faq.question.trim().length < 3 || !faq.answer.trim()} onClick={() => run(async () => { await adminApi.saveFaq({ ...faq, sort_order: c.faqs.length * 10 }); setFaq({ question: "", answer: "" }); }, "FAQ added.")}>Add FAQ</Button>
                </Card>
                <Card padded={false}><div className="divide-y" style={{ borderColor: COLORS.line }}>
                  {c.faqs.map((f) => (
                    <div key={f.id} className="flex items-start justify-between px-5 py-3.5 gap-2"><div><p className="font-semibold text-sm" style={{ color: COLORS.ink }}>{f.question}</p><p className="text-xs" style={{ color: COLORS.inkSoft }}>{f.answer}</p></div>
                      <button onClick={() => run(() => adminApi.deleteFaq(f.id), "FAQ deleted.")} aria-label={`Delete FAQ ${f.question}`} className="p-2"><Trash2 size={15} color={COLORS.danger} /></button></div>
                  ))}
                </div></Card>
              </>
            )}
            {section === "suggestions" && (
              <>
                <Card className="flex gap-2 items-end">
                  <div className="flex-1"><Field label="New idea for partners" htmlFor="sug"><Input id="sug" maxLength={200} value={sug} onChange={(e) => setSug(e.target.value)} /></Field></div>
                  <Button size="sm" disabled={sug.trim().length < 3} onClick={() => run(async () => { await adminApi.addSuggestion(sug); setSug(""); }, "Added.")}>Add</Button>
                </Card>
                <Card padded={false}><div className="divide-y" style={{ borderColor: COLORS.line }}>
                  {c.suggestions.map((s) => (
                    <div key={s.id} className="flex items-center justify-between px-5 py-3 gap-2"><p className="text-sm" style={{ color: COLORS.ink }}>{s.suggestion}</p>
                      <div className="flex items-center shrink-0"><Toggle label="" checked={s.active} onChange={(v) => run(() => adminApi.toggleSuggestion(s.id, v), v ? "Shown to partners." : "Hidden.")} />
                        <button onClick={() => run(() => adminApi.deleteSuggestion(s.id), "Deleted.")} aria-label="Delete idea" className="p-2"><Trash2 size={15} color={COLORS.danger} /></button></div></div>
                  ))}
                </div></Card>
              </>
            )}
            {section === "announcements" && (
              <>
                <Card className="space-y-3">
                  <Field label="Title" htmlFor="ann-t"><Input id="ann-t" maxLength={160} value={ann.title} onChange={(e) => setAnn({ ...ann, title: e.target.value })} /></Field>
                  <Field label="Message" htmlFor="ann-b"><TextArea id="ann-b" rows={3} maxLength={2000} value={ann.body} onChange={(v) => setAnn({ ...ann, body: v })} /></Field>
                  <Button size="sm" disabled={ann.title.trim().length < 3 || !ann.body.trim()} onClick={() => run(async () => { await adminApi.addAnnouncement(ann.title, ann.body); setAnn({ title: "", body: "" }); }, "Announcement published.")}>Publish</Button>
                </Card>
                <Card padded={false}><div className="divide-y" style={{ borderColor: COLORS.line }}>
                  {c.announcements.map((a) => (
                    <div key={a.id} className="flex items-start justify-between px-5 py-3.5 gap-2"><div><p className="font-semibold text-sm" style={{ color: COLORS.ink }}>{a.title}</p><p className="text-xs" style={{ color: COLORS.inkSoft }}>{a.body}</p></div>
                      <button onClick={() => run(() => adminApi.deleteAnnouncement(a.id), "Deleted.")} aria-label={`Delete ${a.title}`} className="p-2"><Trash2 size={15} color={COLORS.danger} /></button></div>
                  ))}
                </div></Card>
              </>
            )}
          </>
        )}
      </LoadState>
    </div>
  );
}

export function AdminAnalytics({ onSessionError }) {
  const loader = useLoader(() => adminApi.analytics(), [], onSessionError);
  return (
    <LoadState loader={loader}>
      {(a) => (
        <div className="space-y-5">
          <div className="flex items-start gap-2 text-xs px-1" style={{ color: COLORS.inkSoft }}>
            <ShieldCheck size={14} className="mt-0.5 shrink-0" />
            <p>Aggregated across users. Groups smaller than {a.k_threshold} are hidden so no individual can be singled out.</p>
          </div>
          <Card>
            <p className="text-sm font-semibold mb-3" style={{ color: COLORS.ink }}>New accounts per week (12 weeks)</p>
            <BarChart data={a.signups_by_week.map((w) => ({ label: fmt(w.week), value: num(w.count) }))} />
          </Card>
          {a.top_symptoms_90d.length > 0 && (
            <Card><p className="text-sm font-semibold mb-3" style={{ color: COLORS.ink }}>Most-logged symptoms (users, 90 days)</p>
              <HBarChart data={a.top_symptoms_90d.map((s) => ({ label: s.name, value: s.users }))} /></Card>
          )}
          {a.mood_distribution_90d.length > 0 && (
            <Card><p className="text-sm font-semibold mb-3" style={{ color: COLORS.ink }}>Moods logged (users, 90 days)</p>
              <HBarChart data={a.mood_distribution_90d.map((s) => ({ label: s.mood, value: s.users }))} color={COLORS.fertile} /></Card>
          )}
          <Card>
            <p className="text-sm font-semibold mb-1" style={{ color: COLORS.ink }}>Typical cycle length</p>
            {a.cycle_stats ? <p className="text-2xl font-bold" style={{ ...displayFont, color: COLORS.wine }}>{a.cycle_stats.avg_cycle_length} days <span className="text-xs font-normal" style={{ color: COLORS.inkSoft }}>across {a.cycle_stats.users} users</span></p>
              : <p className="text-sm" style={{ color: COLORS.inkSoft }}>Not enough data yet to show this without identifying individuals.</p>}
          </Card>
        </div>
      )}
    </LoadState>
  );
}

const ACTION_NAMES = {
  admin_read_user_logs: "Opened user logs", admin_set_user_status: "Changed account status", admin_delete_user: "Deleted account",
  admin_update_report: "Updated report", account_deleted: "Account deleted", data_exported: "User exported data",
};
export function AdminAudit({ onSessionError }) {
  const loader = useLoader(() => adminApi.auditLogs(100), [], onSessionError);
  return (
    <LoadState loader={loader}>
      {(rows) => (
        <div className="space-y-3">
          <p className="text-xs px-1" style={{ color: COLORS.inkSoft }}>Append-only: entries can't be edited or removed. Stored without health data.</p>
          <Card padded={false}><div className="divide-y" style={{ borderColor: COLORS.line }}>
            {rows.length === 0 && <p className="p-5 text-sm" style={{ color: COLORS.inkSoft }}>No entries yet.</p>}
            {rows.map((r) => (
              <div key={r.id} className="px-5 py-3 text-sm" style={{ color: COLORS.ink }}>
                <p className="font-semibold">{ACTION_NAMES[r.action] || r.action}{r.reason_category ? ` · ${String(r.reason_category).replace(/_/g, " ")}` : ""}</p>
                <p className="text-xs" style={{ color: COLORS.inkSoft }}>{new Date(r.created_at).toLocaleString()} · actor {r.actor_id ? r.actor_id.slice(0, 8) : "system"} · target {r.target_user_id ? r.target_user_id.slice(0, 8) : "—"}</p>
                {r.reason && <p className="text-xs mt-0.5" style={{ color: COLORS.inkSoft }}>Reason: {r.reason}</p>}
              </div>
            ))}
          </div></Card>
        </div>
      )}
    </LoadState>
  );
}

export function AdminSettings({ userId, act, onSessionError }) {
  const loader = useLoader(() => adminApi.content(), [], onSessionError);
  const [name, setName] = useState(null);
  return (
    <LoadState loader={loader}>
      {({ settings }) => (
        <div className="space-y-4">
          <Card>
            <p className="text-sm font-semibold mb-3" style={{ color: COLORS.ink }}>Branding</p>
            <Field label="App name" htmlFor="app-name"><Input id="app-name" maxLength={40} value={name ?? settings.app_name ?? "Menewoa"} onChange={(e) => setName(e.target.value)} /></Field>
            <Button size="sm" className="mt-3" disabled={name == null || name.trim().length < 2} onClick={() => act(async () => { await adminApi.setSetting("app_name", name.trim(), userId); await loader.reload({ silent: true }); setName(null); }, "Saved.")}>Save name</Button>
          </Card>
          <Card>
            <p className="text-sm font-semibold mb-1" style={{ color: COLORS.ink }}>Feature switches</p>
            {[["feature_partner_sharing", "Partner sharing"], ["feature_insights", "Insights"], ["feature_education", "Education section"]].map(([k, l]) => (
              <Toggle key={k} label={l} checked={settings[k] !== false} onChange={(v) => act(async () => { await adminApi.setSetting(k, v, userId); await loader.reload({ silent: true }); }, "Saved.")} />
            ))}
          </Card>
          <Card>
            <p className="text-sm font-semibold mb-1" style={{ color: COLORS.ink }}>Require MFA for administrators</p>
            <p className="text-xs flex items-start gap-2" style={{ color: COLORS.inkSoft }}>
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              Currently {settings.require_admin_mfa ? "ON" : "OFF"}. The database enforces this setting, but this app does not yet include an MFA enrolment screen, so the switch is deliberately not available here — turning it on would lock every administrator out. Enrol factors first, then change it from the Supabase SQL editor (see docs/SECURITY.md).
            </p>
          </Card>
        </div>
      )}
    </LoadState>
  );
}

export function AdminApp({ role, userId, act, onLogout, onSessionError }) {
  const nav = ADMIN_NAV_ALL.filter((n) => !n.roles || can(role, ...n.roles));
  const [tab, setTab] = useState("dashboard");
  const titles = { dashboard: "Overview", users: "User management", content: "Content management", reports: "Reports", analytics: "Analytics", audit: "Audit log", settings: "System settings" };
  return (
    <AppShell
      navItems={nav}
      active={tab}
      onNav={setTab}
      wide
      title={titles[tab]}
      headerRight={<Button size="sm" variant="outline" onClick={onLogout}><LogOut size={14} /> Log out</Button>}
    >
      {tab === "dashboard" && <AdminDashboard onSessionError={onSessionError} />}
      {tab === "users" && <AdminUsers role={role} userId={userId} act={act} onSessionError={onSessionError} />}
      {tab === "reports" && <AdminReports act={act} onSessionError={onSessionError} />}
      {tab === "content" && <AdminContent act={act} onSessionError={onSessionError} />}
      {tab === "analytics" && <AdminAnalytics onSessionError={onSessionError} />}
      {tab === "audit" && <AdminAudit onSessionError={onSessionError} />}
      {tab === "settings" && <AdminSettings userId={userId} act={act} onSessionError={onSessionError} />}
    </AppShell>
  );
}
