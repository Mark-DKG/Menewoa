import { useCallback, useEffect, useState } from "react";

// A deliberately tiny history-API router (no extra dependency, no URL ever carries
// health data). Screens ask for named destinations; guards live in App.jsx.
export const PATHS = {
  landing: "/",
  login: "/login",
  signup: "/signup",
  forgot: "/forgot",
  reset: "/reset-password",
  privacy: "/privacy",
  terms: "/terms",
  app: "/app",
};

const norm = (p) => (p.length > 1 ? p.replace(/\/+$/, "") : p) || "/";

export function useRoute() {
  const [path, setPath] = useState(() => norm(window.location.pathname));
  useEffect(() => {
    const onPop = () => setPath(norm(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const navigate = useCallback((to, { replace = false } = {}) => {
    const target = to.startsWith("/") ? to : PATHS[to] || "/";
    const next = norm(new URL(target, window.location.origin).pathname);
    if (replace) window.history.replaceState(null, "", target);
    else if (next !== norm(window.location.pathname)) window.history.pushState(null, "", target);
    setPath(next);
    window.scrollTo?.(0, 0);
  }, []);
  return { path, navigate };
}
