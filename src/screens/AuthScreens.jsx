import React, { useState } from "react";
import { ChevronLeft, Eye, EyeOff, Mail, Droplet, Heart, CircleAlert, ShieldCheck, Lock } from "lucide-react";
import { COLORS, displayFont } from "../theme/tokens.js";
import { Logo, Button, Card, Field, Input, EmptyState } from "../components/ui.jsx";
import { ThemeToggle } from "../theme/ThemeProvider.jsx";
import { useAuth } from "../auth/AuthProvider.jsx";
import { LegalLink } from "./Legal.jsx";
import { LEGAL, fill } from "../config/legal.js";
import { validateEmail, validatePassword, validateDisplayName } from "../lib/validation.js";

export function AuthShell({ children, onBack, backLabel = "Back" }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: COLORS.sand }}>
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          {onBack ? (
            <button onClick={onBack} className="flex items-center gap-1 text-sm font-semibold" style={{ color: COLORS.wine }}>
              <ChevronLeft size={16} /> {backLabel}
            </button>
          ) : <span />}
          <ThemeToggle />
        </div>
        <Card className="p-7">{children}</Card>
      </div>
    </div>
  );
}

function ErrorBanner({ children }) {
  if (!children) return null;
  return (
    <div role="alert" className="flex items-start gap-2 text-sm font-semibold mb-4 px-3 py-2 rounded-xl" style={{ backgroundColor: COLORS.dangerSoft, color: COLORS.danger }}>
      <CircleAlert size={15} className="mt-0.5 shrink-0" /> <span>{children}</span>
    </div>
  );
}

function PasswordInput({ id, value, onChange, autoComplete, placeholder = "••••••••" }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input id={id} type={show ? "text" : "password"} value={value} onChange={onChange} autoComplete={autoComplete} placeholder={placeholder} className="pr-11" maxLength={128} />
      <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3.5 top-1/2 -translate-y-1/2" aria-label={show ? "Hide password" : "Show password"}>
        {show ? <EyeOff size={17} color={COLORS.inkSoft} /> : <Eye size={17} color={COLORS.inkSoft} />}
      </button>
    </div>
  );
}

/* --------------------------------- Sign up -------------------------------- */
export function SignUp({ goTo }) {
  const auth = useAuth();
  const [role, setRole] = useState("woman");
  const [form, setForm] = useState({ name: "", email: "", password: "", agree: false, healthConsent: false });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    const errs = {
      name: validateDisplayName(form.name),
      email: validateEmail(form.email),
      password: validatePassword(form.password),
      agree: form.agree ? null : "Please confirm to continue.",
      // Health information is "special" data: it needs its own, explicit, unticked-by-default consent.
      healthConsent: role === "woman" && !form.healthConsent ? "We need your consent to store the health information you log." : null,
    };
    Object.keys(errs).forEach((k) => !errs[k] && delete errs[k]);
    setErrors(errs);
    setFormError("");
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const r = await auth.signUp({ ...form, role, healthConsent: role === "woman" && form.healthConsent });
      if (r.needsVerification) setSentTo(form.email.trim());
      // else: a session exists and the route guard moves us on to onboarding
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (sentTo) return <CheckEmail email={sentTo} goTo={goTo} />;

  return (
    <AuthShell onBack={() => goTo("landing")}>
      <Logo variant="lockup" size={64} alt="Menewoa" />
      <h2 className="text-2xl font-semibold mt-3" style={{ ...displayFont, color: COLORS.ink }}>Create your account</h2>
      <p className="text-sm mt-1 mb-5" style={{ color: COLORS.inkSoft }}>A private space, made for you.</p>
      <ErrorBanner>{formError}</ErrorBanner>

      <fieldset className="mb-5">
        <legend className="sr-only">I am…</legend>
        <div className="grid grid-cols-2 gap-3">
          {[
            { key: "woman", label: "I'm tracking my cycle", icon: Droplet },
            { key: "partner", label: "I'm supporting a partner", icon: Heart },
          ].map((opt) => (
            <button key={opt.key} type="button" aria-pressed={role === opt.key} onClick={() => setRole(opt.key)}
              className="rounded-2xl border-2 p-4 text-left transition"
              style={{ borderColor: role === opt.key ? COLORS.wine : COLORS.line, backgroundColor: role === opt.key ? COLORS.sand : "transparent" }}>
              <opt.icon size={18} color={COLORS.wine} />
              <p className="text-sm font-semibold mt-2" style={{ color: COLORS.ink }}>{opt.label}</p>
            </button>
          ))}
        </div>
      </fieldset>

      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Your name" error={errors.name}>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Adjoa" autoComplete="given-name" maxLength={80} />
        </Field>
        <Field label="Email" error={errors.email}>
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@email.com" autoComplete="email" inputMode="email" maxLength={254} />
        </Field>
        <Field label="Password" error={errors.password} hint="At least 10 characters, with a letter and a number.">
          <PasswordInput value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
        </Field>
        <div>
          <label className="flex items-start gap-3 text-sm cursor-pointer" style={{ color: COLORS.ink }}>
            <input type="checkbox" checked={form.agree} onChange={(e) => setForm({ ...form, agree: e.target.checked })} className="mt-1 h-4 w-4" style={{ accentColor: "var(--c-wine)" }} />
            <span>
              I'm 18 or over and I agree to the <LegalLink to="terms">Terms of Service</LegalLink> and have read
              the <LegalLink to="privacy">Privacy Policy</LegalLink>. I understand Menewoa gives estimates for
              personal tracking — it isn't medical advice or contraception.
            </span>
          </label>
          {errors.agree && <p role="alert" className="text-xs font-semibold mt-1.5" style={{ color: COLORS.danger }}>{errors.agree}</p>}
        </div>
        {role === "woman" && (
          <div>
            <label className="flex items-start gap-3 text-sm cursor-pointer" style={{ color: COLORS.ink }}>
              <input type="checkbox" checked={form.healthConsent} onChange={(e) => setForm({ ...form, healthConsent: e.target.checked })} className="mt-1 h-4 w-4" style={{ accentColor: "var(--c-wine)" }} />
              <span>
                I explicitly consent to Menewoa storing and processing the health information I choose to log
                (such as periods, symptoms and mood) to provide the service. I can withdraw this at any time by
                deleting my data or account.
              </span>
            </label>
            {errors.healthConsent && <p role="alert" className="text-xs font-semibold mt-1.5" style={{ color: COLORS.danger }}>{errors.healthConsent}</p>}
          </div>
        )}
        <Button type="submit" fullWidth size="lg" disabled={busy}>{busy ? "Creating account…" : "Create account"}</Button>
      </form>
      <p className="text-sm text-center mt-5" style={{ color: COLORS.inkSoft }}>
        Already have an account?{" "}
        <button onClick={() => goTo("login")} className="font-semibold" style={{ color: COLORS.wine }}>Log in</button>
      </p>
    </AuthShell>
  );
}

function CheckEmail({ email, goTo }) {
  const auth = useAuth();
  const [again, setAgain] = useState(false);
  return (
    <AuthShell onBack={() => goTo("landing")}>
      <EmptyState
        icon={Mail}
        title="Check your email"
        body={`If ${email} can be used for a new account, we've sent a confirmation link. Open it on this device to finish signing up.`}
        action={
          <div className="flex flex-col gap-2 items-center">
            <Button variant="outline" disabled={again} onClick={async () => { await auth.resendVerification(email); setAgain(true); }}>
              {again ? "Sent again — check your inbox" : "Resend the email"}
            </Button>
            <button onClick={() => goTo("login")} className="text-sm font-semibold" style={{ color: COLORS.wine }}>Back to log in</button>
          </div>
        }
      />
    </AuthShell>
  );
}

/* ---------------------------------- Log in -------------------------------- */
export function Login({ goTo }) {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [fails, setFails] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);

  const submit = async (e) => {
    e.preventDefault();
    if (Date.now() < lockedUntil) {
      setError("Too many attempts. Please wait a moment before trying again.");
      return;
    }
    if (!email.trim() || !password) {
      setError("Enter your email and password to continue.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await auth.signIn({ email, password });
      setFails(0);
    } catch (err) {
      const n = fails + 1;
      setFails(n);
      if (n >= 5) setLockedUntil(Date.now() + 30000); // courtesy delay; real limits are enforced server-side
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell onBack={() => goTo("landing")}>
      <h2 className="text-2xl font-semibold" style={{ ...displayFont, color: COLORS.ink }}>Welcome back</h2>
      <p className="text-sm mt-1 mb-5" style={{ color: COLORS.inkSoft }}>Log in to see how your cycle is going.</p>
      {auth.notice && (
        <div role="status" className="flex items-start gap-2 text-sm font-semibold mb-4 px-3 py-2 rounded-xl" style={{ backgroundColor: COLORS.goldSoft, color: COLORS.gold }}>
          <Lock size={15} className="mt-0.5 shrink-0" /> <span>{auth.notice}</span>
        </div>
      )}
      <ErrorBanner>{error}</ErrorBanner>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" autoComplete="username" inputMode="email" maxLength={254} />
        </Field>
        <Field label="Password">
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </Field>
        <div className="flex justify-end">
          <button type="button" onClick={() => goTo("forgot")} className="text-xs font-semibold" style={{ color: COLORS.wine }}>Forgot password?</button>
        </div>
        <Button type="submit" fullWidth size="lg" disabled={busy}>{busy ? "Logging in…" : "Log in"}</Button>
      </form>
      <p className="text-sm text-center mt-5" style={{ color: COLORS.inkSoft }}>
        New to Menewoa?{" "}
        <button onClick={() => goTo("signup")} className="font-semibold" style={{ color: COLORS.wine }}>Create an account</button>
      </p>
    </AuthShell>
  );
}

/* ----------------------------- Forgot / reset ----------------------------- */
export function Forgot({ goTo }) {
  const auth = useAuth();
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    const v = validateEmail(email);
    if (v) return setError(v);
    setError("");
    setBusy(true);
    await auth.sendReset(email);
    setBusy(false);
    setSent(true);
  };
  return (
    <AuthShell onBack={() => goTo("login")}>
      <h2 className="text-2xl font-semibold" style={{ ...displayFont, color: COLORS.ink }}>Reset your password</h2>
      {sent ? (
        <EmptyState icon={Mail} title="Check your email"
          body="If an account exists for that address, we've sent a link to reset your password. It expires soon, so use it shortly."
          action={<Button variant="outline" onClick={() => goTo("login")}>Back to log in</Button>} />
      ) : (
        <>
          <p className="text-sm mt-1 mb-5" style={{ color: COLORS.inkSoft }}>Enter the email on your account and we'll send you a reset link.</p>
          <ErrorBanner>{error}</ErrorBanner>
          <form onSubmit={submit} className="space-y-4" noValidate>
            <Field label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" autoComplete="email" inputMode="email" maxLength={254} />
            </Field>
            <Button type="submit" fullWidth size="lg" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</Button>
          </form>
        </>
      )}
    </AuthShell>
  );
}

export function ResetPassword({ goTo }) {
  const auth = useAuth();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // Only reachable with a valid recovery session (the emailed link). Anything else is expired.
  if (!auth.recovery && !done) {
    return (
      <AuthShell onBack={() => goTo("login")}>
        <EmptyState icon={Lock} title="This link has expired" body="Reset links work once and expire quickly. Request a new one and try again."
          action={<Button onClick={() => goTo("forgot")}>Send a new link</Button>} />
      </AuthShell>
    );
  }
  const submit = async (e) => {
    e.preventDefault();
    const v = validatePassword(pw) || (pw !== pw2 ? "The two passwords don't match." : null);
    if (v) return setError(v);
    setError("");
    setBusy(true);
    try {
      await auth.updatePassword(pw);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  if (done) {
    return (
      <AuthShell>
        <EmptyState icon={ShieldCheck} title="Password updated" body="Other devices have been signed out. You're signed in here."
          action={<Button onClick={() => goTo("app")}>Continue</Button>} />
      </AuthShell>
    );
  }
  return (
    <AuthShell>
      <h2 className="text-2xl font-semibold" style={{ ...displayFont, color: COLORS.ink }}>Choose a new password</h2>
      <p className="text-sm mt-1 mb-5" style={{ color: COLORS.inkSoft }}>Use at least 10 characters, with a letter and a number.</p>
      <ErrorBanner>{error}</ErrorBanner>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="New password"><PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field>
        <Field label="Confirm new password"><PasswordInput value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></Field>
        <Button type="submit" fullWidth size="lg" disabled={busy}>{busy ? "Saving…" : "Update password"}</Button>
      </form>
    </AuthShell>
  );
}

/* ----------------------------- Account states ------------------------------ */
export function Suspended({ onLogout }) {
  return (
    <AuthShell>
      <EmptyState icon={Lock} title="Your account is paused"
        body="An administrator has paused this account. Your data is safe and isn't visible to anyone. If you think this is a mistake, contact support."
        action={<Button variant="outline" onClick={onLogout}>Log out</Button>} />
    </AuthShell>
  );
}

export function LoadError({ message, onRetry, onLogout }) {
  return (
    <AuthShell>
      <EmptyState icon={CircleAlert} title="We couldn't load your account" body={message || "Please check your connection and try again."}
        action={<div className="flex gap-2 justify-center"><Button onClick={onRetry}>Try again</Button><Button variant="outline" onClick={onLogout}>Log out</Button></div>} />
    </AuthShell>
  );
}

export function ConfigError({ problems }) {
  return (
    <AuthShell>
      <EmptyState icon={CircleAlert} title="Menewoa isn't configured yet"
        body="This deployment is missing its Supabase settings, so it can't sign anyone in. See docs/DEPLOYMENT.md."
        action={<ul className="text-left text-xs list-disc pl-5" style={{ color: COLORS.inkSoft }}>{problems.map((p) => <li key={p}>{p}</li>)}</ul>} />
    </AuthShell>
  );
}

export function Splash() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.sand }} role="status" aria-label="Loading">
      <div className="animate-pulse"><Logo size={64} alt="Menewoa" /></div>
    </div>
  );
}

/* -------------------- Consent gate (existing accounts / new versions) -------------------- */
// Shown to a signed-in person who has not accepted the current Terms and Privacy Policy, or (for
// someone tracking their cycle) has not given explicit consent to process health information.
// Nothing in the app is reachable until they accept. Declining means logging out; their data is kept
// until they delete it (or ask us to, at the contact address).
export function ConsentGate({ profile, onAccept, onLogout }) {
  const isWoman = profile.role === "woman";
  const [agree, setAgree] = useState(false);
  const [health, setHealth] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const alreadyHealth = Boolean(profile.health_consent_at);

  const submit = async (e) => {
    e.preventDefault();
    if (!agree || (isWoman && !alreadyHealth && !health)) {
      setError("Please tick the box" + (isWoman && !alreadyHealth ? "es" : "") + " to continue.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await onAccept(isWoman && (alreadyHealth || health));
    } catch (err) {
      setError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <Logo variant="lockup" size={64} alt="Menewoa" />
      <h2 className="text-2xl font-semibold mt-3" style={{ ...displayFont, color: COLORS.ink }}>
        {profile.terms_accepted_at ? "We've updated our terms" : "One more step"}
      </h2>
      <p className="text-sm mt-1 mb-5" style={{ color: COLORS.inkSoft }}>
        Please review and accept to keep using Menewoa. Your data stays exactly as it is.
      </p>
      <ErrorBanner>{error}</ErrorBanner>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <label className="flex items-start gap-3 text-sm cursor-pointer" style={{ color: COLORS.ink }}>
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 h-4 w-4" style={{ accentColor: "var(--c-wine)" }} />
          <span>
            I'm 18 or over and I agree to the <LegalLink to="terms">Terms of Service</LegalLink> and have read
            the <LegalLink to="privacy">Privacy Policy</LegalLink>.
          </span>
        </label>
        {isWoman && !alreadyHealth && (
          <label className="flex items-start gap-3 text-sm cursor-pointer" style={{ color: COLORS.ink }}>
            <input type="checkbox" checked={health} onChange={(e) => setHealth(e.target.checked)} className="mt-1 h-4 w-4" style={{ accentColor: "var(--c-wine)" }} />
            <span>
              I explicitly consent to Menewoa storing and processing the health information I choose to log
              to provide the service. I can withdraw this at any time by deleting my data or account.
            </span>
          </label>
        )}
        <Button type="submit" fullWidth size="lg" disabled={busy}>{busy ? "Saving…" : "Accept and continue"}</Button>
      </form>
      <p className="text-xs text-center mt-5" style={{ color: COLORS.inkSoft }}>
        Version {LEGAL.termsVersion}. If you don't agree you can{" "}
        <button type="button" onClick={onLogout} className="font-semibold underline" style={{ color: COLORS.wine }}>log out</button>{" "}
        and ask us to delete your account at {fill(LEGAL.contactEmail)}.
      </p>
    </AuthShell>
  );
}
