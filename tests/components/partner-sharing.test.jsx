import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "../../src/theme/ThemeProvider.jsx";
import { WomanPartner } from "../../src/screens/WomanScreens.jsx";
import { PartnerShared } from "../../src/screens/PartnerScreens.jsx";

const baseWoman = {
  sharing: { periodDates: true, expectedPeriod: true, mood: false, symptoms: false, fertility: false, notes: false, otherSensitive: false, supportTips: false },
  supportTips: [],
  partnerConnection: { status: "none", hasBlocked: false },
};
const wrap = (ui) => render(<ThemeProvider>{ui}</ThemeProvider>);

describe("woman: inviting a partner", () => {
  it("cannot create an invitation until she has given explicit consent", async () => {
    const createInvitation = vi.fn().mockResolvedValue({ code: "ABCDE-FGHJK", expiresAt: "2030-01-01T00:00:00Z" });
    const act = vi.fn((fn) => fn());
    wrap(<WomanPartner woman={baseWoman} actions={{ createInvitation }} act={act} />);
    const create = screen.getByRole("button", { name: /create invitation code/i });
    expect(create).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox", { name: /i consent/i }));
    expect(create).toBeEnabled();
    await userEvent.click(create);
    expect(createInvitation).toHaveBeenCalledOnce();
  });

  it("sensitive items default to off", () => {
    wrap(<WomanPartner woman={baseWoman} actions={{}} act={vi.fn()} />);
    for (const name of [/mood/i, /symptoms/i, /fertility information/i, /private notes/i, /sleep & energy/i]) {
      expect(screen.getByRole("switch", { name })).toHaveAttribute("aria-checked", "false");
    }
  });

  it("disconnecting asks for confirmation and then calls revoke", async () => {
    const revokeConnection = vi.fn().mockResolvedValue();
    const act = vi.fn((fn) => fn());
    wrap(<WomanPartner woman={{ ...baseWoman, partnerConnection: { status: "connected", connectionId: "c1", partnerName: "Kojo" } }} actions={{ revokeConnection }} act={act} />);
    await userEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(revokeConnection).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /yes, disconnect/i }));
    expect(revokeConnection).toHaveBeenCalledWith("c1");
  });
});

describe("partner: only sees what is shared", () => {
  const view = (shared, extra = {}) => ({
    connected: true, woman_name: "Adjoa", woman_today: "2026-11-03",
    shared: { period_dates: false, expected_period: false, mood: false, symptoms: false, fertility: false, private_notes: false, other_sensitive: false, support_tips: false, ...shared },
    ...extra,
  });

  it("shows an explanatory empty state when nothing is shared", () => {
    wrap(<PartnerShared view={view({})} />);
    expect(screen.getByText(/nothing shared yet/i)).toBeInTheDocument();
  });

  it("renders only the sections that are switched on", () => {
    wrap(<PartnerShared view={view({ mood: true }, { mood: [{ date: "2026-11-03", mood: "calm" }], symptoms: [{ date: "2026-11-03", name: "Cramps" }] })} />);
    expect(screen.getByText("Calm")).toBeInTheDocument();
    // symptoms data was (wrongly) present in the payload, but the permission is off => not rendered
    expect(screen.queryByText("Cramps")).not.toBeInTheDocument();
    expect(screen.queryByText(/fertile window/i)).not.toBeInTheDocument();
  });

  it("labels fertility information as an estimate", () => {
    wrap(<PartnerShared view={view({ fertility: true }, { fertility: { fertile_start: "2026-10-28", fertile_end: "2026-11-03", ovulation_date: "2026-10-29" } })} />);
    expect(screen.getByText(/estimates only/i)).toBeInTheDocument();
  });
});
