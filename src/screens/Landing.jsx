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
import { ThemeToggle } from "../theme/ThemeProvider.jsx";

export function Landing({ goTo }) {
  return (
    <div style={{ backgroundColor: COLORS.white }}>
      <header className="flex items-center justify-between px-6 md:px-12 py-5 max-w-6xl mx-auto">
        <div className="flex items-center">
          <Logo variant="lockup" size={56} alt="Menewoa" />
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <button
            onClick={() => goTo("login")}
            className="text-sm font-semibold px-4 py-2"
            style={{ color: COLORS.wine }}
          >
            Log in
          </button>
          <Button onClick={() => goTo("signup")} size="sm">
            Get started
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="px-6 md:px-12 max-w-6xl mx-auto pt-8 md:pt-16 pb-16 grid md:grid-cols-2 gap-10 items-center">
        <div>
          <h1
            className="text-4xl md:text-5xl leading-[1.08] font-semibold"
            style={{ ...displayFont, color: COLORS.ink }}
          >
            Together, One Step Ahead.
          </h1>
          <p className="mt-5 text-lg max-w-md" style={{ color: COLORS.inkSoft }}>
            A private menstrual cycle companion designed to help women understand their
            cycles, and help the people who love them offer better support.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={() => goTo("signup")}>
              Get started <ArrowRight size={17} />
            </Button>
            <Button size="lg" variant="outline" onClick={() => goTo("login")}>
              Login
            </Button>
          </div>
        </div>
        <div className="flex justify-center">
          <div
            className="w-full max-w-sm rounded-[2.5rem] border p-6"
            style={{ backgroundColor: COLORS.sand, borderColor: COLORS.sandDeep }}
          >
            <Card className="shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: COLORS.inkSoft }}>
                Example
              </p>
              <p className="text-sm mt-1" style={{ color: COLORS.inkSoft }}>
                Good evening
              </p>
              <p className="text-2xl font-bold mt-1" style={{ ...displayFont, color: COLORS.wine }}>
                Cycle day 18
              </p>
              <p className="text-sm mt-2" style={{ color: COLORS.ink }}>
                Your next period is estimated in <b>10 days</b>.
              </p>
              <div className="mt-4 h-2 rounded-full" style={{ backgroundColor: COLORS.sand }}>
                <div className="h-2 rounded-full w-[62%]" style={{ backgroundColor: COLORS.wine }} />
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Feature sections */}
      <section className="px-6 md:px-12 max-w-6xl mx-auto py-10 grid md:grid-cols-3 gap-5">
        {[
          { icon: Droplet, title: "Track your cycle", body: "Log periods, symptoms and mood in a few taps, at your own pace." },
          { icon: TrendingUp, title: "Understand your patterns", body: "See your averages and trends over time, explained simply." },
          { icon: Link2, title: "Share what matters", body: "Choose exactly what a partner can see — and change it whenever you like." },
          { icon: Heart, title: "Support each other", body: "Partners get gentle, practical suggestions instead of raw data." },
          { icon: ShieldCheck, title: "Privacy first", body: "Your health information is private by default, always." },
          { icon: BookOpen, title: "Learn as you go", body: "Clear, judgment-free articles about cycles, PMS, and support." },
        ].map((f) => (
          <Card key={f.title} className="border-0" >
            <div
              className="h-11 w-11 rounded-2xl flex items-center justify-center mb-3"
              style={{ backgroundColor: COLORS.sand }}
            >
              <f.icon size={20} color={COLORS.wine} />
            </div>
            <p className="font-bold text-[16px]" style={{ ...displayFont, color: COLORS.ink }}>
              {f.title}
            </p>
            <p className="text-sm mt-1" style={{ color: COLORS.inkSoft }}>
              {f.body}
            </p>
          </Card>
        ))}
      </section>

      {/* Privacy statement */}
      <section className="px-6 md:px-12 py-14" style={{ backgroundColor: COLORS.sand }}>
        <div className="max-w-3xl mx-auto text-center">
          <Shield size={26} color={COLORS.wine} className="mx-auto mb-4" />
          <h2 className="text-2xl font-semibold" style={{ ...displayFont, color: COLORS.ink }}>
            Our privacy statement
          </h2>
          <PrivacyStatement />
          <button onClick={() => goTo("privacy")} className="mt-4 text-sm font-semibold underline" style={{ color: COLORS.wine }}>
            Read the full privacy policy
          </button>
        </div>
      </section>

      <footer className="px-6 md:px-12 py-8 flex flex-col md:flex-row items-center justify-between gap-3 max-w-6xl mx-auto">
        <p className="text-xs" style={{ color: COLORS.inkSoft }}>
          © 2026 Menewoa. Together, One Step Ahead.
        </p>
        <nav aria-label="Legal" className="flex items-center gap-4">
          <button onClick={() => goTo("terms")} className="text-xs underline" style={{ color: COLORS.inkSoft }}>
            Terms
          </button>
          <button onClick={() => goTo("privacy")} className="text-xs underline" style={{ color: COLORS.inkSoft }}>
            Privacy
          </button>
        </nav>
      </footer>
    </div>
  );
}

/* ================================================================
   AUTH SCREENS
   ================================================================ */


export function PrivacyStatement({ full = false }) {
  const p = "mt-4 text-[15px] leading-relaxed";
  return (
    <div className={full ? "text-left" : ""} style={{ color: COLORS.inkSoft }}>
      <p className={p}>
        Everything you log in Menewoa belongs to you. It is private by default and is never shared with a
        partner unless you turn sharing on — and you can change or stop sharing at any moment. We don't sell
        your data or use it for advertising. Cycle predictions are estimates from your own history: never a
        medical diagnosis, and never a form of contraception.
      </p>
      <p className={p}>
        <b style={{ color: COLORS.ink }}>Limited, audited administrator access.</b> To run and protect the
        service, a small number of authorised administrators can see account-level details (such as your name
        and email) and anonymous, aggregated statistics. In rare cases — when you ask us for support, or to
        investigate a serious safety report — an administrator may need to view your logs. That access
        requires a recorded reason, is rate-limited, is written to a permanent audit log, and appears in your
        Privacy dashboard so you can see when it happened.
      </p>
      <p className={p}>
        You can export or permanently delete all of your data at any time from Profile → Privacy.
      </p>
    </div>
  );
}
