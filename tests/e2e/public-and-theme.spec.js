import { test, expect } from "@playwright/test";

const htmlTheme = (page) => page.evaluate(() => document.documentElement.getAttribute("data-theme"));

test.describe("public pages and the day/night toggle (no backend needed)", () => {
  test("1. landing page renders with the brand, a privacy link and the toggle", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: /switch to (dark|light) mode/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /privacy/i }).or(page.getByRole("button", { name: /privacy/i })).first()).toBeVisible();
  });

  test("2. toggle switches theme, updates its label, and persists across reload", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    expect(await htmlTheme(page)).toBe("light");
    await page.getByRole("button", { name: "Switch to dark mode" }).first().click();
    expect(await htmlTheme(page)).toBe("dark");
    await expect(page.getByRole("button", { name: "Switch to light mode" }).first()).toBeVisible();
    await page.reload();
    expect(await htmlTheme(page)).toBe("dark");
    const stored = await page.evaluate(() => ({ ...localStorage }));
    expect(stored).toEqual({ "menewoa-theme": "dark" });
  });

  test("3. follows the OS preference, with no flash of the wrong theme", async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: "dark" });
    const page = await ctx.newPage();
    // The blocking theme-init script must set the theme before any script/React runs.
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => { window.__themeAtDomReady = document.documentElement.getAttribute("data-theme"); });
    });
    await page.goto("/login");
    expect(await page.evaluate(() => window.__themeAtDomReady)).toBe("dark");
    await ctx.close();
  });

  test("4. the toggle is keyboard operable and present on every public route", async ({ page }) => {
    for (const path of ["/", "/login", "/signup", "/forgot", "/privacy", "/terms"]) {
      await page.goto(path);
      const toggle = page.getByTestId("theme-toggle").first();
      await expect(toggle, path).toBeVisible();
      await toggle.focus();
      const before = await htmlTheme(page);
      await page.keyboard.press("Enter");
      expect(await htmlTheme(page), path).not.toBe(before);
    }
  });

  test("5. privacy policy discloses administrator access, retention and the medical disclaimer", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: /^administrator access$/i })).toBeVisible();
    await expect(page.getByText(/permanent audit log/i)).toBeVisible();
    await expect(page.getByText(/must not be used to prevent or plan a pregnancy/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: /how long we keep it/i })).toBeVisible();
  });

  test("5b. terms page renders, links to the policy, and a draft banner shows while pending review", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.getByRole("heading", { name: /terms of service/i, level: 1 })).toBeVisible();
    await expect(page.getByText(/not contraception/i).first()).toBeVisible();
    await expect(page.getByTestId("draft-banner")).toContainText(/pending legal review/i);
    await page.getByRole("button", { name: /privacy policy/i }).click();
    await expect(page).toHaveURL(/\/privacy$/);
  });

  test("5c. the landing footer links to both documents", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /^terms$/i }).click();
    await expect(page).toHaveURL(/\/terms$/);
  });

  test("6. signed-out visitors to /app are sent to log in", async ({ page }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: /^log in$/i })).toBeVisible();
  });

  test("7. sign-up rejects a weak password before contacting the server", async ({ page }) => {
    let called = false;
    await page.route("**/auth/v1/signup**", (r) => { called = true; r.abort(); });
    await page.goto("/signup");
    await page.getByLabel(/your name/i).fill("Ama");
    await page.getByLabel("Email").fill("ama@example.com");
    await page.getByLabel(/^password/i).fill("short1");
    await page.getByRole("button", { name: /create account/i }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    expect(called).toBe(false);
  });

  test("8. login shows a friendly message when the service is unreachable", async ({ page }) => {
    await page.route("**/auth/v1/token**", (r) => r.abort("connectionrefused"));
    await page.goto("/login");
    await page.getByLabel("Email").fill("someone@example.com");
    await page.getByLabel(/^password/i).fill("a-long-password-1");
    await page.getByRole("button", { name: /^log in$/i }).click();
    const alert = page.getByRole("alert").first();
    await expect(alert).toBeVisible();
    await expect(alert).not.toContainText(/TypeError|fetch|ECONN|stack/i);
  });

  test("9. no health data or demo credentials are ever placed in browser storage", async ({ page }) => {
    await page.goto("/");
    await page.goto("/login");
    await expect(page.getByText(/demo/i)).toHaveCount(0);
    const keys = await page.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)]);
    expect(keys.filter((k) => !/^menewoa-theme$|^sb-.*-auth-token/.test(k))).toEqual([]);
  });
});
