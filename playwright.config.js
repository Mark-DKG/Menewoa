import { defineConfig, devices } from "@playwright/test";

// Backend-free scenarios run against a local build with a placeholder Supabase URL.
// Scenarios that need a real (disposable!) Supabase project are skipped unless E2E_BACKEND=1
// and the E2E_* variables in docs/TESTING.md are set.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:4173", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run build && npm run preview -- --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: process.env.E2E_SUPABASE_URL || "http://127.0.0.1:54321",
      VITE_SUPABASE_ANON_KEY:
        process.env.E2E_SUPABASE_ANON_KEY ||
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.c2lnbmF0dXJl",
    },
  },
});
