// Cycle estimates. EVERYTHING here is an estimate derived from the user's own logs.
// Menewoa is not a medical device or contraceptive and never claims to detect or
// prevent pregnancy. This module must stay numerically identical to the SQL function
// public.recompute_prediction (supabase/migrations/...core_data.sql); the parity test
// (tests/cycle.parity.test.js) checks that against the database.

import { addDaysISO, dayNumber, daysBetween } from "./dates.js";

export const DEFAULT_CYCLE_LENGTH = 28;
export const DEFAULT_PERIOD_LENGTH = 5;
const MIN_GAP = 15;
const MAX_GAP = 60;
const MAX_STARTS = 7;
const LUTEAL_DAYS = 14;

/**
 * @param {string[]} periodStarts ISO dates of logged period starts (any order)
 * @param {number} defaultCycleLength the user's own setting, used until there is history
 */
export function predictCycle(periodStarts, defaultCycleLength = DEFAULT_CYCLE_LENGTH) {
  const starts = [...new Set(periodStarts)].sort(); // ascending ISO strings sort chronologically
  if (starts.length === 0) return null;

  const recent = starts.slice(-MAX_STARTS);
  const gaps = [];
  for (let i = 1; i < recent.length; i++) {
    const g = daysBetween(recent[i - 1], recent[i]);
    if (g >= MIN_GAP && g <= MAX_GAP) gaps.push(g);
  }

  const last = starts[starts.length - 1];
  let cycleLengthUsed = defaultCycleLength;
  let cyclesUsed = 0;
  let variabilityDays = null;
  if (gaps.length >= 2) {
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    cycleLengthUsed = Math.round(avg);
    cyclesUsed = gaps.length;
    const variance = gaps.reduce((a, g) => a + (g - avg) ** 2, 0) / (gaps.length - 1);
    variabilityDays = Math.round(Math.sqrt(variance) * 10) / 10;
  }

  const nextPeriodStart = addDaysISO(last, cycleLengthUsed);
  const ovulationDate = addDaysISO(nextPeriodStart, -LUTEAL_DAYS);
  return {
    basedOnPeriodStart: last,
    cycleLengthUsed,
    cyclesUsed,
    variabilityDays,
    nextPeriodStart,
    ovulationDate,
    fertileStart: addDaysISO(ovulationDate, -5),
    fertileEnd: addDaysISO(ovulationDate, 1),
  };
}

/**
 * What to show "today". `periods` are [{start, end}] ISO strings.
 * Handles the overdue case honestly: if the estimate has passed and no new period was
 * logged, we say the period may be late — we do NOT silently roll the estimate forward.
 */
export function describeToday(periods, cycleSettings, todayIso) {
  const starts = periods.map((p) => p.start).filter((s) => s <= todayIso);
  if (starts.length === 0) return null;

  const periodLength = cycleSettings?.periodLength ?? DEFAULT_PERIOD_LENGTH;
  const pred = predictCycle(starts, cycleSettings?.cycleLength ?? DEFAULT_CYCLE_LENGTH);
  const lastStart = pred.basedOnPeriodStart;
  const lastEntry = periods.find((p) => p.start === lastStart);
  const cycleDay = daysBetween(lastStart, todayIso) + 1;

  const daysUntilNext = daysBetween(todayIso, pred.nextPeriodStart);
  const overdueDays = daysUntilNext < 0 ? -daysUntilNext : 0;
  const isOverdue = overdueDays > 0;

  const loggedEnd = lastEntry?.end ?? null;
  const onPeriodNow = loggedEnd ? todayIso <= loggedEnd : cycleDay <= periodLength;
  const inFertile = !isOverdue && todayIso >= pred.fertileStart && todayIso <= pred.fertileEnd;

  let phase = "Follicular phase";
  if (onPeriodNow) phase = "Menstrual phase";
  else if (isOverdue) phase = "Period may be late";
  else if (inFertile) phase = "Fertile window";
  else if (todayIso > pred.fertileEnd) phase = "Luteal phase";

  return {
    ...pred,
    lastStart,
    cycleDay,
    onPeriodNow,
    daysUntilNext,
    overdueDays,
    isOverdue,
    inFertile,
    phase,
    // A long gap since the last period is worth a gentle, non-diagnostic nudge.
    suggestCheckIn: cycleDay > 90,
  };
}

/** Projected period + fertile windows for the calendar (estimates only). */
export function projectedRanges(periods, cycleSettings, todayIso, count = 4) {
  const starts = periods.map((p) => p.start).filter((s) => s <= todayIso);
  const pred = predictCycle(starts, cycleSettings?.cycleLength ?? DEFAULT_CYCLE_LENGTH);
  if (!pred) return { periodRanges: [], fertileRanges: [] };
  const periodLength = cycleSettings?.periodLength ?? DEFAULT_PERIOD_LENGTH;
  const L = pred.cycleLengthUsed;

  // First projected start: the estimate, or — if it's already past — today (late), then forward.
  let first = pred.nextPeriodStart;
  if (first < todayIso) first = todayIso;
  const periodRanges = [];
  const fertileRanges = [];
  for (let i = 0; i < count; i++) {
    const start = addDaysISO(first, L * i);
    periodRanges.push({ start, end: addDaysISO(start, periodLength - 1) });
    const ov = addDaysISO(start, -LUTEAL_DAYS);
    fertileRanges.push({ start: addDaysISO(ov, -5), end: addDaysISO(ov, 1) });
  }
  return { periodRanges, fertileRanges };
}

export function inRange(isoDay, range) {
  return dayNumber(isoDay) >= dayNumber(range.start) && dayNumber(isoDay) <= dayNumber(range.end);
}
