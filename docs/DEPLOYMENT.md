# Deployment (Vercel + Supabase)

## Quick path for this project (status as of 6 Nov 2026)
Already done: Supabase project `menewoa` (ref `zeoqtdynnzqnhbcgpenb`, London) has all 8 migrations, the seed, the `delete-account` and `admin-delete-user` functions; Vercel project `menewoa` has `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`; Vercel SSO protection is off.

Left, in order:
1. **Push this folder to a private GitHub repo**, then in Vercel: *menewoa → Settings → Git → Connect* that repo (production branch `main`). Vercel builds on every push. CI (`.github/workflows/ci.yml`) runs unit, component and database tests plus the build.
   Or from this folder: `npm install && npx vercel link --project menewoa && npx vercel deploy --prod`.
2. Commit the `package-lock.json` that `npm install` creates (CI then uses `npm ci`).
3. Supabase → Authentication: Site URL `https://menewoa.vercel.app`; redirect URLs `https://menewoa.vercel.app/login` and `/reset-password`; **Confirm email ON**; custom SMTP.
4. Fill the placeholders in `src/config/legal.js`, have counsel review, set `status: "final"` (see `docs/LEGAL.md`).
5. Sign up as yourself, then create the first admin (section 5).
6. Backups (`docs/BACKUPS.md`), then the post-deploy checklist (section 6).

## 1. Supabase project
1. Create a project (choose a region close to your users; note the **Project URL** and **publishable/anon key**).
2. **Apply the schema** — either `supabase link --project-ref <ref> && supabase db push`, or paste each file of `supabase/migrations/` into the SQL editor **in filename order**. They are written to run once on an empty project.
3. Run `supabase/seed.sql` (safe to re-run). Have a clinician review the articles before launch.
4. **Never** put the `service_role` key in Vercel's `VITE_*` variables. The app refuses to start if it detects one.

## 2. Authentication settings (Dashboard → Authentication)
| Setting | Value |
|---|---|
| Email provider → **Confirm email** | **ON** (users must verify before first sign-in) |
| Site URL | your production URL |
| Redirect URLs | `https://<your-domain>/login`, `https://<your-domain>/reset-password` (and your preview-domain pattern if you use previews) |
| Password policy | min length **10**, require letters + digits (and enable leaked-password protection on paid plans) |
| Rate limits | keep defaults or tighten; configure **custom SMTP** before launch (the built-in mailer is for testing only) |
| Sessions | enable refresh-token rotation (default); optionally set a time-box / inactivity timeout (Pro) |
| Email templates | add your branding; keep links as `{{ .ConfirmationURL }}` |

## 3. Edge Functions
```bash
supabase functions deploy delete-account admin-delete-user send-notifications
supabase secrets set ALLOWED_ORIGIN=https://<your-domain> \
  CRON_SECRET=$(openssl rand -hex 32) \
  VAPID_SUBJECT=mailto:support@<your-domain> VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=...
```
`ALLOWED_ORIGIN` defaults to `https://menewoa.vercel.app` (see `supabase/functions/_shared/http.ts`), so the
two deletion functions work without it. Set it only when the app is served from a different origin, such as a
custom domain. The origin is compared exactly: no trailing slash, and one origin only.
Generate VAPID keys with `npx web-push generate-vapid-keys`. Put only the **public** key in Vercel as `VITE_VAPID_PUBLIC_KEY` (optional — without it the notifications switch is hidden).

**Schedule notifications** (hourly) with pg_cron + pg_net, in the SQL editor:
```sql
select cron.schedule('menewoa-notify', '0 * * * *', $$
  select net.http_post(
    url := 'https://<ref>.functions.supabase.co/send-notifications',
    headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>'));
$$);
select cron.schedule('menewoa-prune', '30 3 * * *', $$ select public.prune_expired_data(); $$);
```
(Store the secret via Vault in production rather than inline.)

## 4. Vercel
1. Import the repo. Framework preset **Vite** (already in `vercel.json`).
2. Environment variables (Production **and** Preview): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, optional `VITE_VAPID_PUBLIC_KEY`.
3. Deploy. `vercel.json` provides the SPA fallback, HSTS, CSP, frame/MIME/referrer/permissions headers and cache rules.
4. If your Supabase project uses a custom domain, adjust `connect-src` in `vercel.json` (it currently allows `https://*.supabase.co` and `wss://*.supabase.co`; tighten to your exact project host).
5. After the first deploy, load the site, open DevTools → Console, and confirm there are **no CSP violations**.

## 5. Create the first administrator (SQL only)
Admins can only be created by someone with database access — there is no UI or API path to self-promote.
```sql
-- the person must already have signed up and verified their email
insert into public.admin_users (user_id, admin_role, granted_by)
select id, 'owner', id from auth.users where email = 'you@example.com';
```
Roles: `owner` (everything incl. audit log, deletion, settings), `support` (users, reports, audited log access), `content` (articles/FAQs/ideas/announcements). Revoke with `update public.admin_users set revoked_at = now() where user_id = ...`.
Enrol TOTP MFA for every admin, then (and only then) enable enforcement: `update public.app_settings set value = 'true' where key = 'require_admin_mfa';` — the database then refuses admin functions to sessions without AAL2. *(The app has no MFA enrolment screen yet; enrol via Supabase Auth API/Dashboard tooling first, or you will lock yourself out.)*

## 6. Post-deploy checklist
- [ ] Sign up two accounts (woman + partner), verify email, complete an invitation round-trip and a revocation.
- [ ] Try `/app` signed out → redirected to `/login`.
- [ ] Reset-password email arrives and the link lands on `/reset-password`.
- [ ] `select * from audit_logs order by id desc limit 5;` shows your admin actions.
- [ ] Supabase **Security Advisor** shows no RLS warnings.
- [ ] Backups: set up `db-backup` + `keepalive` per `docs/BACKUPS.md` (free plan) or enable Supabase backups/PITR (Pro); run one restore drill on a scratch project before real users sign up. State the retention (30 days for the workflow) in your privacy policy.
- [ ] Run `npm audit --omit=dev` and review.
