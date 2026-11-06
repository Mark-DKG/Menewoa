import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom has no matchMedia; ThemeProvider reads it. Tests can flip `window.__prefersDark`.
beforeEach(() => {
  window.__prefersDark = false;
  window.matchMedia = (query) => ({
    matches: query.includes("prefers-color-scheme: dark") ? window.__prefersDark : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  window.localStorage.clear();
  window.sessionStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  window.scrollTo = vi.fn();
});
afterEach(() => cleanup());
