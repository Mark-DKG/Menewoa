import { test } from "node:test";
import assert from "node:assert/strict";
import { isISODate, toISO, addDaysISO, daysBetween, asLocalDate, todayISO, fmt } from "../../src/lib/dates.js";

test("isISODate accepts real days only", () => {
  assert.equal(isISODate("2026-02-28"), true);
  assert.equal(isISODate("2028-02-29"), true);
  assert.equal(isISODate("2026-02-29"), false);
  assert.equal(isISODate("2026-13-01"), false);
  assert.equal(isISODate("2026-1-1"), false);
  assert.equal(isISODate("not a date"), false);
  assert.equal(isISODate(null), false);
});

test("ISO strings round-trip without drifting a day (no UTC parsing)", () => {
  for (const tz of ["UTC", "America/Los_Angeles", "Pacific/Kiritimati", "Africa/Accra"]) {
    process.env.TZ = tz;
    assert.equal(toISO("2026-03-01"), "2026-03-01", tz);
    assert.equal(asLocalDate("2026-03-01").getDate(), 1, tz);
  }
});

test("addDays / daysBetween across month, year, leap day and DST boundaries", () => {
  assert.equal(addDaysISO("2026-01-31", 1), "2026-02-01");
  assert.equal(addDaysISO("2026-12-31", 1), "2027-01-01");
  assert.equal(addDaysISO("2028-02-28", 1), "2028-02-29");
  assert.equal(addDaysISO("2026-03-01", -1), "2026-02-28");
  for (const tz of ["America/New_York", "Europe/London", "Australia/Sydney"]) {
    process.env.TZ = tz;
    assert.equal(daysBetween("2026-03-07", "2026-03-09"), 2, `US DST ${tz}`);
    assert.equal(daysBetween("2026-03-28", "2026-03-30"), 2, `EU DST ${tz}`);
    assert.equal(daysBetween("2026-10-03", "2026-10-05"), 2, `AU DST ${tz}`);
    assert.equal(addDaysISO("2026-03-07", 2), "2026-03-09", `add over DST ${tz}`);
  }
  assert.equal(daysBetween("2026-05-10", "2026-05-01"), -9);
});

test("todayISO uses the calendar day in the requested zone", () => {
  const instant = new Date("2026-06-15T23:30:00Z");
  assert.equal(todayISO("UTC", instant), "2026-06-15");
  assert.equal(todayISO("Pacific/Auckland", instant), "2026-06-16");
  assert.equal(todayISO("America/Los_Angeles", instant), "2026-06-15");
  assert.equal(todayISO("Not/AZone", instant), toISO(instant));
});

test("formatting an ISO day shows that day in every zone", () => {
  for (const tz of ["America/Los_Angeles", "Pacific/Kiritimati"]) {
    process.env.TZ = tz;
    assert.match(fmt("2026-03-01"), /1/);
    assert.match(fmt("2026-03-01"), /Mar/);
  }
});
