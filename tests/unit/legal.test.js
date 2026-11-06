import { test } from "node:test";
import assert from "node:assert/strict";
import { LEGAL, fill, needsConsent, unresolvedPlaceholders } from "../../src/config/legal.js";
import { PRIVACY, TERMS } from "../../src/config/legalContent.js";

const flatten = (doc) =>
  [doc.intro, ...doc.sections.flatMap((s) => [s.title, ...s.blocks.flatMap((b) => b.p ? [b.p] : b.note ? [b.note] : b.ul ?? [])])].join("\n");

test("termsVersion matches the database check (YYYY-MM-DD)", () => {
  assert.match(LEGAL.termsVersion, /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);
});

test("a final (non-draft) release has no unfilled placeholders", () => {
  if (LEGAL.status === "draft") return; // allowed while counsel is reviewing
  assert.deepEqual(unresolvedPlaceholders(), [], "fill every [PLACEHOLDER] in src/config/legal.js before setting status to final");
  assert.doesNotMatch(flatten(PRIVACY) + flatten(TERMS), /\[Counsel/);
});

test("the draft detector flags placeholders and ignores real values", () => {
  assert.deepEqual(unresolvedPlaceholders({ a: "[CONTACT EMAIL]", b: "help@example.com", c: "[the laws of X]" }), ["a", "c"]);
});

test("every {token} in the documents is defined", () => {
  for (const text of [flatten(PRIVACY), flatten(TERMS)]) {
    for (const [, k] of text.matchAll(/\{(\w+)\}/g)) assert.ok(k in LEGAL, `unknown token {${k}}`);
  }
  assert.doesNotMatch(fill(flatten(PRIVACY) + flatten(TERMS)), /\{\w+\}/);
});

test("section ids are unique within each document", () => {
  for (const doc of [PRIVACY, TERMS]) {
    const ids = doc.sections.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length);
  }
});

// These statements describe what the software does. If one of them stops being true, the policy
// must change in the same commit — and this test is the reminder.
test("the privacy policy keeps its key disclosures", () => {
  const t = fill(flatten(PRIVACY));
  for (const re of [
    /administrator/i, /audit log/i, /reason/i, /90 days/, /fewer than 5/,
    /explicit consent/i, /30 days/, /London/, /18/, /push/i, /not medical advice|not a medical device/i,
    /do not sell/i,
  ]) assert.match(t, re, String(re));
});

test("the terms keep the medical disclaimer, age limit and partner duties", () => {
  const t = fill(flatten(TERMS));
  for (const re of [/not contraception|not a medical service/i, /18 or over/, /confidential/i, /governed by/i]) assert.match(t, re, String(re));
});

test("needsConsent: new users, old versions, and women without health consent", () => {
  const ok = { role: "woman", terms_version: LEGAL.termsVersion, terms_accepted_at: "2026-11-06T00:00:00Z", health_consent_at: "2026-11-06T00:00:00Z" };
  assert.equal(needsConsent(ok), false);
  assert.equal(needsConsent({ ...ok, terms_accepted_at: null }), true);
  assert.equal(needsConsent({ ...ok, terms_version: null }), true);
  assert.equal(needsConsent({ ...ok, terms_version: "2025-01-01" }), true);
  assert.equal(needsConsent({ ...ok, health_consent_at: null }), true);
  assert.equal(needsConsent({ ...ok, role: "partner", health_consent_at: null }), false); // partners log no health data
  assert.equal(needsConsent({ ...ok, terms_version: "2999-01-01" }), false);
  assert.equal(needsConsent(null), false);
});
