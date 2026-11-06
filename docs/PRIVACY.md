# Privacy & data handling

*(Engineering notes that back the in-app Privacy Policy and Terms of Service (see `docs/LEGAL.md`). Have counsel review before launch; this is not legal advice and GDPR/HIPAA/local-law applicability depends on your jurisdiction and operations.)*

## What is stored
Account (email, display name, time zone, role/status), cycle settings, period entries, symptoms, moods, daily sleep/energy/notes, partner connections & sharing permissions, notifications, push subscriptions (endpoint + keys), reports you file, and an audit trail of administrator actions about your account.

## Who can see what
| Who | Sees |
|---|---|
| You | Everything of yours |
| Your partner | Only what you switch on, only a short recent window, only while connected |
| Administrators | Account basics + k-anonymised aggregates by default. **Logs only via break-glass:** reason category + written reason, audited, rate-limited, 90-day window, notes excluded unless explicitly requested. You can see each access (category + time) under Profile → Privacy |
| Menewoa infrastructure providers | Supabase (database/auth), Vercel (static hosting). Fonts are self-hosted. No analytics/ads SDKs |

> **Note on a design decision.** The original brief asked that administrator access to individual logs *not* be mentioned in the privacy statement. That would mislead users about how their health data is handled, so the shipped statement discloses limited, audited administrator access (and the product shows each access to the person affected). If you want different wording, change it with your lawyer — but we recommend against omitting it.

## Retention (defaults; configure to your policy)
* Pending invitations expire after 3 days; expired/used rows are pruned by `prune_expired_data()`.
* Notifications older than 90 days and rate-limit counters older than 2 days are pruned by the same job; used/expired invitations are deleted after 30 days.
* Audit logs are kept indefinitely (they contain no health data and never reference foreign keys, so they survive account deletion).
* Account deletion removes all user rows immediately; copies persist in encrypted database backups for up to 30 days (see `docs/BACKUPS.md`).

## Consent record
The sign-up flow records acceptance of the Terms/Privacy Policy and, for women, explicit consent to process health information. Both are stored on `profiles` with server-set timestamps and the document version (clients cannot write them directly; the only post-sign-up path is the audited `record_consent()` RPC) and are included in the data export. A material change to the documents bumps `termsVersion` and re-prompts everyone. Full details, the claim-to-code map and the questions for counsel are in `docs/LEGAL.md`.

## User rights
* **Access / portability:** Profile → Privacy → *Download my data* (`export_my_data`, JSON, 3/day, audited).
* **Erasure:** Profile → *Delete account* (password re-authentication).
* **Correction:** edit or delete any entry in the app.
* **Consent:** partner sharing requires an explicit consent tick, is granular, and revocable instantly.

## Product claims
Predictions are labelled estimates. Menewoa never claims to detect or prevent pregnancy, is not contraception, and shows disclaimers where fertility information appears.
