import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Moon, Sun } from "lucide-react";

// One source of truth for the colour theme. The initial theme is applied by
// /theme-init.js before React loads, so there is no flash; this provider then keeps
// <html data-theme>, the browser UI colour and the stored choice in sync.
// Only the string "light" or "dark" is persisted — never anything about the user.

const STORAGE_KEY = "menewoa-theme";
const ThemeContext = createContext(null);

function readStored() {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}
function systemTheme() {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(theme) {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.style.colorScheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#17100F" : "#7F011F");
}

export function ThemeProvider({ children }) {
  const [explicit, setExplicit] = useState(readStored); // null = follow the OS
  const [system, setSystem] = useState(systemTheme);
  const theme = explicit ?? system;

  useEffect(() => {
    let mq;
    try {
      mq = window.matchMedia("(prefers-color-scheme: dark)");
    } catch {
      return undefined;
    }
    const onChange = (e) => setSystem(e.matches ? "dark" : "light");
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((next) => {
    setExplicit(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable: the choice still applies for this visit */
    }
  }, []);

  const toggleTheme = useCallback(() => setTheme(theme === "dark" ? "light" : "dark"), [theme, setTheme]);

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}

/** Sun/moon switch. The accessible name describes the ACTION, as the brief requires. */
export function ThemeToggle({ className = "" }) {
  const { theme, toggleTheme } = useTheme();
  const toDark = theme === "light";
  const label = toDark ? "Switch to dark mode" : "Switch to light mode";
  const Icon = toDark ? Moon : Sun;
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      data-testid="theme-toggle"
      className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition-colors hover:bg-black/5 focus:outline-none focus-visible:ring-2 ${className}`}
      style={{ borderColor: "var(--c-line)", color: "var(--c-wine)", backgroundColor: "var(--c-white)" }}
    >
      <Icon size={18} aria-hidden="true" />
    </button>
  );
}
