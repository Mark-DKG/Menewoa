# Menewoa

*Together, One Step Ahead.* A private menstrual-cycle companion for women and their partners —
React + Vite + Tailwind PWA on Supabase (Auth, Postgres with Row Level Security, Edge Functions),
deployed on Vercel.

> **Status:** feature-complete and security-reviewed in code, but **not yet run end-to-end against a
> live Supabase project or built with `vite build` in the environment it was written in.** Read
> [docs/TESTING.md](docs/TESTING.md) for exactly what has and hasn't been executed before you launch.

## What it does

| Role | Can do |
|---|---|
| **Woman** | Onboarding, log periods / symptoms / mood / sleep / energy / notes, calendar, estimates (labelled as estimates), insights, invite a partner with granular consent, privacy dashboard (see every admin access), export & delete her data |
| **Partner** | Accept a one-time invitation after seeing exactly what is offered, view only what she shares (a short recent window, never history), support suggestions, disconnect / block |
| **Admin** (owner / support / content) | Aggregated analytics (small groups suppressed), user moderation with reasons, reports triage, content CRUD, append-only audit log, audited break-glass log access |

Day/night mode (sun/moon switch, follows the OS, no flash) works on every route.

## Quick start

```bash
npm install
cp .env.example .env          # add your Supabase URL + publishable (anon) key
npm run dev
```

1. Create a Supabase project, then apply `supabase/migrations/*.sql` in order (SQL editor or `supabase db push`) and `supabase/seed.sql`.
2. In Supabase → Authentication, follow [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) (email confirmation on, redirect URLs, password policy).
3. Deploy Edge Functions (`delete-account`, `admin-delete-user`, `send-notifications`).
4. Create your first administrator **in the SQL editor** (the app can never grant admin): see DEPLOYMENT.md §5.

## Scripts

| Command | Runs |
|---|---|
| `npm test` | Pure-logic unit tests (Node's built-in runner) + SQL↔JS prediction-parity file check |
| `npm run test:db` | Applies every migration to a throw-away Postgres and runs the SQL security suite (RLS, grants, sharing, admin, lifecycle, parity) |
| `npm run test:components` | Vitest + Testing Library component tests |
| `npm run test:e2e` | Playwright (backend-free scenarios always; full journeys with `E2E_BACKEND=1`) |

## Repository map

```
src/
  auth/        AuthProvider (Supabase Auth, session expiry, recovery)
  config/      env validation (refuses a service-role key in the browser)
  data/        api.js (all DB access), hooks.js
  lib/         dates (timezone-safe), cycle (estimates), validation, errors, router, push
  screens/     Landing, Auth, Woman, Partner, Admin, shared
  theme/       ThemeProvider + tokens
supabase/
  migrations/  6 ordered, idempotent-by-design SQL migrations (schema, RLS, functions, grants)
  functions/   Edge Functions (Deno)
  tests/       SQL security + behaviour tests
  seed.sql     starter articles / FAQs (needs medical review)
public/        sw.js, manifest, icons, theme-init.js
docs/          DEPLOYMENT, SECURITY, PRIVACY, LEGAL, BACKUPS, TESTING, ACCESSIBILITY
```

## Important honesty notes

* Menewoa gives **estimates** from a person's own history. It is not a medical device, does not detect or prevent pregnancy, and says so in the product.
* A small number of authorised administrators can open a user's logs **only** with a recorded reason; each access is audited and shown to the user. The privacy statement says this plainly.
* The seed articles need review by a qualified health professional before launch.
