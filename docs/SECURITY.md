# Security model

## Principles
* **The database is the authority.** Every table has RLS; the browser is untrusted. UI route guards are convenience only.
* **Default deny.** Migration 6 revokes every privilege from `public/anon/authenticated`, then grants back per table, per **column**, and per function. `supabase/tests/10_privileges.sql` fails if a function becomes executable without being on the allowlist.
* **Roles are never inferred from email or client input.** `profiles.role` is set by a trigger from a whitelist (`partner` or else `woman`); `role` and `status` are not updatable by clients. Admin rights exist only as rows in `admin_users`, inserted via SQL by an owner.
* **Only public keys in the browser.** `src/config/env.js` refuses to start with a service-role key. Service-role use is confined to Edge Functions.

## Controls
| Area | Control |
|---|---|
| AuthN | Supabase Auth, PKCE, email verification, password reset, refresh-token rotation, generic errors that don't reveal whether an email exists |
| Passwords | ≥10 chars, letters+digits (client + server config) |
| Suspension | `active_uid()` returns null for suspended users → they lose all data access immediately |
| Partner access | Partners have **no** table access to health data. `get_partner_view()` returns a permission-filtered, minimal, recent-only payload and re-checks the active connection on every call → revocation is instant |
| Invitations | 10-char Crockford code, only its SHA-256 stored, 3-day expiry, single use, shown once, consent required; preview/redeem rate-limited (10/15 min); creation 5/hour |
| Rate limiting | `enforce_rate_limit()` in the database for invitations, reports, exports, push registration, admin log reads |
| Validation | CHECK constraints + triggers (dates not in future, ≤14-day periods, no overlaps, ranges, lengths); client validation is only for UX |
| Admin accountability | Append-only `audit_logs` (immutability triggers, no health data); break-glass `admin_read_user_logs` requires a reason category + ≥10-char reason, audits **before** returning data, returns ≤90 days, hides notes unless explicitly requested, rate-limited; the user sees each access in their Privacy dashboard |
| Analytics | k-anonymity: groups <5 suppressed |
| Deletion | Self-service via `delete-account` (password re-auth); owner-only `admin-delete-user` (DB authorises + audits, then service role deletes). FKs cascade all user data |
| Transport / browser | HSTS, strict CSP (`script-src 'self'`, no inline scripts), `frame-ancestors 'none'`, nosniff, referrer & permissions policies, COOP/CORP |
| XSS | React escaping; no `dangerouslySetInnerHTML`; user text is stripped of control characters; the theme bootstrap is an external file so CSP needs no `unsafe-inline` for scripts |
| Storage | No health data in `localStorage`/`sessionStorage` (only the theme word and Supabase's session token); not logged to console |
| PWA | Service worker caches only public static assets, ignores cross-origin (Supabase) traffic, purges on logout; push payloads are validated, generic, and cannot choose the click URL |
| Dependencies | Small footprint (React, supabase-js, lucide). Run `npm audit --omit=dev`. Fonts are self-hosted (no third-party font requests) |

## Known limitations / residual risks
* **Admin MFA enforcement exists in the database but there is no enrolment UI.** Until you enrol and enable `require_admin_mfa`, admin sessions are password-only. Do this before launch.
* A support-role administrator *can* read a user's logs (by design, with reason + audit + user visibility). Anyone with direct database/service-role access can bypass the app entirely — restrict that access, enable Supabase audit logging, and use least-privilege dashboard roles.
* The audit log is append-only to the application and to the `authenticated` role; a database superuser could still alter it. Ship logs to external storage if you need tamper-evidence.
* Rate limits that key on `auth.uid()` do not stop unauthenticated floods; rely on Supabase Auth's per-IP limits and Vercel's firewall/bot protection.
* `style-src-attr 'unsafe-inline'` is allowed because React sets inline `style` attributes; scripts remain strictly `'self'`.
* Backups are encrypted to an offline age key and retain deleted data for up to 30 days (`docs/BACKUPS.md`).
* The CSP allows `https://*.supabase.co`; tighten to your exact project host.
