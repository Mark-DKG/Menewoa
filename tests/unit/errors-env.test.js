import { test } from "node:test";
import assert from "node:assert/strict";
import { friendlyError, isSessionError } from "../../src/lib/errors.js";
import { validateEnv } from "../../src/config/env.js";

test("friendly errors never expose raw technical text", () => {
  assert.match(friendlyError({ message: "period_overlaps_existing" }), /overlaps/);
  assert.match(friendlyError({ message: "Invalid login credentials" }), /don't match/);
  assert.match(friendlyError({ message: "Email not confirmed" }), /confirm your email/);
  assert.match(friendlyError({ code: "54000", message: "x" }), /fast|wait/i);
  assert.equal(friendlyError({ message: "relation \"profiles\" does not exist at SELECT" }), "Something went wrong. Please try again.");
  assert.doesNotMatch(friendlyError({ message: "duplicate key value violates unique constraint \"users_pkey\"", code: "23505" }), /users_pkey/);
});

test("session errors are recognised", () => {
  assert.equal(isSessionError({ message: "JWT expired" }), true);
  assert.equal(isSessionError({ status: 401, message: "x" }), true);
  assert.equal(isSessionError({ message: "something else" }), false);
});

const jwt = (role) => "h." + Buffer.from(JSON.stringify({ role })).toString("base64url") + ".s";

test("env: accepts https URL + anon key", () => {
  const r = validateEnv({ VITE_SUPABASE_URL: "https://abc.supabase.co", VITE_SUPABASE_ANON_KEY: jwt("anon") });
  assert.equal(r.ok, true);
  assert.equal(validateEnv({ VITE_SUPABASE_URL: "https://abc.supabase.co", VITE_SUPABASE_ANON_KEY: "sb_publishable_abc" }).ok, true);
  assert.equal(validateEnv({ VITE_SUPABASE_URL: "http://localhost:54321", VITE_SUPABASE_ANON_KEY: jwt("anon") }).ok, true);
});

test("env: refuses to start with a service-role or secret key", () => {
  const a = validateEnv({ VITE_SUPABASE_URL: "https://abc.supabase.co", VITE_SUPABASE_ANON_KEY: jwt("service_role") });
  assert.equal(a.ok, false);
  assert.match(a.problems.join(" "), /SERVICE-ROLE/);
  const b = validateEnv({ VITE_SUPABASE_URL: "https://abc.supabase.co", VITE_SUPABASE_ANON_KEY: "sb_secret_abc" });
  assert.equal(b.ok, false);
  assert.match(b.problems.join(" "), /SECRET/);
});

test("env: reports missing or malformed values", () => {
  assert.equal(validateEnv({}).ok, false);
  assert.equal(validateEnv({ VITE_SUPABASE_URL: "http://example.com", VITE_SUPABASE_ANON_KEY: jwt("anon") }).ok, false);
  assert.equal(validateEnv({ VITE_SUPABASE_URL: "nonsense", VITE_SUPABASE_ANON_KEY: jwt("anon") }).ok, false);
  assert.equal(validateEnv({ VITE_SUPABASE_URL: "https://abc.supabase.co", VITE_SUPABASE_ANON_KEY: "garbage" }).ok, false);
});
