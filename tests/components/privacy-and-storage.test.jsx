import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "../../src/theme/ThemeProvider.jsx";
import { PrivacyStatement } from "../../src/screens/Landing.jsx";
import { WomanTrack, WomanApp } from "../../src/screens/WomanScreens.jsx";

const today = "2026-11-03";
const woman = {
  profile: { name: "Adjoa", email: "a@example.com" }, onboarded: true, timezone: "UTC",
  cycleSettings: { cycleLength: 28, periodLength: 5 },
  trackingPrefs: { period: true, symptoms: true, mood: true, sleepEnergy: true, notes: true },
  periods: [{ id: "1", start: "2026-10-01", end: "2026-10-05" }, { id: "2", start: "2026-10-29", end: null }],
  symptomLogs: [], symptomCatalog: ["Cramps", "Headache"], symptomIds: { Cramps: 1, Headache: 2 },
  moodLogs: [], dailyLogs: [],
  sharing: {}, partnerConnection: { status: "none" }, supportTips: [],
  notificationPrefs: { upcomingPeriod: true, periodStarted: true, trackingReminders: false, partnerUpdates: true, announcements: true, revealOnLockscreen: false },
};
const wrap = (ui) => render(<ThemeProvider>{ui}</ThemeProvider>);

describe("privacy statement", () => {
  it("discloses limited, audited administrator access", () => {
    wrap(<PrivacyStatement full />);
    expect(screen.getByText(/limited, audited administrator access/i)).toBeInTheDocument();
    expect(screen.getByText(/appears in your\s+Privacy dashboard/i)).toBeInTheDocument();
  });
  it("never presents estimates as contraception or a diagnosis", () => {
    wrap(<PrivacyStatement full />);
    expect(screen.getByText(/never a form of contraception/i)).toBeInTheDocument();
  });
});

describe("health data stays out of browser storage", () => {
  it("logging a mood and a symptom writes nothing to localStorage/sessionStorage", async () => {
    const actions = { saveMood: vi.fn().mockResolvedValue(), saveSymptoms: vi.fn().mockResolvedValue() };
    const act = vi.fn((fn) => fn());
    wrap(<WomanTrack woman={woman} actions={actions} act={act} today={today} />);
    await userEvent.click(screen.getByRole("button", { name: /^mood$/i }));
    await userEvent.click(screen.getByRole("button", { name: /calm/i }));
    await userEvent.click(screen.getByRole("button", { name: /save mood/i }));
    expect(actions.saveMood).toHaveBeenCalledWith(today, "Calm");
    expect(Object.keys(window.localStorage)).not.toContain("menewoa-state");
    const all = JSON.stringify({ ...window.localStorage }) + JSON.stringify({ ...window.sessionStorage });
    expect(all).not.toMatch(/calm|cramps|period/i);
  });
});

describe("period validation in the UI", () => {
  it("rejects a future start date before calling the server", async () => {
    const actions = { savePeriod: vi.fn() };
    wrap(<WomanTrack woman={woman} actions={actions} act={vi.fn()} today={today} />);
    const start = screen.getByLabelText(/start date/i);
    await userEvent.clear(start);
    await userEvent.type(start, "2027-01-01");
    await userEvent.click(screen.getByRole("button", { name: /save period entry/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/future/i);
    expect(actions.savePeriod).not.toHaveBeenCalled();
  });
});

describe("estimates are labelled as estimates", () => {
  it("home screen says 'estimated' and never promises", () => {
    wrap(
      <WomanApp woman={woman} actions={{}} act={vi.fn()} today={today} content={{ articles: [] }} accessHistory={[]}
        onLogout={vi.fn()} onDelete={vi.fn()} onExport={vi.fn()} onSubmitReport={vi.fn()} onRename={vi.fn()} />
    );
    expect(screen.getAllByText(/estimated/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/not a medical guarantee/i)).toBeInTheDocument();
  });
});
