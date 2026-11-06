import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, ThemeToggle } from "../../src/theme/ThemeProvider.jsx";

const setup = () => render(<ThemeProvider><ThemeToggle /></ThemeProvider>);

describe("day/night toggle", () => {
  it("starts light, labelled with the action it performs", () => {
    setup();
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeInTheDocument();
  });

  it("switches theme and label, and back again", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    await userEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
  });

  it("is operable from the keyboard", async () => {
    setup();
    await userEvent.tab();
    expect(screen.getByTestId("theme-toggle")).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    await userEvent.keyboard(" ");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
  });

  it("follows the operating-system preference when nothing was chosen", () => {
    window.__prefersDark = true;
    setup();
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  });

  it("an explicit choice beats the OS preference and persists as a bare word", async () => {
    window.__prefersDark = true;
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));
    expect(window.localStorage.getItem("menewoa-theme")).toBe("light");
  });

  it("stores nothing but the theme word", async () => {
    setup();
    await userEvent.click(screen.getByTestId("theme-toggle"));
    expect(Object.keys(window.localStorage)).toEqual(["menewoa-theme"]);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("still works when storage throws (private mode)", async () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error("denied"); };
    try {
      setup();
      await userEvent.click(screen.getByTestId("theme-toggle"));
      expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
