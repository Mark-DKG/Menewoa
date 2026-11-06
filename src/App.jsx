import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, ShieldCheck } from "lucide-react";
import { COLORS, displayFont } from "./theme/tokens.js";
import { ThemeProvider, ThemeToggle } from "./theme/ThemeProvider.jsx";
import { AuthProvider, useAuth } from "./auth/AuthProvider.jsx";
import { env } from "./config/env.js";
import { PATHS, useRoute } from "./lib/router.js";
import { todayISO } from "./lib/dates.js";
import { isSessionError } from "./lib/errors.js";
import { useLoader } from "./data/hooks.js";
import {
  loadWomanData, womanActions, loadPartnerData, partnerActions, loadContent,
  updateProfileName, submitReport, loadMyAccessHistory, exportMyData, recordConsent, AppError,
} from "./data/api.js";
import { Button, Card, Toast } from "./components/ui.jsx";
import { SignUp, Login, Forgot, ResetPassword, Suspended, LoadError, ConfigError, Splash, ConsentGate } from "./screens/AuthScreens.jsx";
import { LEGAL, needsConsent } from "./config/legal.js";
import { Landing } from "./screens/Landing.jsx";
import { PrivacyPage, TermsPage } from "./screens/Legal.jsx";
import { WomanOnboarding, WomanApp } from "./screens/WomanScreens.jsx";
import { PartnerOnboarding, PartnerApp } from "./screens/PartnerScreens.jsx";
import { AdminApp } from "./screens/AdminScreens.jsx";

/* ------------------------------------------------------------------ helpers -- */

/** Toast + the single wrapper every mutation goes through (errors are friendly, never silent). */
function useActions(onSessionError) {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const show = useCallback((msg, type = "success") => {
    clearTimeout(timer.current);
    setToast({ msg, type });
    timer.current = setTimeout(() => setToast(null), type === "error" ? 6000 : 3000);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  const makeAct = useCallback((afterSuccess) => async (fn, successMsg) => {
    try {
      await fn();
      if (successMsg) show(successMsg);
      await afterSuccess?.();
    } catch (e) {
      if (isSessionError(e?.cause || e)) onSessionError?.();
      show(e instanceof AppError ? e.message : "Something went wrong. Please try again.", "error");
    }
  }, [show, onSessionError]);

  return { toast, show, makeAct };
}

/** "Today" in the user's own time zone, refreshed when the tab regains focus. */
function useToday(timeZone) {
  const [today, setToday] = useState(() => todayISO(timeZone));
  useEffect(() => {
    const refresh = () => setToday(todayISO(timeZone));
    refresh();
    document.addEventListener("visibilitychange", refresh);
    const t = setInterval(refresh, 60_000);
    return () => { document.removeEventListener("visibilitychange", refresh); clearInterval(t); };
  }, [timeZone]);
  return today;
}

function DataGate({ loader, onLogout, children }) {
  if (loader.status === "loading") return <Splash />;
  if (loader.status === "error" && !loader.data) {
    return <LoadError message={loader.error} onRetry={() => loader.reload().catch(() => {})} onLogout={onLogout} />;
  }
  return children(loader.data);
}

/** Shown once, straight after onboarding, because the code can never be retrieved again. */
function InviteCodeScreen({ invite, onDone }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(invite.code); setCopied(true); } catch { /* clipboard unavailable */ }
  };
  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative" style={{ backgroundColor: COLORS.sand }}>
      <div className="absolute top-4 right-4"><ThemeToggle /></div>
      <Card className="p-7 w-full max-w-md text-center space-y-4">
        <ShieldCheck size={28} color={COLORS.wine} className="mx-auto" aria-hidden="true" />
        <h2 className="text-xl font-semibold" style={{ ...displayFont, color: COLORS.ink }}>Your invitation code</h2>
        <p className="text-3xl font-bold tracking-widest" style={{ ...displayFont, color: COLORS.wine }} data-testid="invite-code">{invite.code}</p>
        <p className="text-sm" style={{ color: COLORS.inkSoft }}>
          Share it with your partner yourself. For your safety it's shown only once, works once, and expires on {new Date(invite.expiresAt).toLocaleDateString()}. If you lose it, create a new one in the Partner tab.
        </p>
        <div className="flex gap-2 justify-center">
          <Button variant="outline" onClick={copy}><Copy size={14} /> {copied ? "Copied" : "Copy"}</Button>
          <Button onClick={onDone}>Continue to Menewoa</Button>
        </div>
      </Card>
    </div>
  );
}

/* --------------------------------------------------------------- containers -- */

function WomanContainer({ auth }) {
  const { user, profile } = auth;
  const stateRef = useRef(null);
  const loader = useLoader(() => loadWomanData(profile, user.email), [user.id], auth.handleSessionError);
  stateRef.current = loader.data;
  const content = useLoader(loadContent, [user.id], auth.handleSessionError);
  const history = useLoader(loadMyAccessHistory, [user.id], auth.handleSessionError);
  const { toast, makeAct } = useActions(auth.handleSessionError);
  const act = useMemo(() => makeAct(() => loader.reload({ silent: true })), [makeAct, loader.reload]); // eslint-disable-line react-hooks/exhaustive-deps
  const actions = useMemo(() => womanActions(user.id, () => stateRef.current), [user.id]);
  const [invite, setInvite] = useState(null);
  const today = useToday(loader.data?.timezone);

  return (
    <DataGate loader={loader} onLogout={auth.signOut}>
      {(woman) => {
        if (invite) return <InviteCodeScreen invite={invite} onDone={() => setInvite(null)} />;
        if (!woman.onboarded) {
          return (
            <WomanOnboarding
              today={today}
              initialName={woman.profile.name || ""}
              onFinish={async (d) => {
                try {
                  const created = await actions.completeOnboarding(d);
                  if (created) setInvite(created);
                  await loader.reload({ silent: true });
                } catch (e) {
                  if (isSessionError(e?.cause || e)) auth.handleSessionError();
                  throw e;
                }
              }}
            />
          );
        }
        return (
          <>
            <WomanApp
              woman={woman}
              actions={actions}
              act={act}
              today={today}
              content={content.data || { articles: [], faqs: [], announcements: [] }}
              accessHistory={history.status === "ready" ? history.data : history.status === "error" ? null : []}
              onLogout={auth.signOut}
              onDelete={auth.deleteAccount}
              onExport={exportMyData}
              onRename={async (name) => { await updateProfileName(user.id, name); await loader.reload({ silent: true }); }}
              onSubmitReport={(category, details) => submitReport(user.id, category, details)}
            />
            <Toast toast={toast} />
          </>
        );
      }}
    </DataGate>
  );
}

function PartnerContainer({ auth }) {
  const { user, profile } = auth;
  const loader = useLoader(() => loadPartnerData(profile, user.email), [user.id], auth.handleSessionError);
  const content = useLoader(loadContent, [user.id], auth.handleSessionError);
  const { toast, makeAct } = useActions(auth.handleSessionError);
  const act = useMemo(() => makeAct(() => loader.reload({ silent: true })), [makeAct, loader.reload]); // eslint-disable-line react-hooks/exhaustive-deps
  const actions = useMemo(() => partnerActions(user.id), [user.id]);

  return (
    <DataGate loader={loader} onLogout={auth.signOut}>
      {(partner) => {
        if (!partner.onboarded) {
          return (
            <PartnerOnboarding
              actions={actions}
              initialName={partner.profile.name || ""}
              onFinish={async (name) => { await actions.completeOnboarding(name); await loader.reload({ silent: true }); }}
            />
          );
        }
        return (
          <>
            <PartnerApp
              partner={partner}
              actions={actions}
              act={act}
              content={content.data || { articles: [], faqs: [], announcements: [] }}
              onReload={() => loader.reload({ silent: true })}
              onLogout={auth.signOut}
              onDelete={auth.deleteAccount}
              onExport={exportMyData}
              onRename={async (name) => { await updateProfileName(user.id, name); await loader.reload({ silent: true }); }}
              onSubmitReport={(category, details) => submitReport(user.id, category, details)}
            />
            <Toast toast={toast} />
          </>
        );
      }}
    </DataGate>
  );
}

function AdminContainer({ auth }) {
  const { toast, makeAct } = useActions(auth.handleSessionError);
  const act = useMemo(() => makeAct(), [makeAct]);
  return (
    <>
      <AdminApp role={auth.admin.role} userId={auth.user.id} act={act} onLogout={auth.signOut} onSessionError={auth.handleSessionError} />
      <Toast toast={toast} />
    </>
  );
}

/* -------------------------------------------------------------------- routes -- */

const PUBLIC_AUTH_PATHS = new Set([PATHS.login, PATHS.signup, PATHS.forgot, PATHS.reset, PATHS.landing]);

function Root() {
  const auth = useAuth();
  const { path, navigate } = useRoute();
  const goTo = useCallback((dest) => navigate(dest), [navigate]);

  // Route guards are redirects, not security: the database refuses data to anyone not allowed it.
  useEffect(() => {
    if (auth.status === "signedOut" && path === PATHS.app) navigate(PATHS.login, { replace: true });
    if (auth.status === "signedIn" && auth.profile && PUBLIC_AUTH_PATHS.has(path) && !auth.recovery) navigate(PATHS.app, { replace: true });
  }, [auth.status, auth.profile, auth.recovery, path, navigate]);

  if (!env.ok) return <ConfigError problems={env.problems} />;
  if (auth.status === "loading") return <Splash />;

  // A password-reset link signs the user in temporarily; they must set a new password first.
  if (auth.recovery) return <ResetPassword goTo={goTo} />;
  if (path === PATHS.privacy) return <PrivacyPage goTo={goTo} />;
  if (path === PATHS.terms) return <TermsPage goTo={goTo} />;

  if (auth.status === "signedOut") {
    if (path === PATHS.login || path === PATHS.app) return <Login goTo={goTo} />;
    if (path === PATHS.signup) return <SignUp goTo={goTo} />;
    if (path === PATHS.forgot) return <Forgot goTo={goTo} />;
    if (path === PATHS.reset) return <Forgot goTo={goTo} />; // no recovery session → start again
    return <Landing goTo={goTo} />;
  }

  // Signed in from here on.
  if (auth.loadError || !auth.profile) {
    return <LoadError message={auth.loadError} onRetry={auth.refreshIdentity} onLogout={auth.signOut} />;
  }
  if (auth.profile.status === "suspended") return <Suspended onLogout={auth.signOut} />;
  if (PUBLIC_AUTH_PATHS.has(path)) return <Splash />; // redirect to /app in flight

  // Everyone, administrators included, must have accepted the current Terms/Privacy Policy (and
  // women must have consented to health-data processing). The server stamps the time itself.
  if (needsConsent(auth.profile)) {
    return (
      <ConsentGate
        profile={auth.profile}
        onLogout={auth.signOut}
        onAccept={async (health) => {
          try {
            await recordConsent(LEGAL.termsVersion, health);
          } catch (e) {
            if (isSessionError(e?.cause || e)) auth.handleSessionError?.();
            throw e;
          }
          await auth.refreshIdentity();
        }}
      />
    );
  }

  // Admin rights come ONLY from the database (admin_users, re-checked on every call) — never from
  // the email address or from anything the browser claims.
  if (auth.admin?.is_admin) return <AdminContainer auth={auth} />;
  if (auth.profile.role === "partner") return <PartnerContainer key={auth.user.id} auth={auth} />;
  return <WomanContainer key={auth.user.id} auth={auth} />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </ThemeProvider>
  );
}
