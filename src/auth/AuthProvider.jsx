import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { friendlyError } from "../lib/errors.js";
import { invokeFunction } from "../data/api.js";
import { disablePush } from "../lib/push.js";
import { LEGAL } from "../config/legal.js";

// Real Supabase Auth: email + password, email verification, password reset, persistent
// sessions, expiry handling and account deletion. The user's ROLE always comes from the
// database (profiles.role set by a server trigger; admin rights only from admin_users) —
// never from the email address, never from anything the browser sends.

const AuthContext = createContext(null);
const INITIAL = { status: "loading", user: null, profile: null, admin: null, recovery: false, notice: null, loadError: null };

async function loadIdentity(user) {
  const [p, a] = await Promise.all([
    supabase.from("profiles").select("id,role,status,display_name,timezone,onboarding_completed,terms_version,terms_accepted_at,health_consent_at").eq("id", user.id).maybeSingle(),
    supabase.rpc("get_my_admin_status"),
  ]);
  if (p.error) throw p.error;
  if (!p.data) throw new Error("profile_missing");
  return { profile: p.data, admin: a.error ? { is_admin: false } : a.data };
}

function purgeCaches() {
  // Tell the service worker to drop anything it may have cached for this user.
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "LOGOUT" });
  } catch { /* no service worker */ }
}

export function AuthProvider({ children }) {
  const [state, setState] = useState(INITIAL);
  const userInitiatedOut = useRef(false);
  const loadedUserId = useRef(null);

  const hydrate = useCallback(async (session) => {
    if (!supabase) return setState((s) => ({ ...s, status: "signedOut" }));
    if (!session?.user) {
      const wasIn = loadedUserId.current !== null;
      loadedUserId.current = null;
      setState((s) => ({
        ...INITIAL,
        status: "signedOut",
        recovery: false,
        notice: wasIn && !userInitiatedOut.current ? "Your session has expired. Please sign in again." : s.notice,
      }));
      userInitiatedOut.current = false;
      return;
    }
    if (loadedUserId.current === session.user.id) return; // e.g. token refresh / tab refocus
    try {
      const identity = await loadIdentity(session.user);
      loadedUserId.current = session.user.id;
      setState((s) => ({ ...s, status: "signedIn", user: session.user, ...identity, notice: null, loadError: null }));
    } catch (e) {
      setState((s) => ({ ...s, status: "signedIn", user: session.user, profile: null, admin: null, loadError: friendlyError(e, "We couldn't load your account.") }));
    }
  }, []);

  useEffect(() => {
    if (!supabase) {
      setState((s) => ({ ...s, status: "signedOut" }));
      return undefined;
    }
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") setState((s) => ({ ...s, recovery: true }));
      if (event === "TOKEN_REFRESHED") return;
      // Never await Supabase calls inside this callback (it can deadlock the client).
      setTimeout(() => hydrate(session), 0);
    });
    return () => data.subscription.unsubscribe();
  }, [hydrate]);

  const refreshIdentity = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return hydrate(null);
    loadedUserId.current = null;
    return hydrate(data.session);
  }, [hydrate]);

  const api = useMemo(() => ({
    async signUp({ email, password, name, role, healthConsent }) {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          // `role` here is only a REQUEST. The server trigger accepts exactly "partner"
          // and turns everything else into "woman"; admin cannot be requested at all.
          // `terms_version` / `health_consent` are likewise only claims: the trigger validates the
          // version format, stamps the time itself, and records health consent for women only.
          data: {
            display_name: name.trim(),
            role: role === "partner" ? "partner" : "woman",
            terms_version: LEGAL.termsVersion,
            health_consent: role !== "partner" && healthConsent === true,
          },
          emailRedirectTo: `${window.location.origin}/login`,
        },
      });
      if (error) throw new Error(friendlyError(error));
      return { needsVerification: !data.session };
    },
    async signIn({ email, password }) {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw new Error(friendlyError(error));
    },
    async signOut() {
      userInitiatedOut.current = true;
      // Stop this device receiving this account's notifications, but never let it block logout.
      await Promise.race([disablePush(), new Promise((r) => setTimeout(r, 1500))]);
      purgeCaches();
      await supabase.auth.signOut();
    },
    async sendReset(email) {
      // Always resolves the same way so the form never reveals whether an email is registered.
      await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` }).catch(() => {});
    },
    async updatePassword(password) {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw new Error(friendlyError(error));
      await supabase.auth.signOut({ scope: "others" }).catch(() => {});
      setState((s) => ({ ...s, recovery: false }));
    },
    async resendVerification(email) {
      await supabase.auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: `${window.location.origin}/login` } }).catch(() => {});
    },
    async deleteAccount(password) {
      await invokeFunction("delete-account", { password });
      userInitiatedOut.current = true;
      purgeCaches();
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
    },
    handleSessionError() {
      userInitiatedOut.current = false;
      supabase.auth.signOut({ scope: "local" }).catch(() => {});
    },
    dismissNotice: () => setState((s) => ({ ...s, notice: null })),
    clearRecovery: () => setState((s) => ({ ...s, recovery: false })),
    refreshIdentity,
  }), [refreshIdentity]);

  return <AuthContext.Provider value={{ ...state, ...api }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
