import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const signUp = vi.fn().mockResolvedValue({ data: { session: null }, error: null });
vi.mock("../../src/lib/supabase.js", () => ({
  supabase: {
    auth: {
      signUp: (...a) => signUp(...a),
      signInWithPassword: vi.fn().mockResolvedValue({ error: { message: "Invalid login credentials", status: 400 } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      signOut: vi.fn().mockResolvedValue({}),
      resend: vi.fn().mockResolvedValue({}),
      resetPasswordForEmail: vi.fn().mockResolvedValue({}),
    },
    from: vi.fn(), rpc: vi.fn(),
  },
}));

import { ThemeProvider } from "../../src/theme/ThemeProvider.jsx";
import { AuthProvider } from "../../src/auth/AuthProvider.jsx";
import { SignUp, Login, ConsentGate } from "../../src/screens/AuthScreens.jsx";
import { LEGAL } from "../../src/config/legal.js";

const wrap = (ui) => render(<ThemeProvider><AuthProvider>{ui}</AuthProvider></ThemeProvider>);
beforeEach(() => signUp.mockClear());

describe("sign-up", () => {
  it("blocks a weak password client-side and never calls the server", async () => {
    wrap(<SignUp goTo={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/your name/i), "Ama");
    await userEvent.type(screen.getByLabelText(/email/i), "ama@example.com");
    await userEvent.type(screen.getByLabelText(/^password/i), "short1");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));
    expect((await screen.findAllByRole("alert")).length).toBeGreaterThan(0);
    expect(signUp).not.toHaveBeenCalled();
  });

  it("a registration email containing 'admin' still requests an ordinary woman account", async () => {
    wrap(<SignUp goTo={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/your name/i), "Admin Person");
    await userEvent.type(screen.getByLabelText(/email/i), "admin@example.com");
    await userEvent.type(screen.getByLabelText(/^password/i), "correct-horse-9");
    await userEvent.click(screen.getByRole("checkbox", { name: /terms of service/i }));
    await userEvent.click(screen.getByRole("checkbox", { name: /explicitly consent/i }));
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));
    await waitFor(() => expect(signUp).toHaveBeenCalled());
    const arg = signUp.mock.calls[0][0];
    expect(arg.options.data.role).toBe("woman");
    expect(JSON.stringify(arg)).not.toMatch(/is_admin|admin_role/);
  });

  async function fillValid() {
    await userEvent.type(screen.getByLabelText(/your name/i), "Ama");
    await userEvent.type(screen.getByLabelText(/email/i), "ama@example.com");
    await userEvent.type(screen.getByLabelText(/^password/i), "correct-horse-9");
  }

  it("a woman cannot sign up without BOTH the terms agreement and explicit health consent", async () => {
    wrap(<SignUp goTo={vi.fn()} />);
    await fillValid();
    await userEvent.click(screen.getByRole("checkbox", { name: /terms of service/i }));
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));
    expect(await screen.findByText(/need your consent to store the health information/i)).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
  });

  it("sends the terms version and the health consent with the sign-up request", async () => {
    wrap(<SignUp goTo={vi.fn()} />);
    await fillValid();
    await userEvent.click(screen.getByRole("checkbox", { name: /terms of service/i }));
    await userEvent.click(screen.getByRole("checkbox", { name: /explicitly consent/i }));
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));
    await waitFor(() => expect(signUp).toHaveBeenCalled());
    const { data } = signUp.mock.calls[0][0].options;
    expect(data.terms_version).toBe(LEGAL.termsVersion);
    expect(data.health_consent).toBe(true);
  });

  it("a partner is not asked for health-data consent and never sends it", async () => {
    wrap(<SignUp goTo={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /supporting a partner/i }));
    expect(screen.queryByRole("checkbox", { name: /explicitly consent/i })).not.toBeInTheDocument();
    await fillValid();
    await userEvent.click(screen.getByRole("checkbox", { name: /terms of service/i }));
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));
    await waitFor(() => expect(signUp).toHaveBeenCalled());
    const { data } = signUp.mock.calls[0][0].options;
    expect(data.role).toBe("partner");
    expect(data.health_consent).toBe(false);
  });

  it("the terms and privacy links open in a new tab so the form is not lost", () => {
    wrap(<SignUp goTo={vi.fn()} />);
    for (const name of [/terms of service/i, /privacy policy/i]) {
      const a = screen.getByRole("link", { name });
      expect(a).toHaveAttribute("target", "_blank");
      expect(a).toHaveAttribute("rel", expect.stringContaining("noopener"));
    }
  });
});

describe("login", () => {
  it("shows a friendly, non-revealing error for bad credentials", async () => {
    wrap(<Login goTo={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/email/i), "someone@example.com");
    await userEvent.type(screen.getByLabelText(/^password/i), "wrong-password-1");
    await userEvent.click(screen.getByRole("button", { name: /log in|sign in/i }));
    const alert = await screen.findByRole("alert");
    expect(alert).not.toHaveTextContent(/Invalid login credentials|supabase|400/i);
  });

  it("has no demo shortcut or hard-coded credentials", () => {
    wrap(<Login goTo={vi.fn()} />);
    expect(screen.queryByText(/demo/i)).not.toBeInTheDocument();
  });
});

describe("consent gate", () => {
  const woman = { role: "woman", terms_accepted_at: null, terms_version: null, health_consent_at: null };

  it("will not continue until the boxes are ticked, then reports health consent", async () => {
    const onAccept = vi.fn().mockResolvedValue(undefined);
    wrap(<ConsentGate profile={woman} onAccept={onAccept} onLogout={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /accept and continue/i }));
    expect(onAccept).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("checkbox", { name: /terms of service/i }));
    await userEvent.click(screen.getByRole("button", { name: /accept and continue/i }));
    expect(onAccept).not.toHaveBeenCalled(); // health consent still missing
    await userEvent.click(screen.getByRole("checkbox", { name: /explicitly consent/i }));
    await userEvent.click(screen.getByRole("button", { name: /accept and continue/i }));
    await waitFor(() => expect(onAccept).toHaveBeenCalledWith(true));
  });

  it("does not ask a partner for health consent", async () => {
    const onAccept = vi.fn().mockResolvedValue(undefined);
    wrap(<ConsentGate profile={{ ...woman, role: "partner" }} onAccept={onAccept} onLogout={vi.fn()} />);
    expect(screen.queryByRole("checkbox", { name: /explicitly consent/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: /terms of service/i }));
    await userEvent.click(screen.getByRole("button", { name: /accept and continue/i }));
    await waitFor(() => expect(onAccept).toHaveBeenCalledWith(false));
  });

  it("shows a friendly error if saving fails and lets the person log out", async () => {
    const onAccept = vi.fn().mockRejectedValue(new Error("Please try again in a moment."));
    const onLogout = vi.fn();
    wrap(<ConsentGate profile={{ ...woman, health_consent_at: "2026-01-01T00:00:00Z", terms_accepted_at: "2026-01-01T00:00:00Z", terms_version: "2026-01-01" }} onAccept={onAccept} onLogout={onLogout} />);
    expect(screen.getByText(/updated our terms/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: /terms of service/i }));
    await userEvent.click(screen.getByRole("button", { name: /accept and continue/i }));
    expect(await screen.findByText(/try again in a moment/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /log out/i }));
    expect(onLogout).toHaveBeenCalled();
  });
});
