import React, { useState, useMemo } from "react";
import {
  Home, Calendar as CalendarIcon, Bell, Heart, Droplet, Check, ChevronRight, Lock, User,
  BookOpen, Link2, ShieldCheck, Sparkles, Users
} from "lucide-react";
import { COLORS, displayFont } from "../theme/tokens.js";
import { Button, Card, Field, Input, Toggle, EmptyState, SectionTitle, AppShell } from "../components/ui.jsx";
import { daysBetween, fmt } from "../lib/dates.js";
import { validateInviteCode } from "../lib/validation.js";
import { friendlyError } from "../lib/errors.js";
import { ProfileScreen, EducationScreen } from "./shared.jsx";
import { ThemeToggle } from "../theme/ThemeProvider.jsx";

const PERM_LABELS = {
  period_dates: "Period dates",
  expected_period: "Expected period",
  mood: "Mood (last few days)",
  symptoms: "Symptoms (last few days)",
  fertility: "Fertility estimate",
  private_notes: "Her recent notes",
  other_sensitive: "Sleep & energy",
  support_tips: "What helps her",
};

/** Enter a code → see exactly what is offered → explicitly accept. Nothing is linked until step 2. */
export function PartnerConnect({ actions, onConnected, onSkip }) {
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const lookUp = async () => {
    const msg = validateInviteCode(code);
    if (msg) { setError(msg); return; }
    setBusy(true);
    setError("");
    try {
      const r = await actions.preview(code);
      if (!r?.ok) setError("That code isn't valid or has expired. Ask her for a new one.");
      else setPreview(r);
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  };
  const accept = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await actions.redeem(code);
      if (!r?.ok) {
        setError(r?.error === "already_connected" ? "You're already connected to someone. Disconnect first in Profile." : "That code isn't valid or has expired. Ask her for a new one.");
        setPreview(null);
      }
      else { setCode(""); await onConnected(); }
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  };

  if (preview) {
    const shared = Object.entries(PERM_LABELS).filter(([k]) => preview.permissions?.[k]);
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold" style={{ ...displayFont, color: COLORS.ink }}>{preview.from_name} invited you</h2>
        <p className="text-sm" style={{ color: COLORS.inkSoft }}>If you accept, she is choosing to share only this with you:</p>
        {shared.length ? (
          <ul className="space-y-2">
            {shared.map(([k, label]) => (
              <li key={k} className="flex items-center gap-2 text-sm" style={{ color: COLORS.ink }}><Check size={15} color={COLORS.wine} /> {label}</li>
            ))}
          </ul>
        ) : <p className="text-sm" style={{ color: COLORS.ink }}>Nothing yet — she can turn things on later.</p>}
        <p className="text-xs" style={{ color: COLORS.inkSoft }}>Everything else stays private. She can change this or disconnect at any time, and it takes effect immediately. Please treat what you see with care.</p>
        {error && <p role="alert" className="text-sm" style={{ color: COLORS.danger }}>{error}</p>}
        <div className="flex gap-2">
          <Button onClick={accept} disabled={busy}>{busy ? "Connecting…" : "Accept and connect"}</Button>
          <Button variant="outline" onClick={() => { setPreview(null); }} disabled={busy}>Not now</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <Field label="Invitation code" htmlFor="invite-code" hint="Ask her for the code from her Partner tab. It works once and expires after 3 days." error={error}>
        <Input id="invite-code" value={code} autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={14}
          onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABCDE-FGHJK"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); lookUp(); } }} />
      </Field>
      <div className="flex gap-2">
        <Button onClick={lookUp} disabled={busy || !code.trim()}>{busy ? "Checking…" : "Continue"}</Button>
        {onSkip && <Button variant="ghost" onClick={onSkip}>Later</Button>}
      </div>
    </div>
  );
}

export function PartnerOnboarding({ onFinish, actions, initialName = "" }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const done = async () => {
    setBusy(true);
    setError("");
    try { await onFinish(name); } catch (e) { setError(friendlyError(e)); setBusy(false); }
  };
  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative" style={{ backgroundColor: COLORS.sand }}>
      <div className="absolute top-4 right-4"><ThemeToggle /></div>
      <div className="w-full max-w-md">
        <Card className="p-7">
          {step === 0 ? (
            <>
              <h2 className="text-xl font-semibold mb-2" style={{ ...displayFont, color: COLORS.ink }}>Welcome to Menewoa</h2>
              <p className="text-sm mb-5" style={{ color: COLORS.inkSoft }}>
                You'll only ever see what your partner chooses to share — nothing more, and only while she keeps sharing it.
              </p>
              <Field label="What should we call you?" htmlFor="partner-name">
                <Input id="partner-name" value={name} maxLength={60} autoComplete="given-name" onChange={(e) => setName(e.target.value)} />
              </Field>
              <Button fullWidth className="mt-5" onClick={() => setStep(1)}>Continue</Button>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold mb-4" style={{ ...displayFont, color: COLORS.ink }}>Connect with your partner</h2>
              {error && <p role="alert" className="text-sm mb-3" style={{ color: COLORS.danger }}>{error}</p>}
              <PartnerConnect actions={actions} onConnected={done} onSkip={busy ? undefined : done} />
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

const PARTNER_NAV = [
  { key: "home", label: "Home", icon: Home },
  { key: "shared", label: "Shared", icon: CalendarIcon },
  { key: "support", label: "Support", icon: Heart },
  { key: "notifications", label: "Alerts", icon: Bell },
  { key: "profile", label: "Profile", icon: User },
];

function NotConnected({ actions, onConnected }) {
  return (
    <div className="space-y-4">
      <EmptyState icon={Link2} title="Not connected yet" body="When your partner invites you, enter her code here. You'll see exactly what she's sharing before you accept." />
      <Card><PartnerConnect actions={actions} onConnected={onConnected} /></Card>
    </div>
  );
}

const Chip = ({ children }) => (
  <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: COLORS.sand, color: COLORS.wine }}>{children}</span>
);
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function PartnerHome({ partner, view, suggestions }) {
  const name = view.woman_name || "her";
  const sh = view.shared || {};
  const until = view.expected ? daysBetween(view.woman_today, view.expected.next_period_start) : null;
  const onPeriod = view.period && (view.period.last_end ? view.woman_today <= view.period.last_end : daysBetween(view.period.last_start, view.woman_today) < 5 && daysBetween(view.period.last_start, view.woman_today) >= 0);
  const nothingShared = !Object.values(sh).some(Boolean);
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm" style={{ color: COLORS.inkSoft }}>Hi{partner.profile.name ? ` ${partner.profile.name}` : ""}</p>
        <h1 className="text-xl font-bold mt-0.5" style={{ ...displayFont, color: COLORS.ink }}>Here's how {name} is doing</h1>
      </div>
      <Card>
        <div className="space-y-2">
          {sh.expected_period && view.expected && (
            <p className="text-[15px]" style={{ color: COLORS.ink }}>
              {until < 0 ? "Her period may be a little late — estimates are only estimates."
                : until <= 3 ? "Her period may be approaching (an estimate)."
                : `Her period is estimated in about ${until} days.`}
            </p>
          )}
          {sh.period_dates && view.period?.last_start && onPeriod && (
            <p className="text-sm flex items-center gap-1.5" style={{ color: COLORS.wine }}><Droplet size={14} /> Her period started {fmt(view.period.last_start)}.</p>
          )}
          {sh.mood && view.mood?.length > 0 && (
            <p className="text-sm" style={{ color: COLORS.inkSoft }}>Recent mood: <b style={{ color: COLORS.ink }}>{cap(view.mood[0].mood)}</b></p>
          )}
          {nothingShared && <p className="text-sm" style={{ color: COLORS.inkSoft }}>She hasn't shared cycle details with you yet. That's completely her choice.</p>}
        </div>
      </Card>
      <Card>
        <p className="text-sm font-semibold mb-2" style={{ color: COLORS.ink }}>How can I support her?</p>
        <ul className="space-y-2">
          {suggestions.slice(0, 5).map((t, i) => (
            <li key={i} className="flex items-start gap-2 text-sm" style={{ color: COLORS.ink }}><Heart size={13} color={COLORS.wine} className="mt-1 shrink-0" /> {t}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

export function PartnerShared({ view }) {
  const sh = view.shared || {};
  if (!Object.values(sh).some(Boolean)) {
    return <EmptyState icon={Lock} title="Nothing shared yet" body="She hasn't turned on any sharing. Check back later." />;
  }
  const until = view.expected ? daysBetween(view.woman_today, view.expected.next_period_start) : null;
  return (
    <div className="space-y-4">
      <SectionTitle sub="Only what she's chosen to share — a short, recent view.">Shared cycle info</SectionTitle>
      {sh.period_dates && (
        <Card>
          <p className="text-xs font-semibold" style={{ color: COLORS.inkSoft }}>Last period</p>
          <p className="font-bold" style={{ ...displayFont, color: COLORS.ink }}>{view.period?.last_start ? fmt(view.period.last_start) : "—"}</p>
        </Card>
      )}
      {sh.expected_period && view.expected && (
        <Card>
          <p className="text-xs font-semibold" style={{ color: COLORS.inkSoft }}>Estimated next period</p>
          <p className="font-bold" style={{ ...displayFont, color: COLORS.ink }}>
            {fmt(view.expected.next_period_start)} · {until >= 0 ? `in ${until} days` : "may be late"}
          </p>
          <p className="text-[11px] mt-1" style={{ color: COLORS.inkSoft }}>An estimate, not a guarantee.</p>
        </Card>
      )}
      {sh.mood && (
        <Card>
          <p className="text-xs font-semibold mb-1.5" style={{ color: COLORS.inkSoft }}>Mood, recently</p>
          <div className="flex gap-2 flex-wrap">
            {view.mood?.length ? view.mood.map((m, i) => <Chip key={i}>{cap(m.mood)}</Chip>) : <span className="text-xs" style={{ color: COLORS.inkSoft }}>Nothing logged recently.</span>}
          </div>
        </Card>
      )}
      {sh.symptoms && (
        <Card>
          <p className="text-xs font-semibold mb-1.5" style={{ color: COLORS.inkSoft }}>Symptoms, recently</p>
          <div className="flex gap-2 flex-wrap">
            {view.symptoms?.length ? [...new Set(view.symptoms.map((x) => x.name))].map((n) => <Chip key={n}>{n}</Chip>) : <span className="text-xs" style={{ color: COLORS.inkSoft }}>Nothing logged recently.</span>}
          </div>
        </Card>
      )}
      {sh.other_sensitive && (
        <Card>
          <p className="text-xs font-semibold mb-1.5" style={{ color: COLORS.inkSoft }}>Sleep & energy, recently</p>
          {view.wellbeing?.length ? (
            <ul className="text-sm space-y-1" style={{ color: COLORS.ink }}>
              {view.wellbeing.map((w, i) => (
                <li key={i}>{fmt(w.date)}: {w.sleep_hours != null ? `${w.sleep_hours} h sleep` : ""}{w.sleep_hours != null && w.energy_level != null ? " · " : ""}{w.energy_level != null ? `energy ${w.energy_level}/5` : ""}</li>
              ))}
            </ul>
          ) : <span className="text-xs" style={{ color: COLORS.inkSoft }}>Nothing logged recently.</span>}
        </Card>
      )}
      {sh.fertility && view.fertility && (
        <Card>
          <p className="text-xs font-semibold" style={{ color: COLORS.inkSoft }}>Fertile window (estimate)</p>
          <p className="font-bold" style={{ ...displayFont, color: COLORS.ink }}>{fmt(view.fertility.fertile_start)} – {fmt(view.fertility.fertile_end)}</p>
          <p className="text-[11px] mt-1" style={{ color: COLORS.inkSoft }}>Estimates only — not a way to prevent or achieve pregnancy.</p>
        </Card>
      )}
      {sh.private_notes && (
        <Card>
          <p className="text-xs font-semibold mb-1.5" style={{ color: COLORS.inkSoft }}>Notes she chose to share</p>
          {view.notes?.length ? (
            <ul className="space-y-2">{view.notes.map((n, i) => <li key={i} className="text-sm rounded-xl px-3 py-2" style={{ backgroundColor: COLORS.sand, color: COLORS.ink }}><span className="text-[11px] block" style={{ color: COLORS.inkSoft }}>{fmt(n.date)}</span>{n.note}</li>)}</ul>
          ) : <span className="text-xs" style={{ color: COLORS.inkSoft }}>No notes.</span>}
        </Card>
      )}
    </div>
  );
}

export function PartnerSupport({ view, suggestions }) {
  const tips = view.shared?.support_tips ? view.support_tips || [] : [];
  return (
    <div className="space-y-4">
      <SectionTitle sub={view.shared?.support_tips ? `What ${view.woman_name} says helps most.` : "General ideas for showing up."}>Support suggestions</SectionTitle>
      {view.shared?.support_tips && (
        <Card>
          {tips.length ? (
            <ul className="space-y-2">
              {tips.map((t, i) => <li key={i} className="flex items-start gap-2 text-sm rounded-xl px-3 py-2.5" style={{ backgroundColor: COLORS.sand, color: COLORS.ink }}><Heart size={13} color={COLORS.wine} className="mt-1 shrink-0" /> {t}</li>)}
            </ul>
          ) : <p className="text-sm" style={{ color: COLORS.inkSoft }}>She hasn't added any tips yet.</p>}
        </Card>
      )}
      <Card>
        <p className="text-sm font-semibold mb-2" style={{ color: COLORS.ink }}>General ideas</p>
        <ul className="space-y-2 text-sm" style={{ color: COLORS.ink }}>
          {suggestions.map((t, i) => <li key={i} className="flex items-start gap-2"><Check size={13} color={COLORS.wine} className="mt-1 shrink-0" /> {t}</li>)}
        </ul>
      </Card>
    </div>
  );
}

export function PartnerNotifications({ partner, act, actions }) {
  return (
    <div className="space-y-4">
      <SectionTitle>Alerts</SectionTitle>
      <Card>
        <Toggle label="Period updates" description="Gentle heads-ups, only if she shares expected periods." checked={partner.notifications.periodUpdates}
          onChange={(v) => act(() => actions.setNotification("periodUpdates", v))} />
        <Toggle label="App announcements" description="News about Menewoa." checked={partner.notifications.appAnnouncements}
          onChange={(v) => act(() => actions.setNotification("appAnnouncements", v))} />
      </Card>
      <p className="text-xs px-1" style={{ color: COLORS.inkSoft }}>Notifications never include health details unless you and she both enable it.</p>
    </div>
  );
}

export function PartnerApp({ partner, actions, act, content, onLogout, onDelete, onExport, onSubmitReport, onRename, onReload }) {
  const [tab, setTab] = useState("home");
  const [confirm, setConfirm] = useState(null);
  const view = partner.view;
  const suggestions = partner.suggestions;
  const titles = { home: "Home", shared: "Shared cycle", support: "Support", notifications: "Alerts", profile: "Profile", education: "Education" };

  const body = (() => {
    if (tab === "education") return <EducationScreen articles={content.articles} onBack={() => setTab("home")} />;
    if (tab === "notifications") return <PartnerNotifications partner={partner} act={act} actions={actions} />;
    if (tab === "profile") {
      return (
        <ProfileScreen
          name={partner.profile.name} email={partner.profile.email} onRename={onRename}
          onLogout={onLogout} onDelete={onDelete} onExport={onExport} onSubmitReport={onSubmitReport}
          extra={
            <>
              {view.connected && (
                <Card>
                  <p className="text-sm font-semibold mb-1" style={{ color: COLORS.ink }}>Connection</p>
                  <p className="text-xs mb-3" style={{ color: COLORS.inkSoft }}>Connected with {view.woman_name}. You can disconnect at any time; she'll be told only that you disconnected.</p>
                  {confirm ? (
                    <div role="alertdialog" className="rounded-2xl p-3" style={{ backgroundColor: COLORS.dangerSoft }}>
                      <p className="text-xs font-semibold mb-2" style={{ color: COLORS.danger }}>
                        {confirm === "block" ? "Blocking disconnects you and stops this person from inviting you again. Continue?" : "You'll stop seeing anything she shared. Continue?"}
                      </p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="danger" onClick={() => act(async () => { await (confirm === "block" ? actions.block(view.connection_id) : actions.disconnect(view.connection_id)); setConfirm(null); setTab("home"); }, confirm === "block" ? "Blocked and disconnected." : "Disconnected.")}>Yes</Button>
                        <Button size="sm" variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setConfirm("disconnect")}>Disconnect</Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirm("block")}>Block</Button>
                    </div>
                  )}
                </Card>
              )}
              <button onClick={() => setTab("education")} className="w-full flex items-center justify-between rounded-3xl border px-5 py-4" style={{ borderColor: COLORS.line, backgroundColor: COLORS.white }}>
                <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: COLORS.ink }}><BookOpen size={16} color={COLORS.wine} /> Education</span>
                <ChevronRight size={16} color={COLORS.inkSoft} />
              </button>
            </>
          }
        />
      );
    }
    if (!view.connected) return <NotConnected actions={actions} onConnected={onReload} />;
    if (tab === "home") return <PartnerHome partner={partner} view={view} suggestions={suggestions} />;
    if (tab === "shared") return <PartnerShared view={view} />;
    if (tab === "support") return <PartnerSupport view={view} suggestions={suggestions} />;
    return null;
  })();

  return (
    <AppShell navItems={PARTNER_NAV} active={tab === "education" ? null : tab} onNav={setTab} title={titles[tab]}>
      {body}
    </AppShell>
  );
}

