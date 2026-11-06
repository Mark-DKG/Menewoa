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
import { validateReport, validateDisplayName } from "../lib/validation.js";
import { friendlyError } from "../lib/errors.js";

export const REPORT_TYPES = [
  ["harassment", "Harassment"],
  ["abuse", "Abuse"],
  ["suspicious_behavior", "Suspicious behavior"],
  ["privacy_concern", "Privacy concern"],
  ["technical_problem", "Technical problem"],
];
export const ARTICLE_CATEGORY_LABELS = {
  menstrual_cycles: "Menstrual cycles",
  period_symptoms: "Period symptoms",
  pms: "PMS",
  cycle_tracking: "Cycle tracking",
  supporting_a_partner: "Supporting a partner",
  reproductive_health: "Reproductive health",
};
const ACTION_LABELS = {
  admin_read_user_logs: "An administrator viewed your logs",
  admin_set_user_status: "An administrator changed your account status",
  admin_delete_user: "An administrator removed an account",
};

export function ReportForm({ onSubmit }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(REPORT_TYPES[0][0]);
  const [detail, setDetail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (sent) {
    return (
      <div role="status" className="flex items-center gap-2 text-sm font-semibold rounded-2xl px-4 py-3" style={{ backgroundColor: COLORS.fertileSoft, color: COLORS.fertile }}>
        <CircleCheck size={16} /> Thanks — we've received your report.
      </div>
    );
  }
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-2 text-sm font-semibold" style={{ color: COLORS.danger }}>
        <Flag size={15} /> Report a problem
      </button>
    );
  }

  const submit = async () => {
    const v = validateReport(detail);
    if (v) { setError(v); return; }
    setBusy(true);
    setError("");
    try { await onSubmit(type, detail.trim()); setSent(true); }
    catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <Field label="What's this about?">
        <div className="flex flex-wrap gap-2">
          {REPORT_TYPES.map(([key, label]) => <Pill key={key} active={type === key} onClick={() => setType(key)}>{label}</Pill>)}
        </div>
      </Field>
      <Field label="Details" htmlFor="report-details" error={error}>
        <textarea
          id="report-details"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Tell us what happened. Please don't include passwords."
          className="w-full rounded-2xl border px-4 py-3 text-[15px] outline-none"
          style={{ borderColor: COLORS.line, backgroundColor: COLORS.inputBg, color: COLORS.ink }}
        />
      </Field>
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={busy || !detail.trim()}>{busy ? "Sending…" : "Submit report"}</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function PrivacyDashboard({ accessHistory, onExport }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const doExport = async () => {
    setBusy(true);
    setErr("");
    try {
      const data = await onExport();
      downloadJson(`menewoa-my-data-${new Date().toISOString().slice(0, 10)}.json`, data);
    } catch (e) { setErr(friendlyError(e)); }
    finally { setBusy(false); }
  };
  return (
    <Card>
      <p className="text-sm font-semibold mb-1 flex items-center gap-2" style={{ color: COLORS.ink }}><ShieldCheck size={15} color={COLORS.wine} /> Privacy</p>
      <ul className="text-xs space-y-1.5 mb-4" style={{ color: COLORS.inkSoft }}>
        <li>Your logs are protected by row-level security: only you can read them.</li>
        <li>A partner sees only what you switch on, and loses access the moment you turn it off or disconnect.</li>
        <li>Menewoa support staff can open your logs only for a stated reason (for example, a safety report). Every such access is recorded and listed below.</li>
        <li>Nothing here is medical advice, and estimates are not a method of contraception.</li>
      </ul>
      <p className="text-xs font-semibold mb-2" style={{ color: COLORS.ink }}>Who has accessed your account</p>
      {accessHistory == null ? (
        <p className="text-xs" style={{ color: COLORS.inkSoft }}>Couldn't load the access history right now.</p>
      ) : accessHistory.length === 0 ? (
        <p className="text-xs rounded-2xl px-3.5 py-2.5" style={{ backgroundColor: COLORS.sand, color: COLORS.inkSoft }}>No administrator has accessed your data.</p>
      ) : (
        <ul className="space-y-2" aria-label="Administrator access history">
          {accessHistory.map((h, i) => (
            <li key={i} className="text-xs rounded-2xl px-3.5 py-2.5" style={{ backgroundColor: COLORS.sand, color: COLORS.ink }}>
              <span className="font-semibold">{ACTION_LABELS[h.action] || "Administrator action"}</span>
              <br />
              {new Date(h.at).toLocaleString()}
              {h.reason_category ? ` · reason: ${String(h.reason_category).replace(/_/g, " ")}` : ""}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4">
        <Button variant="outline" size="sm" onClick={doExport} disabled={busy}>{busy ? "Preparing…" : "Download my data (JSON)"}</Button>
        {err && <p role="alert" className="text-xs mt-2" style={{ color: COLORS.danger }}>{err}</p>}
        <p className="text-[11px] mt-2" style={{ color: COLORS.inkSoft }}>Your file is created on demand and saved to your device only.</p>
      </div>
    </Card>
  );
}

export function ProfileScreen({ name, email, onRename, onLogout, onDelete, extra, onSubmitReport, accessHistory, onExport }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [delErr, setDelErr] = useState("");
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(name || "");
  const [nameErr, setNameErr] = useState("");

  const saveName = async () => {
    const v = validateDisplayName(nameDraft);
    if (v) { setNameErr(v); return; }
    try { await onRename(nameDraft.trim()); setEditing(false); setNameErr(""); }
    catch (e) { setNameErr(friendlyError(e)); }
  };
  const doDelete = async () => {
    if (!password) { setDelErr("Enter your password to confirm."); return; }
    setDeleting(true);
    setDelErr("");
    try { await onDelete(password); }
    catch (e) { setDelErr(friendlyError(e)); setDeleting(false); }
  };

  return (
    <div className="space-y-5">
      <SectionTitle>Profile</SectionTitle>
      <Card>
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full flex items-center justify-center font-bold shrink-0" style={{ backgroundColor: COLORS.sand, color: COLORS.wine }} aria-hidden="true">
            {name?.[0]?.toUpperCase() || "?"}
          </div>
          <div className="min-w-0 flex-1">
            {editing ? (
              <div className="flex gap-2 items-start">
                <div className="flex-1"><Field label="Your name" htmlFor="profile-name" error={nameErr}><Input id="profile-name" value={nameDraft} maxLength={80} onChange={(e) => setNameDraft(e.target.value)} /></Field></div>
                <Button size="sm" onClick={saveName}>Save</Button>
              </div>
            ) : (
              <>
                <p className="font-bold truncate" style={{ color: COLORS.ink }}>{name}</p>
                <p className="text-sm truncate" style={{ color: COLORS.inkSoft }}>{email}</p>
              </>
            )}
          </div>
          {!editing && onRename && <button onClick={() => { setNameDraft(name || ""); setEditing(true); }} className="text-xs font-semibold" style={{ color: COLORS.wine }}>Edit</button>}
        </div>
      </Card>
      {extra}
      {onExport && <PrivacyDashboard accessHistory={accessHistory} onExport={onExport} />}
      {onSubmitReport && (
        <Card>
          <p className="text-sm font-semibold mb-3" style={{ color: COLORS.ink }}>Safety</p>
          <ReportForm onSubmit={onSubmitReport} />
        </Card>
      )}
      <Card>
        <p className="text-sm font-semibold mb-1" style={{ color: COLORS.ink }}>Account</p>
        <div className="flex flex-col gap-2 mt-3">
          <Button variant="outline" onClick={onLogout} fullWidth><LogOut size={15} /> Log out</Button>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} className="text-sm font-semibold text-center py-2" style={{ color: COLORS.danger }}>Delete account</button>
          ) : (
            <div role="alertdialog" aria-label="Delete account" className="rounded-2xl p-3 mt-1 space-y-2" style={{ backgroundColor: COLORS.dangerSoft }}>
              <p className="text-xs font-semibold" style={{ color: COLORS.danger }}>
                This permanently deletes your account and all your data. It can't be undone. Download your data first if you want a copy.
              </p>
              <Field label="Confirm with your password" htmlFor="delete-password" error={delErr}>
                <Input id="delete-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              <div className="flex gap-2">
                <Button variant="danger" size="sm" onClick={doDelete} disabled={deleting}>{deleting ? "Deleting…" : "Yes, delete everything"}</Button>
                <Button variant="ghost" size="sm" onClick={() => { setConfirmDelete(false); setPassword(""); setDelErr(""); }}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

export function EducationScreen({ articles, onBack }) {
  const [openArticle, setOpenArticle] = useState(null);
  const categories = [...new Set(articles.map((a) => a.category))];
  const label = (c) => ARTICLE_CATEGORY_LABELS[c] || c;

  if (openArticle) {
    return (
      <div className="space-y-4">
        <button onClick={() => setOpenArticle(null)} className="flex items-center gap-1 text-sm font-semibold" style={{ color: COLORS.wine }}>
          <ChevronLeft size={16} /> Back to articles
        </button>
        <Card>
          <span className="text-xs font-bold uppercase tracking-wide" style={{ color: COLORS.wineSoft }}>
            {label(openArticle.category)}
          </span>
          <h2 className="text-xl font-bold mt-1 mb-3" style={{ ...displayFont, color: COLORS.ink }}>
            {openArticle.title}
          </h2>
          <p className="text-[15px] leading-relaxed whitespace-pre-line" style={{ color: COLORS.ink }}>
            {openArticle.body}
          </p>
          <div className="flex items-start gap-2 text-xs mt-5 pt-4 border-t" style={{ color: COLORS.inkSoft, borderColor: COLORS.line }}>
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            <p>General information, not medical advice — see a healthcare professional for anything specific to you.</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-1 text-sm font-semibold" style={{ color: COLORS.wine }}>
        <ChevronLeft size={16} /> Back
      </button>
      <SectionTitle sub="Clear, judgment-free reading on cycles and support.">Education</SectionTitle>
      {categories.length === 0 && <EmptyState icon={BookOpen} title="Nothing here yet" body="Articles will appear here once they're published." />}
      {categories.map((cat) => (
        <div key={cat}>
          <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: COLORS.wineSoft }}>
            {label(cat)}
          </p>
          <div className="space-y-2.5">
            {articles
              .filter((a) => a.category === cat)
              .map((a) => (
                <button key={a.id} onClick={() => setOpenArticle(a)} className="w-full text-left">
                  <Card className="flex items-center justify-between gap-3 hover:shadow-sm transition">
                    <div className="flex items-center gap-3">
                      <BookOpen size={17} color={COLORS.wine} className="shrink-0" />
                      <p className="text-sm font-semibold" style={{ color: COLORS.ink }}>
                        {a.title}
                      </p>
                    </div>
                    <ChevronRight size={16} color={COLORS.inkSoft} />
                  </Card>
                </button>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
