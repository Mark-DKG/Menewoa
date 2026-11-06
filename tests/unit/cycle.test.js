import { test } from "node:test";
import assert from "node:assert/strict";
import { predictCycle, describeToday, projectedRanges } from "../../src/lib/cycle.js";

test("no history -> no prediction", () => {
  assert.equal(predictCycle([]), null);
  assert.equal(describeToday([], {}, "2026-06-01"), null);
});

test("one start uses the user's own default length", () => {
  const p = predictCycle(["2026-05-01"], 30);
  assert.equal(p.cycleLengthUsed, 30);
  assert.equal(p.cyclesUsed, 0);
  assert.equal(p.nextPeriodStart, "2026-05-31");
  assert.equal(p.ovulationDate, "2026-05-17");
  assert.equal(p.fertileStart, "2026-05-12");
  assert.equal(p.fertileEnd, "2026-05-18");
});

test("two gaps are required before history overrides the default", () => {
  assert.equal(predictCycle(["2026-01-01", "2026-01-29"], 31).cycleLengthUsed, 31);
  const p = predictCycle(["2026-01-01", "2026-01-29", "2026-02-28"], 35);
  assert.equal(p.cycleLengthUsed, 29); // (28 + 30) / 2
  assert.equal(p.cyclesUsed, 2);
});

test("outlier gaps (<15 or >60 days) are ignored", () => {
  const p = predictCycle(["2025-06-01", "2026-01-01", "2026-01-29", "2026-02-28", "2026-03-10"], 28);
  // gaps: 214 (ignored), 28, 30, 10 (ignored) -> only 2 usable
  assert.equal(p.cyclesUsed, 2);
  assert.equal(p.cycleLengthUsed, 29);
});

test("only the 7 most recent starts count", () => {
  const starts = [];
  let d = "2025-01-01";
  const add = (iso, n) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + n)).toISOString().slice(0, 10);
  for (let i = 0; i < 12; i++) { starts.push(d); d = add(d, i < 5 ? 40 : 26); }
  const p = predictCycle(starts, 28);
  assert.equal(p.cycleLengthUsed, 26);
  assert.equal(p.cyclesUsed, 6);
});

test("duplicates and unordered input are handled", () => {
  const a = predictCycle(["2026-02-28", "2026-01-01", "2026-01-29", "2026-01-29"], 28);
  const b = predictCycle(["2026-01-01", "2026-01-29", "2026-02-28"], 28);
  assert.deepEqual(a, b);
});

test("describeToday: on-period, fertile, luteal phases", () => {
  const periods = [{ start: "2026-05-01", end: "2026-05-05" }];
  const s = { cycleLength: 28, periodLength: 5 };
  assert.equal(describeToday(periods, s, "2026-05-03").phase, "Menstrual phase");
  assert.equal(describeToday(periods, s, "2026-05-03").cycleDay, 3);
  assert.equal(describeToday(periods, s, "2026-05-08").phase, "Follicular phase");
  assert.equal(describeToday(periods, s, "2026-05-14").phase, "Fertile window"); // ovulation 5/15
  assert.equal(describeToday(periods, s, "2026-05-22").phase, "Luteal phase");
  assert.equal(describeToday(periods, s, "2026-05-22").daysUntilNext, 7);
});

test("describeToday: an open-ended period (no end logged) is 'on period' only for periodLength days", () => {
  const periods = [{ start: "2026-05-01", end: null }];
  const s = { cycleLength: 28, periodLength: 5 };
  assert.equal(describeToday(periods, s, "2026-05-05").onPeriodNow, true);
  assert.equal(describeToday(periods, s, "2026-05-06").onPeriodNow, false);
});

test("describeToday: overdue is reported honestly, not rolled forward", () => {
  const periods = [{ start: "2026-05-01", end: "2026-05-05" }];
  const s = { cycleLength: 28, periodLength: 5 };
  const d = describeToday(periods, s, "2026-06-03"); // expected 5/29 -> 5 days late
  assert.equal(d.isOverdue, true);
  assert.equal(d.overdueDays, 5);
  assert.equal(d.daysUntilNext, -5);
  assert.equal(d.phase, "Period may be late");
  assert.equal(d.inFertile, false);
  assert.equal(d.nextPeriodStart, "2026-05-29");
  assert.equal(d.suggestCheckIn, false);
  assert.equal(describeToday(periods, s, "2026-08-10").suggestCheckIn, true);
});

test("describeToday ignores future-dated entries", () => {
  const periods = [{ start: "2026-05-01", end: null }, { start: "2026-07-01", end: null }];
  assert.equal(describeToday(periods, { cycleLength: 28, periodLength: 5 }, "2026-05-10").lastStart, "2026-05-01");
});

test("projectedRanges starts from the estimate, or today when late", () => {
  const periods = [{ start: "2026-05-01", end: "2026-05-05" }];
  const s = { cycleLength: 28, periodLength: 5 };
  const r = projectedRanges(periods, s, "2026-05-10", 3);
  assert.deepEqual(r.periodRanges[0], { start: "2026-05-29", end: "2026-06-02" });
  assert.deepEqual(r.periodRanges[1], { start: "2026-06-26", end: "2026-06-30" });
  assert.deepEqual(r.fertileRanges[0], { start: "2026-05-10", end: "2026-05-16" });
  const late = projectedRanges(periods, s, "2026-06-03", 1);
  assert.equal(late.periodRanges[0].start, "2026-06-03");
});
