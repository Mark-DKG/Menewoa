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
import { ThemeToggle } from "../theme/ThemeProvider.jsx";

export function classNames(...parts) {
  return parts.filter(Boolean).join(" ");
}

/* Official Menewoa artwork (public/brand). Two colourways are rendered and CSS
   shows the right one for the active theme: [data-theme="dark"] swaps them. */
export function Logo({ size = 34, variant = "mark", alt = "" }) {
  const lockup = variant === "lockup";
  const base = lockup ? "/brand/logo-lockup" : "/brand/logo-mark";
  const dims = lockup
    ? { height: size, width: "auto", aspectRatio: "1024 / 599" }
    : { height: size, width: "auto", aspectRatio: "437 / 412" };
  return (
    <span className="inline-flex shrink-0" role={alt ? "img" : undefined} aria-label={alt || undefined}>
      <img src={`${base}.png`} alt="" aria-hidden="true" className="brand-img brand-img--light" style={dims} decoding="async" />
      <img src={`${base}-light.png`} alt="" aria-hidden="true" className="brand-img brand-img--dark" style={dims} decoding="async" />
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  className = "",
  type = "button",
  disabled,
  fullWidth,
  size = "md",
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";
  const sizes = { sm: "px-4 py-2 text-sm", md: "px-5 py-3 text-[15px]", lg: "px-7 py-3.5 text-base" };
  const variants = {
    primary: "text-[color:var(--c-on-wine)] shadow-sm hover:shadow-md active:scale-[0.98]",
    secondary: "hover:brightness-95 active:scale-[0.98]",
    ghost: "hover:bg-black/5 active:scale-[0.98]",
    outline: "border-2 bg-transparent active:scale-[0.98]",
    danger: "text-[color:var(--c-on-wine)] hover:brightness-95 active:scale-[0.98]",
  };
  const style =
    variant === "primary"
      ? { backgroundColor: COLORS.wine, focusRingColor: COLORS.wine }
      : variant === "secondary"
      ? { backgroundColor: COLORS.sand, color: COLORS.ink }
      : variant === "outline"
      ? { borderColor: COLORS.wine, color: COLORS.wine }
      : variant === "danger"
      ? { backgroundColor: COLORS.danger }
      : { color: COLORS.wine };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={style}
      className={classNames(base, sizes[size], variants[variant], fullWidth && "w-full", className)}
    >
      {children}
    </button>
  );
}

export function Card({ children, className = "", padded = true }) {
  return (
    <div
      className={classNames("rounded-3xl border", padded && "p-5", className)}
      style={{ backgroundColor: COLORS.white, borderColor: COLORS.line }}
    >
      {children}
    </div>
  );
}

export function Field({ label, children, hint, error, htmlFor }) {
  return (
    <label className="block" htmlFor={htmlFor}>
      <span className="block text-sm font-semibold mb-1.5" style={{ color: COLORS.ink }}>
        {label}
      </span>
      {children}
      {hint && !error && (
        <span className="block text-xs mt-1.5" style={{ color: COLORS.inkSoft }}>
          {hint}
        </span>
      )}
      {error && (
        <span role="alert" className="flex items-center gap-1 text-xs mt-1.5 font-semibold" style={{ color: COLORS.danger }}>
          <CircleAlert size={13} /> {error}
        </span>
      )}
    </label>
  );
}

export function Input(props) {
  return (
    <input
      {...props}
      className={classNames(
        "w-full rounded-2xl border px-4 py-3 text-[15px] outline-none transition focus:ring-2",
        props.className
      )}
      style={{
        borderColor: COLORS.line,
        backgroundColor: COLORS.inputBg,
        color: COLORS.ink,
        ...(props.style || {}),
      }}
    />
  );
}

export function Toggle({ checked, onChange, label, disabled, description }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <p className="text-[15px] font-semibold" style={{ color: COLORS.ink }}>
          {label}
        </p>
        {description && (
          <p className="text-xs mt-0.5" style={{ color: COLORS.inkSoft }}>
            {description}
          </p>
        )}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 disabled:opacity-40"
        style={{ backgroundColor: checked ? COLORS.wine : COLORS.toggleOff }}
      >
        <span
          className="inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform"
          style={{ transform: checked ? "translateX(22px)" : "translateX(4px)" }}
        />
      </button>
    </div>
  );
}

export function Pill({ active, onClick, children, icon: Icon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!active}
      className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition"
      style={{
        backgroundColor: active ? COLORS.wine : COLORS.sand,
        color: active ? COLORS.onWine : COLORS.ink,
      }}
    >
      {Icon && <Icon size={14} />}
      {children}
    </button>
  );
}

export function EmptyState({ icon: Icon = Sparkles, title, body, action }) {
  return (
    <div className="flex flex-col items-center text-center py-10 px-6">
      <div
        className="h-14 w-14 rounded-full flex items-center justify-center mb-4"
        style={{ backgroundColor: COLORS.sand }}
      >
        <Icon size={24} color={COLORS.wine} />
      </div>
      <p className="font-bold text-[17px]" style={{ ...displayFont, color: COLORS.ink }}>
        {title}
      </p>
      <p className="text-sm mt-1.5 max-w-xs" style={{ color: COLORS.inkSoft }}>
        {body}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Toast({ toast }) {
  if (!toast) return null;
  const err = toast.type === "error";
  return (
    <div
      role={err ? "alert" : "status"}
      aria-live={err ? "assertive" : "polite"}
      className="fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-full shadow-lg flex items-center gap-2 text-sm font-semibold max-w-[92vw] animate-[fadein_0.2s_ease]"
      style={{ backgroundColor: err ? COLORS.danger : COLORS.wineDark, color: err ? COLORS.dangerSoft : COLORS.onWine }}
    >
      {err ? <CircleAlert size={16} /> : <CircleCheck size={16} />} {toast.msg}
    </div>
  );
}

export function SectionTitle({ children, sub }) {
  return (
    <div className="mb-4">
      <h2 className="text-xl font-bold" style={{ ...displayFont, color: COLORS.ink }}>
        {children}
      </h2>
      {sub && (
        <p className="text-sm mt-0.5" style={{ color: COLORS.inkSoft }}>
          {sub}
        </p>
      )}
    </div>
  );
}

/* Simple hand-drawn bar chart, no external chart lib so styling stays on-brand */
export function BarChart({ data, unit = "", color = COLORS.wine, height = 140 }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div>
      <div className="flex items-end gap-3" style={{ height }}>
        {data.map((d) => (
          <div key={d.label} className="flex-1 flex flex-col items-center justify-end h-full">
            <span className="text-xs font-bold mb-1" style={{ color: COLORS.ink }}>
              {d.value}
              {unit}
            </span>
            <div
              className="w-full rounded-t-lg transition-all"
              style={{
                height: `${Math.max((d.value / max) * 100, 6)}%`,
                backgroundColor: color,
                opacity: 0.85,
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-3 mt-2">
        {data.map((d) => (
          <div key={d.label} className="flex-1 text-center text-[11px]" style={{ color: COLORS.inkSoft }}>
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export function HBarChart({ data, color = COLORS.wineSoft }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-3">
      {data.map((d) => (
        <div key={d.label}>
          <div className="flex justify-between text-xs mb-1" style={{ color: COLORS.ink }}>
            <span className="font-semibold">{d.label}</span>
            <span style={{ color: COLORS.inkSoft }}>{d.value}</span>
          </div>
          <div className="h-2.5 rounded-full" style={{ backgroundColor: COLORS.sand }}>
            <div
              className="h-2.5 rounded-full"
              style={{ width: `${(d.value / max) * 100}%`, backgroundColor: color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------ Shell / nav ------------------------------ */

export function AppShell({ navItems, active, onNav, title, subtitle, headerRight, children, wide }) {
  return (
    <div className="min-h-screen flex" style={{ backgroundColor: COLORS.page }}>
      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex md:w-64 shrink-0 flex-col border-r px-5 py-6"
        style={{ borderColor: COLORS.line, backgroundColor: COLORS.white }}
      >
        <div className="px-2 mb-8">
          <Logo variant="lockup" size={72} alt="Menewoa" />
        </div>
        <nav aria-label="Main" className="flex flex-col gap-1">
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => onNav(item.key)}
              aria-current={active === item.key ? "page" : undefined}
              className="flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-[15px] font-semibold transition"
              style={{
                backgroundColor: active === item.key ? COLORS.sand : "transparent",
                color: active === item.key ? COLORS.wine : COLORS.inkSoft,
              }}
            >
              <item.icon size={19} />
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top header */}
        <header
          className="sticky top-0 z-30 flex items-center justify-between px-5 md:px-8 py-4 border-b backdrop-blur"
          style={{ borderColor: COLORS.line, backgroundColor: COLORS.headerBg }}
        >
          <div className="flex items-center gap-2 md:hidden">
            <Logo size={30} alt="Menewoa" />
          </div>
          <div className="hidden md:block">
            <h1 className="text-lg font-bold" style={{ ...displayFont, color: COLORS.ink }}>
              {title}
            </h1>
            {subtitle && (
              <p className="text-xs" style={{ color: COLORS.inkSoft }}>
                {subtitle}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {headerRight}
          </div>
        </header>

        <main className={classNames("flex-1 px-5 md:px-8 py-6 pb-28 md:pb-8 w-full mx-auto", wide ? "max-w-6xl" : "max-w-4xl")}>
          <div key={active} className="animate-[screenin_0.22s_ease]">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav
        aria-label="Main"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t flex justify-around py-2"
        style={{ backgroundColor: COLORS.white, borderColor: COLORS.line }}
      >
        {navItems.map((item) => (
          <button
            key={item.key}
            onClick={() => onNav(item.key)}
            aria-label={item.label}
            aria-current={active === item.key ? "page" : undefined}
            className="flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl min-w-[56px]"
          >
            <item.icon size={20} color={active === item.key ? COLORS.wine : COLORS.inkSoft} />
            <span
              className="text-[10.5px] font-semibold"
              style={{ color: active === item.key ? COLORS.wine : COLORS.inkSoft }}
            >
              {item.label}
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
}

/* ================================================================
   LANDING PAGE
   ================================================================ */
