// These scenarios drive the real app against a DISPOSABLE Supabase project that has all
// migrations applied and "Confirm email" turned OFF (or an inbucket/mail catcher wired up).
// Run:  E2E_BACKEND=1 E2E_SUPABASE_URL=... E2E_SUPABASE_ANON_KEY=... npx playwright test with-backend
import { test, expect } from "@playwright/test";
import { PASSWORD, needsBackend, uniqueEmail } from "./helpers.js";

test.describe("full journeys (need a backend)", () => {
  needsBackend(test);

  async function signUp(page, { name, email, role }) {
    await page.goto("/signup");
    await page.getByLabel(/your name/i).fill(name);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel(/^password/i).fill(PASSWORD);
    if (role === "partner") await page.getByRole("button", { name: /partner/i }).click();
    await page.getByRole("checkbox", { name: /terms of service/i }).check();
    if (role !== "partner") await page.getByRole("checkbox", { name: /explicitly consent/i }).check();
    await page.getByRole("button", { name: /create account/i }).click();
  }

  test("10. a woman signs up, onboards, logs a period and sees an estimate", async ({ page }) => {
    await signUp(page, { name: "Ama", email: uniqueEmail("woman"), role: "woman" });
    await expect(page.getByText(/what should we call you/i)).toBeVisible();
    for (let i = 0; i < 5; i++) await page.getByRole("button", { name: /continue/i }).click();
    await page.getByRole("button", { name: /finish setup/i }).click();
    await expect(page.getByText(/no cycle data yet/i)).toBeVisible();
    await page.getByRole("button", { name: /log today/i }).click();
    await page.getByRole("button", { name: /save period entry/i }).click();
    await page.getByRole("button", { name: /^home$/i }).click();
    await expect(page.getByText(/estimated/i).first()).toBeVisible();
  });

  test("11. role is never taken from the email: an 'admin@' address is an ordinary user with no admin UI", async ({ page }) => {
    await signUp(page, { name: "Admin Lookalike", email: `admin+${Date.now()}@example.com`, role: "woman" });
    await expect(page.getByText(/user management|audit log/i)).toHaveCount(0);
    await page.goto("/app");
    await expect(page.getByText(/user management|audit log/i)).toHaveCount(0);
  });

  test("12. invitation flow: consent, accept, immediate revocation", async ({ browser }) => {
    const wCtx = await browser.newContext();
    const pCtx = await browser.newContext();
    const w = await wCtx.newPage();
    const p = await pCtx.newPage();

    await signUp(w, { name: "Woman", email: uniqueEmail("w"), role: "woman" });
    for (let i = 0; i < 5; i++) await w.getByRole("button", { name: /continue/i }).click();
    await w.getByRole("button", { name: /finish setup/i }).click();
    await w.getByRole("button", { name: /^partner$/i }).click();
    await expect(w.getByRole("button", { name: /create invitation code/i })).toBeDisabled();
    await w.getByRole("checkbox", { name: /i consent/i }).check();
    await w.getByRole("button", { name: /create invitation code/i }).click();
    const code = (await w.getByTestId("invite-code").textContent()).trim();
    expect(code).toMatch(/^[0-9A-Z]{5}-[0-9A-Z]{5}$/);

    await signUp(p, { name: "Partner", email: uniqueEmail("p"), role: "partner" });
    await p.getByRole("button", { name: /continue/i }).click();
    await p.getByLabel(/invitation code/i).fill(code);
    await p.getByRole("button", { name: /^continue$/i }).click();
    await expect(p.getByText(/she is choosing to share only this/i)).toBeVisible();
    await p.getByRole("button", { name: /accept and connect/i }).click();
    await expect(p.getByText(/here's how woman is doing/i)).toBeVisible();

    // The code is single-use.
    // Immediate revocation: she disconnects and his very next view shows nothing.
    await w.getByRole("button", { name: "Disconnect" }).click();
    await w.getByRole("button", { name: /yes, disconnect/i }).click();
    await p.reload();
    await expect(p.getByText(/not connected yet/i)).toBeVisible();
  });

  test("13. dark mode covers the app shell, dialogs and forms after sign-in", async ({ page }) => {
    await signUp(page, { name: "Dark", email: uniqueEmail("dark"), role: "woman" });
    for (let i = 0; i < 5; i++) await page.getByRole("button", { name: /continue/i }).click();
    await page.getByRole("button", { name: /finish setup/i }).click();
    await page.getByRole("button", { name: "Switch to dark mode" }).first().click();
    for (const tab of ["Calendar", "Track", "Insights", "Partner", "Profile"]) {
      await page.getByRole("button", { name: new RegExp(`^${tab}$`) }).first().click();
      expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
    }
    await page.getByRole("button", { name: /delete account/i }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
  });

  test("14. delete account requires the password and removes access", async ({ page }) => {
    const email = uniqueEmail("del");
    await signUp(page, { name: "Del", email, role: "woman" });
    for (let i = 0; i < 5; i++) await page.getByRole("button", { name: /continue/i }).click();
    await page.getByRole("button", { name: /finish setup/i }).click();
    await page.getByRole("button", { name: /^profile$/i }).first().click();
    await page.getByRole("button", { name: /delete account/i }).click();
    await page.getByRole("button", { name: /yes, delete everything/i }).click();
    await expect(page.getByRole("alert")).toContainText(/password/i);
    await page.getByLabel(/confirm with your password/i).fill(PASSWORD);
    await page.getByRole("button", { name: /yes, delete everything/i }).click();
    await expect(page).toHaveURL(/\/($|login)/);
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel(/^password/i).fill(PASSWORD);
    await page.getByRole("button", { name: /^log in$/i }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();
  });
});
