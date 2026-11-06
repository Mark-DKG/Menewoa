import { test } from "node:test";
import assert from "node:assert/strict";
import * as v from "../../src/lib/validation.js";

test("email", () => {
  assert.equal(v.validateEmail("a@b.co"), null);
  assert.ok(v.validateEmail(""));
  assert.ok(v.validateEmail("no-at-sign"));
  assert.ok(v.validateEmail("a@b"));
  assert.ok(v.validateEmail("a b@c.com"));
  assert.ok(v.validateEmail("a@b.com".padStart(300, "x")));
});

test("password", () => {
  assert.equal(v.validatePassword("correct horse 42"), null);
  assert.ok(v.validatePassword("short1"));
  assert.ok(v.validatePassword("aaaaaaaaaaaa"));
  assert.ok(v.validatePassword("onlylettersbutlong"));
  assert.ok(v.validatePassword("1234567890123"));
  assert.ok(v.validatePassword("x1".repeat(70)));
});

test("display name", () => {
  assert.equal(v.validateDisplayName("Ama"), null);
  assert.ok(v.validateDisplayName("   "));
  assert.ok(v.validateDisplayName("x".repeat(81)));
});

test("period dates", () => {
  const today = "2026-06-15";
  assert.equal(v.validatePeriodDates("2026-06-10", "2026-06-14", today), null);
  assert.equal(v.validatePeriodDates("2026-06-10", null, today), null);
  assert.equal(v.validatePeriodDates("2026-06-16", null, today), null); // +1 day tolerance for time zones
  assert.ok(v.validatePeriodDates("2026-06-17", null, today));
  assert.ok(v.validatePeriodDates("2026-06-10", "2026-06-09", today));
  assert.ok(v.validatePeriodDates("2026-05-01", "2026-05-20", today));
  assert.ok(v.validatePeriodDates("1999-12-31", null, today));
  assert.ok(v.validatePeriodDates("2026-02-30", null, today));
  assert.ok(v.validatePeriodDates("", null, today));
});

test("cycle settings, daily log, report, invite code", () => {
  assert.equal(v.validateCycleSettings(28, 5), null);
  assert.ok(v.validateCycleSettings(14, 5));
  assert.ok(v.validateCycleSettings(61, 5));
  assert.ok(v.validateCycleSettings(28, 0));
  assert.ok(v.validateCycleSettings(28.5, 5));
  assert.equal(v.validateDailyLog({ sleepHours: 7.5, energyLevel: 3, note: "ok" }), null);
  assert.ok(v.validateDailyLog({ sleepHours: 25 }));
  assert.ok(v.validateDailyLog({ energyLevel: 6 }));
  assert.ok(v.validateDailyLog({ note: "n".repeat(2001) }));
  assert.equal(v.validateReport("This is a real description"), null);
  assert.ok(v.validateReport("short"));
  assert.equal(v.validateInviteCode("abcde-fghjk"), null);
  assert.equal(v.validateInviteCode("ABCDE FGHJK"), null);
  assert.ok(v.validateInviteCode("ABC"));
});

test("cleanText strips control characters but keeps normal text", () => {
  assert.equal(v.cleanText("  hi\u0000 there\u0007  "), "hi there");
  assert.equal(v.cleanText("<b>bold</b> & 'quotes'"), "<b>bold</b> & 'quotes'"); // escaping is React's job
  assert.equal(v.cleanText(null), "");
});
