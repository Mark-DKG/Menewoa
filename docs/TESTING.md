# Testing — and what has actually been run

| Suite | Where | How to run | Status when this was written |
|---|---|---|---|
| Database security & behaviour (RLS isolation, grants, roles, validation, partner sharing, admin/audit, lifecycle, content, **SQL↔JS prediction parity**, seed) | `supabase/tests/*.sql` | `npm run test:db` (needs local Postgres binaries, or `TEST_DATABASE_URL` to an empty disposable DB) | **Executed: 524 assertions passed, 0 failed** (Postgres 16 with a minimal Supabase shim) |
| Pure-logic unit tests (dates/DST, cycle estimates, validation, errors, env guard) | `tests/unit/*.test.js` | `npm test` | **Executed: passing** |
| Whole-app bundle & screen render check | ad-hoc (esbuild + React server render, stubs for lucide/supabase) | n/a | **Executed:** all screens/states render; undefined-name type check clean |
| Real-browser checks of public routes (theme toggle, no-flash, OS preference, route guard, weak-password, friendly errors, storage contents, CSP with the real `vercel.json` headers, service-worker cache/purge) | same checks as `tests/e2e/public-and-theme.spec.js` | `npm run test:e2e` | **Executed in Chromium against a stubbed bundle** (see caveat) |
| Component tests (Vitest + Testing Library) | `tests/components/*.test.jsx` | `npm run test:components` | **Written, NOT run** — Vitest/jsdom weren't installable where this was built |
| Playwright specs | `tests/e2e/*.spec.js` | `npm run test:e2e` | **Written, NOT run as specs** (public-route logic was exercised via a hand-rolled Chromium script). `with-backend.spec.js` needs a disposable Supabase project (`E2E_BACKEND=1`) |
| Edge Functions | `supabase/functions/*` | `supabase functions serve` | **Written, NOT run** (no Deno available). Syntax-checked only |
| `vite build` + Tailwind output | — | `npm run build` | **NOT run** (packages couldn't be installed). Run it first; fix anything it reports |

**Caveats you should know**
* The browser checks ran against an esbuild bundle *without Tailwind CSS compiled*, so they prove behaviour (theme, routing, CSP, storage, service worker) — **not visual layout or responsive design**. Do a visual pass in light + dark at phone width after `npm run build`.
* No test has talked to a live Supabase Auth server. Sign-up, email verification, password reset, session expiry and the Edge Functions are untested end-to-end.
* Coverage of "happy-path" UI journeys depends on the written-but-unrun Playwright backend specs.

## Required scenarios (and where they live)
1. Sign-up validation & role-not-from-email — `auth.test.jsx`, `public-and-theme` #7, `with-backend` #11
2. Login errors are friendly — `auth.test.jsx`, `public-and-theme` #8
3. Route guard — `public-and-theme` #6
4. RLS: users cannot read/write others' data — `20_rls_isolation.sql`
5. Partner sharing, consent, expiry, revocation, block — `50_partner_sharing.sql`, `partner-sharing.test.jsx`, `with-backend` #12
6. Admin separation, audit, break-glass — `30_roles_admin.sql`, `60_admin_privacy.sql`
7. Prediction logic, timezone/DST, validation — `tests/unit/*`, `40_cycle_validation.sql`, `90_prediction_parity.sql`
8. Theme toggle — `theme.test.jsx`, `public-and-theme` #2–#4, `with-backend` #13
9. Account deletion & export — `70_lifecycle.sql`, `with-backend` #14
10. No health data in browser storage — `privacy-and-storage.test.jsx`, `public-and-theme` #9

## E2E against a backend
Create a **disposable** Supabase project, apply migrations, turn **Confirm email off**, then:
```bash
E2E_BACKEND=1 E2E_SUPABASE_URL=https://<ref>.supabase.co E2E_SUPABASE_ANON_KEY=... npx playwright test with-backend
```
Never point this at production — it creates and deletes accounts.

## Regenerating the parity fixture
`node tests/parity/generate.mjs` rewrites `tests/parity/scenarios.json` from `src/lib/cycle.js`; `npm test` fails if it's stale, and `npm run test:db` fails if the SQL function disagrees.

## Backup / restore drill
`npm run test:backup` (needs local Postgres binaries and `age`) builds two throwaway databases from
the migrations, backs one up with `scripts/backup.sh`, restores it into the other with
`scripts/restore.sh`, and checks: identical row counts, no plaintext in the ciphertext, wrong key
rejected, populated target refused, audit-log immutability and triggers intact after restore.
It does not exercise the hosted Supabase `auth` schema; see `docs/BACKUPS.md`.
