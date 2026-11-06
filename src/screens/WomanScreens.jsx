import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Home, Calendar as CalendarIcon, Activity, BarChart2, Users, Settings,
  Bell, Heart, Droplet, Moon, Smile, Plus, Check, X, ChevronLeft,
  ChevronRight, Lock, Shield, LogOut, User, Mail, Eye, EyeOff, Copy,
  Link2, AlertCircle, TrendingUp, Menu, Sparkles, BookOpen, Flag,
  ShieldCheck, Search, Trash2, CircleCheck, CircleAlert, ArrowRight,
  Coffee, Sun, CloudRain, Frown, Zap, PenLine, ClipboardList
} from "lucide-react";
import { COLORS, displayFont, bodyFont } from "../theme/tokens.js";
import { classNames, Logo, Button, Card, Field, Input, Toggle, Pill, EmptyState, Toast, SectionTitle, BarChart, HBarChart, AppShell } from "../components/ui.jsx";
import { daysBetween, fmt, fmtLong } from "../lib/dates.js";
import { projectedRanges, inRange, describeToday } from "../lib/cycle.js";
import { validatePeriodDates, validateDailyLog, validateCycleSettings } from "../lib/validation.js";
import { ProfileScreen, EducationScreen } from "./shared.jsx";
import { ThemeToggle } from "../theme/ThemeProvider.jsx";
import { pushState, enablePush, disablePush } from "../lib/push.js";

export function WomanOnboarding({ onFinish, today, initialName = "" }) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [consent, setConsent] = useState(false);
  const [data, setData] = useState({
    name: initialName,
    lastPeriod: "",
    cycleLength: 28,
    periodLength: 5,
    tracking: { period: true, symptoms: true, mood: true, sleepEnergy: false, notes: true },
    connectPartner: "later", // 'now' | 'later'
    sharing: {
      periodDates: true,
      expectedPeriod: true,
      mood: false,
      symptoms: false,
      fertility: false,
      notes: false,
      otherSensitive: false,
      supportTips: false,
    },
  });

  const steps = data.connectPartner === "now"
    ? ["Profile", "Last period", "Cycle length", "Period length", "Tracking", "Partner", "Sharing"]
    : ["Profile", "Last period", "Cycle length", "Period length", "Tracking", "Partner"];
  const last = step === steps.length - 1;
  const needsConsent = last && data.connectPartner === "now";

  const finish = async () => {
    setBusy(true);
    setError("");
    try { await onFinish(data); } catch (e) { setError(e?.message || "Something went wrong. Please try again."); setBusy(false); }
  };
  const next = () => (last ? finish() : setStep((s) => s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative" style={{ backgroundColor: COLORS.sand }}>
      <div className="absolute top-4 right-4"><ThemeToggle /></div>
      <div className="w-full max-w-md">
        <div className="flex gap-1.5 mb-6">
          {steps.map((_, i) => (
            <div
              key={i}
              className="h-1.5 flex-1 rounded-full"
              style={{ backgroundColor: i <= step ? COLORS.wine : COLORS.track }}
            />
          ))}
        </div>
        <Card className="p-7">
          <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: COLORS.wineSoft }}>
            Step {step + 1} of {steps.length}
          </p>

          {step === 0 && (
            <>
              <h2 className="text-xl font-semibold mb-4" style={{ ...displayFont, color: COLORS.ink }}>
                What should we call you?
              </h2>
              <Field label="Your name">
                <Input value={data.name} maxLength={60} autoComplete="given-name" onChange={(e) => setData({ ...data, name: e.target.value })} placeholder="Adjoa" />
              </Field>
            </>
          )}

          {step === 1 && (
            <>
              <h2 className="text-xl font-semibold mb-4" style={{ ...displayFont, color: COLORS.ink }}>
                When did your last period start?
              </h2>
              <Field label="First day of your last period" hint="Not sure? Leave it blank and log a period later — you can always add past ones.">
                <Input type="date" value={data.lastPeriod} max={today} onChange={(e) => setData({ ...data, lastPeriod: e.target.value })} />
              </Field>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="text-xl font-semibold mb-4" style={{ ...displayFont, color: COLORS.ink }}>
                What's your typical cycle length?
              </h2>
              <Field label={`${data.cycleLength} days`} hint="Counted from the first day of one period to the first day of the next.">
                <input
                  type="range"
                  min={21}
                  max={40}
                  value={data.cycleLength}
                  onChange={(e) => setData({ ...data, cycleLength: Number(e.target.value) })}
                  className="w-full accent-current"
                  style={{ accentColor: COLORS.wine }}
                />
              </Field>
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="text-xl font-semibold mb-4" style={{ ...displayFont, color: COLORS.ink }}>
                How long does your period usually last?
              </h2>
              <Field label={`${data.periodLength} days`}>
                <input
                  type="range"
                  min={2}
                  max={10}
                  value={data.periodLength}
                  onChange={(e) => setData({ ...data, periodLength: Number(e.target.value) })}
                  className="w-full"
                  style={{ accentColor: COLORS.wine }}
                />
              </Field>
            </>
          )}

          {step === 4 && (
            <>
              <h2 className="text-xl font-semibold mb-4" style={{ ...displayFont, color: COLORS.ink }}>
                What would you like to track?
              </h2>
              <div className="divide-y" style={{ borderColor: COLORS.line }}>
                {[
                  ["period", "Period"],
                  ["symptoms", "Symptoms"],
                  ["mood", "Mood"],
                  ["sleepEnergy", "Sleep & energy"],
                  ["notes", "Notes"],
                ].map(([key, label]) => (
                  <Toggle
                    key={key}
                    label={label}
                    checked={data.tracking[key]}
                    onChange={(v) => setData({ ...data, tracking: { ...data.tracking, [key]: v } })}
                  />
                ))}
              </div>
            </>
          )}

          {step === 5 && (
            <>
              <h2 className="text-xl font-semibold mb-4" style={{ ...displayFont, color: COLORS.ink }}>
                Connect a partner?
              </h2>
              <p className="text-sm mb-4" style={{ color: COLORS.inkSoft }}>
                Totally optional — you can invite someone whenever you're ready. Nothing is shared until they accept a one-time code from you.
              </p>
              <div className="space-y-3">
                <button
                  onClick={() => setData({ ...data, connectPartner: "now" })}
                  aria-pressed={data.connectPartner === "now"}
                  className="w-full text-left rounded-2xl border-2 p-4"
                  style={{
                    borderColor: data.connectPartner === "now" ? COLORS.wine : COLORS.line,
                    backgroundColor: data.connectPartner === "now" ? COLORS.sand : "transparent",
                  }}
                >
                  <p className="font-semibold text-sm" style={{ color: COLORS.ink }}>
                    Invite a partner now
                  </p>
                </button>
                <button
                  onClick={() => setData({ ...data, connectPartner: "later" })}
                  aria-pressed={data.connectPartner === "later"}
                  className="w-full text-left rounded-2xl border-2 p-4"
                  style={{
                    borderColor: data.connectPartner === "later" ? COLORS.wine : COLORS.line,
                    backgroundColor: data.connectPartner === "later" ? COLORS.sand : "transparent",
                  }}
                >
                  <p className="font-semibold text-sm" style={{ color: COLORS.ink }}>
                    Maybe later
                  </p>
                </button>
              </div>
            </>
          )}

          {step === 6 && (
            <>
              <h2 className="text-xl font-semibold mb-4" style={{ ...displayFont, color: COLORS.ink }}>
                What can a partner see?
              </h2>
              <p className="text-sm mb-2" style={{ color: COLORS.inkSoft }}>
                You can change every one of these later, at any time.
              </p>
              <div className="divide-y" style={{ borderColor: COLORS.line }}>
                {[
                  ["periodDates", "Period dates"],
                  ["expectedPeriod", "Expected period"],
                  ["mood", "Mood"],
                  ["symptoms", "Symptoms"],
                  ["fertility", "Fertility information"],
                  ["notes", "Private notes"],
                  ["otherSensitive", "Sleep & energy"],
                  ["supportTips", "\"What helps me\" tips"],
                ].map(([key, label]) => (
                  <Toggle
                    key={key}
                    label={label}
                    checked={data.sharing[key]}
                    onChange={(v) => setData({ ...data, sharing: { ...data.sharing, [key]: v } })}
                  />
                ))}
              </div>
              <label className="flex items-start gap-3 text-sm cursor-pointer mt-4" style={{ color: COLORS.ink }}>
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-4 w-4" style={{ accentColor: "var(--c-wine)" }} />
                <span>I consent to share only the items switched on above with the person who accepts my invitation. I can change or stop this at any time.</span>
              </label>
            </>
          )}

          {error && <p role="alert" className="text-sm mt-4" style={{ color: COLORS.danger }}>{error}</p>}
          <div className="flex gap-3 mt-7">
            {step > 0 && (
              <Button variant="outline" onClick={back} disabled={busy}>
                Back
              </Button>
            )}
            <Button fullWidth onClick={next} disabled={busy || (needsConsent && !consent)}>
              {busy ? "Saving…" : last ? "Finish setup" : "Continue"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

export function WomanHome({ woman, info, setTab, logQuick }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  if (!info) {
    return (
      <EmptyState
        icon={Droplet}
        title="No cycle data yet"
        body="Log your first period to start seeing estimates based on your own history."
        action={<Button onClick={() => setTab("track")}>Log today</Button>}
      />
    );
  }

  const progress = Math.min(100, Math.round((info.cycleDay / info.cycleLengthUsed) * 100));

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm" style={{ color: COLORS.inkSoft }}>
          {greeting}{woman.profile.name ? `, ${woman.profile.name}` : ""}
        </p>
        <h1 className="text-2xl font-bold mt-0.5" style={{ ...displayFont, color: COLORS.wine }}>
          Cycle day {info.cycleDay}
        </h1>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full" style={{ backgroundColor: COLORS.sand, color: COLORS.wine }}>
            {info.phase}
          </span>
          {info.onPeriodNow && (
            <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: COLORS.wine }}>
              <Droplet size={13} /> Period active
            </span>
          )}
        </div>
        <div className="relative h-3 rounded-full mb-3" style={{ backgroundColor: COLORS.sand }}>
          <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${progress}%`, backgroundColor: COLORS.wine }} />
        </div>
        {info.isOverdue ? (
          <p className="text-[15px]" style={{ color: COLORS.ink }}>
            Your period was <b>estimated</b> for {fmt(info.nextPeriodStart)} — it may be <b>{info.overdueDays} {info.overdueDays === 1 ? "day" : "days"} late</b>. Cycles vary; log it when it starts and your estimates will update.
          </p>
        ) : (
          <p className="text-[15px]" style={{ color: COLORS.ink }}>
            {info.daysUntilNext === 0
              ? <>Your next period is <b>estimated</b> to start <b>today</b>.</>
              : <>Your next period is <b>estimated</b> in <b>{info.daysUntilNext} {info.daysUntilNext === 1 ? "day" : "days"}</b> ({fmt(info.nextPeriodStart)}).</>}
          </p>
        )}
        {!info.isOverdue && (
          <p className="text-xs mt-2" style={{ color: COLORS.inkSoft }}>
            Fertile window (estimate): {fmt(info.fertileStart)} – {fmt(info.fertileEnd)}
          </p>
        )}
        {info.suggestCheckIn && (
          <p className="text-xs mt-2" style={{ color: COLORS.inkSoft }}>
            It's been a while since your last logged period. If that's unexpected for you, a healthcare professional can help.
          </p>
        )}
        <p className="text-xs mt-2" style={{ color: COLORS.inkSoft }}>
          Based on {info.cyclesUsed >= 2 ? `your last ${info.cyclesUsed} cycles (about ${info.cycleLengthUsed} days)` : `your setting of ${info.cycleLengthUsed} days — add more periods to personalise this`}.
        </p>
        <p className="text-[11px] mt-3" style={{ color: COLORS.inkSoft }}>
          These are estimates based on your own history, not a medical guarantee.
        </p>
      </Card>

      <div>
        <p className="text-sm font-semibold mb-2.5" style={{ color: COLORS.ink }}>
          Quick log
        </p>
        <div className="grid grid-cols-5 gap-2.5">
          {[
            { key: "period", label: "Period", icon: Droplet },
            { key: "mood", label: "Mood", icon: Smile },
            { key: "symptoms", label: "Symptoms", icon: Activity },
            { key: "flow", label: "Flow", icon: CloudRain },
            { key: "notes", label: "Notes", icon: PenLine },
          ].map((q) => (
            <button
              key={q.key}
              onClick={() => logQuick(q.key)}
              className="flex flex-col items-center gap-1.5 py-3 rounded-2xl"
              style={{ backgroundColor: COLORS.sand }}
            >
              <q.icon size={18} color={COLORS.wine} />
              <span className="text-[11px] font-semibold" style={{ color: COLORS.ink }}>
                {q.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      <Card>
        <p className="text-sm font-semibold mb-3" style={{ color: COLORS.ink }}>
          This cycle at a glance
        </p>
        <CycleRing cycleDay={info.cycleDay} cycleLength={info.cycleLengthUsed} periodLength={woman.cycleSettings.periodLength} info={info} />
      </Card>
    </div>
  );
}

export function CycleRing({ cycleDay: rawDay, cycleLength, periodLength, info }) {
  const cycleDay = Math.min(rawDay, cycleLength); // the ring never goes past a full circle when late
  const size = 180;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const segFor = (fromDay, toDay, color) => {
    const startFrac = (fromDay - 1) / cycleLength;
    const lenFrac = (toDay - fromDay + 1) / cycleLength;
    return (
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={`${lenFrac * c} ${c}`}
        strokeDashoffset={-startFrac * c}
        strokeLinecap="butt"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    );
  };
  const fertileStartDay = daysBetween(info.lastStart, info.fertileStart) + 1;
  const fertileEndDay = daysBetween(info.lastStart, info.fertileEnd) + 1;
  const todayFrac = (cycleDay - 1) / cycleLength;
  const angle = todayFrac * 360 - 90;
  const dotX = size / 2 + r * Math.cos((angle * Math.PI) / 180);
  const dotY = size / 2 + r * Math.sin((angle * Math.PI) / 180);

  return (
    <div className="flex items-center gap-6 flex-wrap">
      <svg width={size} height={size} role="img" aria-label={`Cycle day ${rawDay} of about ${cycleLength}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={COLORS.sand} strokeWidth={stroke} />
        {segFor(1, periodLength, COLORS.wine)}
        {fertileStartDay > 0 && fertileStartDay <= cycleLength && segFor(Math.max(1, fertileStartDay), Math.min(cycleLength, fertileEndDay), COLORS.fertile)}
        <circle cx={dotX} cy={dotY} r={6} fill={COLORS.ink} stroke={COLORS.white} strokeWidth={2} />
        <text x={size / 2} y={size / 2 - 4} textAnchor="middle" fontSize="22" fontWeight="700" fill={COLORS.ink}>
          {rawDay}
        </text>
        <text x={size / 2} y={size / 2 + 16} textAnchor="middle" fontSize="11" fill={COLORS.inkSoft}>
          of ~{cycleLength} days
        </text>
      </svg>
      <div className="space-y-2 text-sm">
        <LegendDot color={COLORS.wine} label="Period" />
        <LegendDot color={COLORS.fertile} label="Fertile window (est.)" />
        <LegendDot color={COLORS.ink} label="Today" ring />
      </div>
    </div>
  );
}

export function LegendDot({ color, label, ring }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-3 w-3 rounded-full inline-block"
        style={{ backgroundColor: ring ? COLORS.white : color, border: ring ? `2px solid ${color}` : "none" }}
      />
      <span style={{ color: COLORS.inkSoft }}>{label}</span>
    </div>
  );
}

const pad = (n) => String(n).padStart(2, "0");
const isoOf = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

export function WomanCalendar({ woman, actions, act, today }) {
  const [monthOffset, setMonthOffset] = useState(0);
  const [selected, setSelected] = useState(null); // ISO date
  const [logStart, setLogStart] = useState("");
  const [logEnd, setLogEnd] = useState("");
  const [formError, setFormError] = useState("");

  const [ty, tm] = today.split("-").map(Number);
  const base = new Date(Date.UTC(ty, tm - 1 + monthOffset, 1));
  const year = base.getUTCFullYear();
  const month = base.getUTCMonth();
  const firstDow = base.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const monthLabel = new Date(Date.UTC(year, month, 15)).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });

  const { periodRanges, fertileRanges } = useMemo(
    () => projectedRanges(woman.periods, woman.cycleSettings, today),
    [woman.periods, woman.cycleSettings, today]
  );
  const symptomDates = useMemo(() => new Set(woman.symptomLogs.map((s) => s.date)), [woman.symptomLogs]);

  const cellInfo = (iso) => {
    const logged = woman.periods.find((p) => inRange(iso, { start: p.start, end: p.end || p.start }));
    const projected = iso >= today && periodRanges.some((r) => inRange(iso, r));
    const fertile = iso >= today && fertileRanges.some((r) => inRange(iso, r));
    return {
      iso,
      logged: !!logged,
      loggedEntry: logged || null,
      predictedPeriod: projected && !logged,
      fertile,
      future: iso > today,
      isToday: iso === today,
      symptomDay: symptomDates.has(iso),
    };
  };
  const selInfo = selected ? cellInfo(selected) : null;

  const choose = (iso) => {
    const info = cellInfo(iso);
    setSelected(iso);
    setLogStart(info.loggedEntry?.start || iso);
    setLogEnd(info.loggedEntry?.end || "");
    setFormError("");
  };

  const saveRange = () => {
    const err = validatePeriodDates(logStart, logEnd || null, today);
    if (err) { setFormError(err); return; }
    setFormError("");
    act(async () => {
      await actions.savePeriod({ id: selInfo?.loggedEntry?.id, start: logStart, end: logEnd || null, flow: selInfo?.loggedEntry?.flow });
      setSelected(null);
    }, selInfo?.loggedEntry ? "Period entry updated." : "Period logged.");
  };
  const removeEntry = () => {
    if (!selInfo?.loggedEntry) return;
    act(async () => { await actions.removePeriod(selInfo.loggedEntry.id); setSelected(null); }, "Entry removed.");
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <button onClick={() => setMonthOffset((m) => m - 1)} aria-label="Previous month" className="p-2 rounded-full" style={{ backgroundColor: COLORS.sand }}>
          <ChevronLeft size={17} color={COLORS.wine} />
        </button>
        <p className="font-bold" style={{ ...displayFont, color: COLORS.ink }} aria-live="polite">{monthLabel}</p>
        <button onClick={() => setMonthOffset((m) => m + 1)} aria-label="Next month" className="p-2 rounded-full" style={{ backgroundColor: COLORS.sand }}>
          <ChevronRight size={17} color={COLORS.wine} />
        </button>
      </div>

      {woman.periods.length === 0 && (
        <p className="text-sm px-1" style={{ color: COLORS.inkSoft }}>
          Tap any day to log a period. Estimates for upcoming periods appear here once you've logged one.
        </p>
      )}

      <Card>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold mb-2" style={{ color: COLORS.inkSoft }} aria-hidden="true">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1" role="grid" aria-label={monthLabel}>
          {Array.from({ length: firstDow }).map((_, i) => <div key={"blank" + i} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const iso = isoOf(year, month, day);
            const info = cellInfo(iso);
            let bg = "transparent";
            let color = COLORS.ink;
            if (info.logged) { bg = COLORS.wine; color = COLORS.onWine; }
            else if (info.predictedPeriod) bg = COLORS.sandDeep;
            else if (info.fertile) bg = COLORS.fertileSoft;
            const status = info.logged ? "period logged" : info.predictedPeriod ? "estimated period" : info.fertile ? "estimated fertile window" : "no entries";
            return (
              <button
                key={day}
                onClick={() => choose(iso)}
                aria-label={`${fmtLong(iso)}, ${status}${info.symptomDay ? ", symptoms logged" : ""}${info.isToday ? ", today" : ""}`}
                aria-pressed={selected === iso}
                className="aspect-square rounded-xl flex flex-col items-center justify-center relative text-[13px] font-semibold"
                style={{ backgroundColor: bg, color, outline: info.isToday ? `2px solid ${COLORS.wine}` : "none", outlineOffset: "-2px" }}
              >
                {day}
                {info.symptomDay && (
                  <span className="absolute bottom-1 h-1 w-1 rounded-full" style={{ backgroundColor: info.logged ? COLORS.onWine : COLORS.wine }} />
                )}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-4 text-xs" style={{ color: COLORS.inkSoft }}>
          <LegendDot color={COLORS.wine} label="Logged period" />
          <LegendDot color={COLORS.sandDeep} label="Estimated period" />
          <LegendDot color={COLORS.fertileSoft} label="Estimated fertile window" />
          <LegendDot color={COLORS.white} ring label="Today" />
        </div>
      </Card>

      {selInfo && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <p className="font-bold" style={{ ...displayFont, color: COLORS.ink }}>{fmtLong(selInfo.iso)}</p>
            <button onClick={() => setSelected(null)} aria-label="Close"><X size={17} color={COLORS.inkSoft} /></button>
          </div>
          <p className="text-sm mb-3" style={{ color: COLORS.inkSoft }}>
            {selInfo.logged ? "Period logged on this day."
              : selInfo.predictedPeriod ? "Estimated period day — not yet logged."
              : selInfo.fertile ? "Estimated fertile window (an estimate only)."
              : "No entries for this day yet."}
          </p>
          <div className="grid grid-cols-2 gap-3 mb-2">
            <Field label="Period start" htmlFor="cal-start">
              <Input id="cal-start" type="date" value={logStart} max={today} onChange={(e) => setLogStart(e.target.value)} />
            </Field>
            <Field label="Period end (optional)" htmlFor="cal-end">
              <Input id="cal-end" type="date" value={logEnd} max={today} min={logStart || undefined} onChange={(e) => setLogEnd(e.target.value)} />
            </Field>
          </div>
          {formError && <p role="alert" className="text-xs mb-2" style={{ color: COLORS.danger }}>{formError}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={saveRange}>{selInfo.loggedEntry ? "Save changes" : "Log period"}</Button>
            {selInfo.loggedEntry && <Button size="sm" variant="outline" onClick={removeEntry}>Remove entry</Button>}
          </div>
        </Card>
      )}
    </div>
  );
}

const MOOD_OPTIONS = [
  { label: "Happy", icon: Smile },
  { label: "Calm", icon: Sun },
  { label: "Irritated", icon: Zap },
  { label: "Sad", icon: Frown },
  { label: "Anxious", icon: CloudRain },
  { label: "Energetic", icon: Sparkles },
  { label: "Tired", icon: Moon },
  { label: "Other", icon: Coffee },
];
const FLOWS = ["Light", "Medium", "Heavy"];

export function WomanTrack({ woman, actions, act, today, initialTab }) {
  const prefs = woman.trackingPrefs;
  const allTabs = [
    ["period", "Period", Droplet, prefs.period],
    ["symptoms", "Symptoms", Activity, prefs.symptoms],
    ["mood", "Mood", Smile, prefs.mood],
    ["more", "Sleep & notes", ClipboardList, prefs.sleepEnergy || prefs.notes],
  ];
  const tabs = allTabs.filter((t) => t[3]);
  const [tab, setTab] = useState(tabs.some((t) => t[0] === initialTab) ? initialTab : tabs[0]?.[0] || "period");
  const todaysSymptoms = woman.symptomLogs.find((l) => l.date === today)?.items || [];
  const todaysMood = woman.moodLogs.find((l) => l.date === today)?.mood || "";
  const todaysDaily = woman.dailyLogs.find((l) => l.date === today);

  const [periodStart, setPeriodStart] = useState(today);
  const [periodEnd, setPeriodEnd] = useState("");
  const [flow, setFlow] = useState("Medium");
  const [periodError, setPeriodError] = useState("");
  const [symptoms, setSymptoms] = useState(todaysSymptoms);
  const [mood, setMood] = useState(todaysMood);
  const [sleep, setSleep] = useState(todaysDaily?.sleep ?? 7);
  const [energy, setEnergy] = useState(todaysDaily?.energy ?? 3);
  const [note, setNote] = useState(todaysDaily?.note ?? "");
  const [noteError, setNoteError] = useState("");

  if (tabs.length === 0) {
    return (
      <EmptyState icon={ClipboardList} title="Nothing turned on to track" body="Choose what you'd like to track from your Profile, then come back here." />
    );
  }

  const savePeriod = () => {
    const err = validatePeriodDates(periodStart, periodEnd || null, today);
    if (err) { setPeriodError(err); return; }
    setPeriodError("");
    const existing = woman.periods.find((p) => p.start === periodStart);
    act(async () => {
      await actions.savePeriod({ id: existing?.id, start: periodStart, end: periodEnd || null, flow });
      setPeriodEnd("");
    }, existing ? "Period entry updated." : "Period logged.");
  };
  const saveSymptoms = () => act(() => actions.saveSymptoms(today, symptoms), symptoms.length ? "Symptoms saved." : "Symptoms cleared.");
  const saveMood = () => { if (mood) act(() => actions.saveMood(today, mood), "Mood saved."); };
  const saveMore = () => {
    const err = validateDailyLog({
      sleepHours: prefs.sleepEnergy ? sleep : null,
      energyLevel: prefs.sleepEnergy ? energy : null,
      note: prefs.notes ? note : "",
    });
    if (err) { setNoteError(err); return; }
    setNoteError("");
    act(() => actions.saveDaily(today, {
      sleep: prefs.sleepEnergy ? sleep : null,
      energy: prefs.sleepEnergy ? energy : null,
      note: prefs.notes ? note : "",
    }), "Saved.");
  };

  return (
    <div className="space-y-5">
      <SectionTitle sub="A few taps is all it takes.">Track today</SectionTitle>
      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="What to track">
        {tabs.map(([key, label, Icon]) => (
          <Pill key={key} active={tab === key} onClick={() => setTab(key)} icon={Icon}>{label}</Pill>
        ))}
      </div>

      {tab === "period" && (
        <Card className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date" htmlFor="tr-start">
              <Input id="tr-start" type="date" value={periodStart} max={today} onChange={(e) => setPeriodStart(e.target.value)} />
            </Field>
            <Field label="End date (optional)" htmlFor="tr-end">
              <Input id="tr-end" type="date" value={periodEnd} max={today} min={periodStart || undefined} onChange={(e) => setPeriodEnd(e.target.value)} />
            </Field>
          </div>
          <Field label="Flow intensity">
            <div className="flex gap-2">
              {FLOWS.map((f) => <Pill key={f} active={flow === f} onClick={() => setFlow(f)}>{f}</Pill>)}
            </div>
          </Field>
          {periodError && <p role="alert" className="text-xs" style={{ color: COLORS.danger }}>{periodError}</p>}
          <Button onClick={savePeriod}>Save period entry</Button>
        </Card>
      )}

      {tab === "symptoms" && (
        <Card className="space-y-4">
          <p className="text-xs" style={{ color: COLORS.inkSoft }}>Saving replaces today's symptoms with what's selected.</p>
          <div className="flex flex-wrap gap-2">
            {woman.symptomCatalog.map((sym) => (
              <Pill key={sym} active={symptoms.includes(sym)} onClick={() => setSymptoms((cur) => (cur.includes(sym) ? cur.filter((x) => x !== sym) : [...cur, sym]))}>
                {sym}
              </Pill>
            ))}
          </div>
          <Button onClick={saveSymptoms}>Save symptoms</Button>
        </Card>
      )}

      {tab === "mood" && (
        <Card>
          <div className="grid grid-cols-4 gap-2.5 mb-4">
            {MOOD_OPTIONS.map((m) => (
              <button
                key={m.label}
                onClick={() => setMood(m.label)}
                aria-pressed={mood === m.label}
                className="flex flex-col items-center gap-1.5 py-3 rounded-2xl"
                style={{ backgroundColor: mood === m.label ? COLORS.wine : COLORS.sand }}
              >
                <m.icon size={18} color={mood === m.label ? COLORS.onWine : COLORS.wine} />
                <span className="text-[10.5px] font-semibold" style={{ color: mood === m.label ? COLORS.onWine : COLORS.ink }}>{m.label}</span>
              </button>
            ))}
          </div>
          <Button onClick={saveMood} disabled={!mood}>Save mood</Button>
        </Card>
      )}

      {tab === "more" && (
        <Card className="space-y-5">
          {prefs.sleepEnergy && (
            <>
              <Field label={`Sleep: ${sleep} hours`} htmlFor="tr-sleep">
                <input id="tr-sleep" type="range" min={0} max={16} step={0.5} value={sleep} onChange={(e) => setSleep(Number(e.target.value))} className="w-full" style={{ accentColor: "var(--c-wine)" }} />
              </Field>
              <Field label={`Energy: ${["Very low", "Low", "Okay", "Good", "Great"][energy - 1] || "Okay"}`} htmlFor="tr-energy">
                <input id="tr-energy" type="range" min={1} max={5} value={energy} onChange={(e) => setEnergy(Number(e.target.value))} className="w-full" style={{ accentColor: "var(--c-wine)" }} />
              </Field>
            </>
          )}
          {prefs.notes && (
            <Field label="Notes" htmlFor="tr-note" hint="Private to you unless you choose to share notes with a partner.">
              <textarea
                id="tr-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                maxLength={1000}
                placeholder="Anything you'd like to remember about today..."
                className="w-full rounded-2xl border px-4 py-3 text-[15px] outline-none"
                style={{ borderColor: COLORS.line, backgroundColor: COLORS.inputBg, color: COLORS.ink }}
              />
            </Field>
          )}
          {noteError && <p role="alert" className="text-xs" style={{ color: COLORS.danger }}>{noteError}</p>}
          <Button onClick={saveMore}>Save</Button>
        </Card>
      )}
    </div>
  );
}

export function WomanInsights({ woman }) {
  const periods = [...woman.periods].sort((a, b) => (a.start < b.start ? -1 : 1));
  const cycleLengths = periods.slice(1)
    .map((p, i) => ({ label: `C${i + 1}`, value: daysBetween(periods[i].start, p.start) }))
    .filter((c) => c.value >= 15 && c.value <= 60); // same plausibility window as the server estimate
  const periodDurations = periods
    .filter((p) => p.end)
    .map((p, i) => ({ label: `P${i + 1}`, value: daysBetween(p.start, p.end) + 1 }));

  const symptomCounts = {};
  woman.symptomLogs.forEach((log) => log.items.forEach((it) => (symptomCounts[it] = (symptomCounts[it] || 0) + 1)));
  const symptomData = Object.entries(symptomCounts).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

  const moodCounts = {};
  woman.moodLogs.forEach((log) => (moodCounts[log.mood] = (moodCounts[log.mood] || 0) + 1));
  const moodData = Object.entries(moodCounts).map(([label, value]) => ({ label, value }));

  const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b.value, 0) / arr.length) : 0);

  if (periods.length < 2) {
    return (
      <EmptyState icon={BarChart2} title="Not enough data yet" body="Log at least two periods and we'll start showing your patterns here. Everything stays estimates based on your own history." />
    );
  }

  return (
    <div className="space-y-5">
      <SectionTitle sub="Your patterns, explained simply.">Insights</SectionTitle>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <p className="text-xs font-semibold" style={{ color: COLORS.inkSoft }}>Average cycle length</p>
          <p className="text-2xl font-bold mt-1" style={{ ...displayFont, color: COLORS.wine }}>
            {avg(cycleLengths) || woman.cycleSettings.cycleLength} days
          </p>
          {!cycleLengths.length && <p className="text-[11px] mt-1" style={{ color: COLORS.inkSoft }}>From your setting</p>}
        </Card>
        <Card>
          <p className="text-xs font-semibold" style={{ color: COLORS.inkSoft }}>Average period duration</p>
          <p className="text-2xl font-bold mt-1" style={{ ...displayFont, color: COLORS.wine }}>
            {avg(periodDurations) || woman.cycleSettings.periodLength} days
          </p>
          {!periodDurations.length && <p className="text-[11px] mt-1" style={{ color: COLORS.inkSoft }}>From your setting</p>}
        </Card>
      </div>

      {cycleLengths.length > 0 && (
        <Card>
          <p className="text-sm font-semibold mb-3" style={{ color: COLORS.ink }}>Cycle history</p>
          <BarChart data={cycleLengths} unit="d" />
        </Card>
      )}
      {symptomData.length > 0 && (
        <Card>
          <p className="text-sm font-semibold mb-3" style={{ color: COLORS.ink }}>Symptom patterns</p>
          <HBarChart data={symptomData} />
        </Card>
      )}
      {moodData.length > 0 && (
        <Card>
          <p className="text-sm font-semibold mb-3" style={{ color: COLORS.ink }}>Mood patterns</p>
          <HBarChart data={moodData} color={COLORS.fertile} />
        </Card>
      )}

      <div className="flex items-start gap-2 text-xs px-1" style={{ color: COLORS.inkSoft }}>
        <AlertCircle size={14} className="mt-0.5 shrink-0" />
        <p>
          These figures come only from what you've logged. They're estimates for your own understanding — not a medical
          diagnosis, and not a method of contraception or of detecting or preventing pregnancy.
        </p>
      </div>
    </div>
  );
}

const SHARE_ROWS = [
  ["periodDates", "Period dates", "When your periods started and ended."],
  ["expectedPeriod", "Expected period", "An estimate of when your next period may start."],
  ["mood", "Mood", "Your last few days of mood entries."],
  ["symptoms", "Symptoms", "Symptoms you logged in the last few days."],
  ["fertility", "Fertility information", "Estimated fertile window. Sensitive — off by default."],
  ["notes", "Private notes", "Your most recent notes. Sensitive — off by default."],
  ["otherSensitive", "Sleep & energy", "Recent sleep and energy levels. Sensitive — off by default."],
  ["supportTips", "\"What helps me\" tips", "The tips you write below, shown on their Support tab."],
];

export function WomanPartner({ woman, actions, act }) {
  const conn = woman.partnerConnection;
  const connected = conn?.status === "connected";
  const invited = conn?.status === "invited";
  const [fresh, setFresh] = useState(null); // the code is shown ONCE; we only store its hash
  const [draft, setDraft] = useState({ periodDates: true, expectedPeriod: true, mood: false, symptoms: false, fertility: false, notes: false, otherSensitive: false, supportTips: false });
  const [consent, setConsent] = useState(false);
  const [confirm, setConfirm] = useState(null); // 'disconnect' | 'block'
  const [newTip, setNewTip] = useState("");

  const createInvite = () =>
    act(async () => { setFresh(await actions.createInvitation(draft)); setConsent(false); }, "Invitation created. Share the code with your partner.");
  const copyCode = async () => {
    try { await navigator.clipboard.writeText(fresh.code); } catch { /* clipboard unavailable */ }
    act(async () => {}, "Code copied.");
  };
  const addTip = () => {
    const t = newTip.trim();
    if (!t) return;
    act(async () => { await actions.addTip(t); setNewTip(""); }, "Tip added.");
  };

  return (
    <div className="space-y-5">
      <SectionTitle sub="Choose exactly what your partner can see.">Partner</SectionTitle>

      <Card>
        {connected ? (
          <div>
            <div className="flex items-center justify-between mb-3 gap-3">
              <div>
                <p className="text-xs font-semibold" style={{ color: COLORS.inkSoft }}>Connected with</p>
                <p className="font-bold" style={{ ...displayFont, color: COLORS.ink }}>{conn.partnerName}</p>
                {conn.since && <p className="text-xs" style={{ color: COLORS.inkSoft }}>Since {fmt(conn.since.slice(0, 10))}</p>}
              </div>
              <Button variant="outline" size="sm" onClick={() => setConfirm("disconnect")}>Disconnect</Button>
            </div>
            {confirm === null && (
              <button onClick={() => setConfirm("block")} className="text-xs font-semibold" style={{ color: COLORS.danger }}>Block this person</button>
            )}
            {confirm && (
              <div role="alertdialog" aria-label="Confirm" className="rounded-2xl p-3" style={{ backgroundColor: COLORS.dangerSoft }}>
                <p className="text-xs font-semibold mb-2" style={{ color: COLORS.danger }}>
                  {confirm === "block"
                    ? "Blocking ends sharing immediately and stops this account from accepting any invitation from you. Are you sure?"
                    : "They will immediately lose access to everything you shared. You can invite them again later with a new code."}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="danger"
                    onClick={() => act(async () => { await (confirm === "block" ? actions.blockConnection(conn.connectionId) : actions.revokeConnection(conn.connectionId)); setConfirm(null); },
                      confirm === "block" ? "Blocked and disconnected." : "Disconnected.")}>
                    {confirm === "block" ? "Yes, block" : "Yes, disconnect"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
                </div>
              </div>
            )}
          </div>
        ) : invited ? (
          <div className="space-y-3">
            <p className="font-bold" style={{ ...displayFont, color: COLORS.ink }}>Invitation waiting</p>
            {fresh ? (
              <div className="rounded-2xl p-4 text-center" style={{ backgroundColor: COLORS.sand }}>
                <p className="text-xs font-semibold" style={{ color: COLORS.inkSoft }}>Share this code (shown only once)</p>
                <p className="text-2xl font-bold tracking-widest my-1" style={{ ...displayFont, color: COLORS.wine }} data-testid="invite-code">{fresh.code}</p>
                <Button size="sm" variant="outline" onClick={copyCode}><Copy size={14} /> Copy</Button>
              </div>
            ) : (
              <p className="text-sm" style={{ color: COLORS.inkSoft }}>
                For your safety, codes are shown only once and can't be retrieved. If you've lost it, create a new one — that cancels this one.
              </p>
            )}
            <p className="text-xs" style={{ color: COLORS.inkSoft }}>
              Expires {conn.expiresAt ? new Date(conn.expiresAt).toLocaleString() : "soon"}. It can be used once.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => act(async () => { await actions.revokeInvitation(); setFresh(null); }, "Invitation cancelled.")}>Cancel invitation</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="font-bold" style={{ ...displayFont, color: COLORS.ink }}>Invite a partner</p>
              <p className="text-sm mt-1" style={{ color: COLORS.inkSoft }}>
                Pick what they may see, then share the one-time code. Nothing is shared until they accept, and you can change it any time.
              </p>
            </div>
            <div className="divide-y" style={{ borderColor: COLORS.line }}>
              {SHARE_ROWS.map(([key, label, description]) => (
                <Toggle key={key} label={label} description={description} checked={draft[key]} onChange={(v) => setDraft({ ...draft, [key]: v })} />
              ))}
            </div>
            <label className="flex items-start gap-3 text-sm cursor-pointer" style={{ color: COLORS.ink }}>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-4 w-4" style={{ accentColor: "var(--c-wine)" }} />
              <span>I consent to share only the items switched on above with the person who accepts this invitation. I can change or stop this at any time.</span>
            </label>
            <Button onClick={createInvite} disabled={!consent}><Link2 size={16} /> Create invitation code</Button>
            {conn?.hasBlocked && (
              <button onClick={() => act(() => actions.unblockAll(), "Blocks removed.")} className="block text-xs font-semibold underline" style={{ color: COLORS.inkSoft }}>
                You've blocked someone. Remove all blocks
              </button>
            )}
          </div>
        )}
      </Card>

      {connected && (
        <Card>
          <p className="text-sm font-semibold mb-1" style={{ color: COLORS.ink }}>What they can see</p>
          <p className="text-xs mb-1" style={{ color: COLORS.inkSoft }}>Changes apply immediately, on their very next view.</p>
          <div className="divide-y" style={{ borderColor: COLORS.line }}>
            {SHARE_ROWS.map(([key, label, description]) => (
              <Toggle key={key} label={label} description={description} checked={!!woman.sharing[key]}
                onChange={(v) => act(() => actions.setSharing(key, v), v ? `Now sharing: ${label}.` : `Stopped sharing: ${label}.`)} />
            ))}
          </div>
        </Card>
      )}

      <Card>
        <p className="text-sm font-semibold mb-1" style={{ color: COLORS.ink }}>Things that help me when I'm on my period</p>
        <p className="text-xs mb-3" style={{ color: COLORS.inkSoft }}>
          Your own tips. They're only shown to a partner if you switch on “What helps me tips” above.
        </p>
        <ul className="space-y-2 mb-3">
          {woman.supportTips.map((t) => (
            <li key={t.id} className="flex items-start justify-between gap-3 text-sm rounded-2xl px-3.5 py-2.5" style={{ backgroundColor: COLORS.sand, color: COLORS.ink }}>
              <span>{t.text}</span>
              <button aria-label={`Remove tip: ${t.text}`} onClick={() => act(() => actions.removeTip(t.id), "Tip removed.")}><X size={15} color={COLORS.inkSoft} /></button>
            </li>
          ))}
          {woman.supportTips.length === 0 && <li className="text-xs" style={{ color: COLORS.inkSoft }}>No tips yet.</li>}
        </ul>
        <div className="flex gap-2">
          <Input value={newTip} onChange={(e) => setNewTip(e.target.value)} placeholder="e.g. A warm drink helps" maxLength={200} aria-label="New tip"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTip(); } }} />
          <Button onClick={addTip} aria-label="Add tip" disabled={!newTip.trim() || woman.supportTips.length >= 20}><Plus size={15} /></Button>
        </div>
      </Card>
    </div>
  );
}

const WOMAN_NAV = [
  { key: "home", label: "Home", icon: Home },
  { key: "calendar", label: "Calendar", icon: CalendarIcon },
  { key: "track", label: "Track", icon: Activity },
  { key: "insights", label: "Insights", icon: BarChart2 },
  { key: "partner", label: "Partner", icon: Users },
  { key: "profile", label: "Profile", icon: User },
];

export function WomanApp({ woman, actions, act, content, today, onLogout, onDelete, onExport, onSubmitReport, onRename, accessHistory }) {
  const [tab, setTab] = useState("home");
  const [trackTab, setTrackTab] = useState(undefined);
  const info = useMemo(
    () => describeToday(woman.periods, woman.cycleSettings, today),
    [woman.periods, woman.cycleSettings, today]
  );

  const logQuick = (key) => {
    setTrackTab(key === "flow" ? "period" : key === "notes" ? "more" : key);
    setTab("track");
  };
  const prefs = woman.notificationPrefs;
  const setPref = (key, v) => act(() => actions.setNotificationPref(key, v));

  const titles = { home: "Home", calendar: "Calendar", track: "Track", insights: "Insights", partner: "Partner", profile: "Profile", education: "Education" };

  return (
    <AppShell navItems={WOMAN_NAV} active={tab === "education" ? null : tab} onNav={(k) => { setTrackTab(undefined); setTab(k); }} title={titles[tab]}>
      {tab === "home" && <WomanHome woman={woman} info={info} setTab={setTab} logQuick={logQuick} />}
      {tab === "calendar" && <WomanCalendar woman={woman} actions={actions} act={act} today={today} />}
      {tab === "track" && <WomanTrack key={trackTab || "track"} woman={woman} actions={actions} act={act} today={today} initialTab={trackTab} />}
      {tab === "insights" && <WomanInsights woman={woman} />}
      {tab === "partner" && <WomanPartner woman={woman} actions={actions} act={act} />}
      {tab === "education" && <EducationScreen articles={content.articles} onBack={() => setTab("home")} />}
      {tab === "profile" && (
        <ProfileScreen
          name={woman.profile.name}
          email={woman.profile.email}
          onRename={onRename}
          onLogout={onLogout}
          onDelete={onDelete}
          onExport={onExport}
          accessHistory={accessHistory}
          onSubmitReport={onSubmitReport}
          extra={
            <>
              <Card>
                <p className="text-sm font-semibold mb-1" style={{ color: COLORS.ink }}>What I track</p>
                <p className="text-xs mb-1" style={{ color: COLORS.inkSoft }}>Choose which categories show up on the Track tab. Turning one off never deletes what you've logged.</p>
                {[["period", "Period"], ["symptoms", "Symptoms"], ["mood", "Mood"], ["sleepEnergy", "Sleep & energy"], ["notes", "Notes"]].map(([key, label]) => (
                  <Toggle key={key} label={label} checked={woman.trackingPrefs[key]} onChange={(v) => act(() => actions.setTrackingPref(key, v))} />
                ))}
              </Card>
              <Card>
                <p className="text-sm font-semibold mb-1" style={{ color: COLORS.ink }}>Cycle settings</p>
                <p className="text-xs mb-3" style={{ color: COLORS.inkSoft }}>Used for estimates until you've logged enough periods for Menewoa to learn your own pattern.</p>
                <CycleSettingsForm woman={woman} actions={actions} act={act} />
              </Card>
              <Card>
                <p className="text-sm font-semibold mb-3" style={{ color: COLORS.ink }}>Notifications</p>
                <PushToggle act={act} />
                <Toggle label="Upcoming period" checked={prefs.upcomingPeriod} description="A heads-up a few days before." onChange={(v) => setPref("upcomingPeriod", v)} />
                <Toggle label="Period started" checked={prefs.periodStarted} description="When your estimated start day arrives." onChange={(v) => setPref("periodStarted", v)} />
                <Toggle label="Tracking reminders" checked={prefs.trackingReminders} description="A gentle nudge to log your day." onChange={(v) => setPref("trackingReminders", v)} />
                <Toggle label="Partner connection" checked={prefs.partnerUpdates} description="When a partner connects or disconnects." onChange={(v) => setPref("partnerUpdates", v)} />
                <Toggle label="App announcements" checked={prefs.announcements} description="News about Menewoa." onChange={(v) => setPref("announcements", v)} />
                <Toggle label="Show details on lock screen" checked={prefs.revealOnLockscreen} description="Off by default — notifications stay generic until you open the app." onChange={(v) => setPref("revealOnLockscreen", v)} />
              </Card>
              <button onClick={() => setTab("education")} className="w-full flex items-center justify-between rounded-3xl border px-5 py-4" style={{ borderColor: COLORS.line, backgroundColor: COLORS.white }}>
                <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: COLORS.ink }}><BookOpen size={16} color={COLORS.wine} /> Education</span>
                <ChevronRight size={16} color={COLORS.inkSoft} />
              </button>
            </>
          }
        />
      )}
    </AppShell>
  );
}

function PushToggle({ act }) {
  const [state, setState] = useState("unsupported");
  useEffect(() => { let live = true; pushState().then((s) => live && setState(s)); return () => { live = false; }; }, []);
  if (state === "unsupported") return null;
  const on = state === "on";
  return (
    <Toggle
      label="Notifications on this device"
      checked={on}
      disabled={state === "denied"}
      description={state === "denied" ? "Blocked in your browser settings." : "Messages are generic — they never include health details unless you turn on lock-screen details."}
      onChange={(v) => act(async () => { await (v ? enablePush() : disablePush()); setState(v ? "on" : "off"); }, v ? "Notifications turned on." : "Notifications turned off.")}
    />
  );
}

function CycleSettingsForm({ woman, actions, act }) {
  const [cl, setCl] = useState(woman.cycleSettings.cycleLength);
  const [pl, setPl] = useState(woman.cycleSettings.periodLength);
  const dirty = cl !== woman.cycleSettings.cycleLength || pl !== woman.cycleSettings.periodLength;
  const err = validateCycleSettings(cl, pl);
  return (
    <div className="space-y-4">
      <Field label={`Typical cycle length: ${cl} days`} htmlFor="set-cl">
        <input id="set-cl" type="range" min={21} max={40} value={cl} onChange={(e) => setCl(Number(e.target.value))} className="w-full" style={{ accentColor: "var(--c-wine)" }} />
      </Field>
      <Field label={`Typical period length: ${pl} days`} htmlFor="set-pl">
        <input id="set-pl" type="range" min={2} max={10} value={pl} onChange={(e) => setPl(Number(e.target.value))} className="w-full" style={{ accentColor: "var(--c-wine)" }} />
      </Field>
      {err && <p role="alert" className="text-xs" style={{ color: COLORS.danger }}>{err}</p>}
      <Button size="sm" disabled={!dirty || !!err} onClick={() => act(() => actions.setCycleSettings({ cycleLength: cl, periodLength: pl }), "Cycle settings saved.")}>Save</Button>
    </div>
  );
}

/* ================================================================
   PARTNER APP
   ================================================================ */

const PARTNER_NAV = [
  { key: "home", label: "Home", icon: Home },
  { key: "shared", label: "Shared", icon: CalendarIcon },
  { key: "support", label: "Support", icon: Heart },
  { key: "notifications", label: "Alerts", icon: Bell },
  { key: "profile", label: "Profile", icon: User },
];
