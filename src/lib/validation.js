// Client-side validation for fast, friendly feedback. The database re-validates everything
// (CHECK constraints, triggers) — this is never the only line of defence.
import { isISODate, todayISO, addDaysISO, daysBetween } from "./dates.js";

export const PASSWORD_MIN = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateEmail(email) {
  const v = (email || "").trim();
  if (!v) return "Enter your email address.";
  if (v.length > 254 || !EMAIL_RE.test(v)) return "That email address doesn't look right.";
  return null;
}

export function validatePassword(pw) {
  if (!pw) return "Enter a password.";
  if (pw.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (pw.length > 128) return "That password is too long (128 characters max).";
  if (/^(.)\1+$/.test(pw)) return "Choose a less repetitive password.";
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return "Include at least one letter and one number.";
  return null;
}

export function validateDisplayName(name) {
  const v = (name || "").trim();
  if (!v) return "Enter a name.";
  if (v.length > 80) return "Keep it under 80 characters.";
  return null;
}

/** Period dates: not in the future (a day of slack for time zones), ordered, <= 14 days. */
export function validatePeriodDates(start, end, today = todayISO()) {
  if (!isISODate(start)) return "Choose a valid start date.";
  if (start < "2000-01-01") return "That date is too far in the past.";
  if (start > addDaysISO(today, 1)) return "A period start can't be in the future.";
  if (end) {
    if (!isISODate(end)) return "Choose a valid end date.";
    if (end < start) return "The end date can't be before the start date.";
    if (end > addDaysISO(today, 1)) return "The end date can't be in the future.";
    if (daysBetween(start, end) > 14) return "Periods longer than 14 days can't be saved. Please check the dates.";
  }
  return null;
}

export function validateCycleSettings(cycleLength, periodLength) {
  if (!Number.isInteger(cycleLength) || cycleLength < 15 || cycleLength > 60) return "Cycle length must be between 15 and 60 days.";
  if (!Number.isInteger(periodLength) || periodLength < 1 || periodLength > 14) return "Period length must be between 1 and 14 days.";
  return null;
}

export function validateDailyLog({ sleepHours, energyLevel, note }) {
  if (sleepHours != null && sleepHours !== "" && (Number(sleepHours) < 0 || Number(sleepHours) > 24 || Number.isNaN(Number(sleepHours)))) return "Sleep must be between 0 and 24 hours.";
  if (energyLevel != null && (energyLevel < 1 || energyLevel > 5)) return "Energy must be between 1 and 5.";
  if (note && note.length > 2000) return "Notes can be up to 2000 characters.";
  return null;
}

export function validateReport(details) {
  const v = (details || "").trim();
  if (v.length < 10) return "Please add a little more detail (at least 10 characters).";
  if (v.length > 2000) return "Please keep it under 2000 characters.";
  return null;
}

export function validateInviteCode(code) {
  const v = (code || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (v.length !== 10) return "Invitation codes have 10 characters, like ABCDE-FGHJK.";
  return null;
}

/** Strips control characters; React escapes output, this keeps stored text clean. */
export function cleanText(s) {
  // eslint-disable-next-line no-control-regex
  return String(s ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}
