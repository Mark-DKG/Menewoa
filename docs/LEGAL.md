# Legal pages & consent — how it works and what counsel must finish

**Status: DRAFT. Not legal advice.** The Terms of Service (`/terms`) and Privacy Policy (`/privacy`) were
written to match what the software actually does. A lawyer qualified in the jurisdictions where you operate
must review them before real people store health data. Until then the pages show a *"Draft, pending legal
review"* banner and highlight every unfilled `[placeholder]`.

## Where things live

| What | File |
|---|---|
| Version, status, operator details (single source of truth) | `src/config/legal.js` |
| The text of both documents | `src/config/legalContent.js` |
| Page layout, `/terms`, `/privacy` | `src/screens/Legal.jsx` |
| Sign-up checkboxes, in-app consent gate | `src/screens/AuthScreens.jsx` (`SignUp`, `ConsentGate`) |
| Consent record (DB), `record_consent()` RPC | `supabase/migrations/20261106000700_consent_record.sql` |
| Tests | `tests/unit/legal.test.js`, `tests/components/auth.test.jsx`, `supabase/tests/96_consent.sql`, `tests/e2e/public-and-theme.spec.js` |

## Finishing it (checklist)

1. Fill the placeholders in `src/config/legal.js`: `operator`, `contactEmail`, `governingLaw`, `regulator`,
   `emailProvider`. Put a real mailbox in `contactEmail` — people are told to write to it to exercise their rights.
2. Have counsel edit `src/config/legalContent.js`. Resolve the bracketed note in *Terms → Our responsibility*.
3. Set `status: "final"`. `npm test` then **fails** if any placeholder or counsel note is still present.
4. Keep `termsVersion` as is for wording fixes. **Bump it to the new date for a material change**: every user
   (admins included) sees the consent gate and must accept again; women re-confirm only if health consent is missing.
5. Deploy the migration before the frontend (already applied to the live project).

## How consent is recorded

* Sign-up sends `terms_version` and `health_consent` as auth metadata. These are **claims**: the
  `handle_new_user` trigger accepts only a well-formed `YYYY-MM-DD` version, stamps the time itself with `now()`,
  and records health consent only for the woman role. Partners are never asked for health consent (they log none).
* Clients have **no UPDATE grant** on `terms_version`, `terms_accepted_at`, `health_consent_at`. The only write
  path after sign-up is `record_consent()` (SECURITY DEFINER, authenticated only, rate-limited 20/h, audited).
* `needsConsent()` (in `legal.js`) drives the in-app gate: never accepted, older version, or a woman without
  health consent. The gate blocks the whole app, administrators included.
* `export_my_data()` includes a `consent` block, so people can see what they agreed to and when.
* Withdrawal: deleting the account removes the record (backups expire in ≤30 days). There is no "withdraw but keep
  account" button; the policy says withdrawal means stopping logging or deleting data/account. Counsel may want one.

## Every promise in the policy → the code that keeps it

| Statement in the policy | Enforced by |
|---|---|
| Nothing shared with a partner without consent; they see only switched-on items, a short recent window | `create_partner_invitation` (consent required), `sharing_permissions`, `get_partner_view()` |
| Invitation codes single-use, expire in 3 days, stored scrambled | `partner_invitations.code_hash`, `expires_at`, no select grant on `code_hash` |
| Admins see account basics + aggregates; groups under 5 hidden | `admin_list_users`, `admin_overview/analytics`, `k_suppress()` |
| Admin log access: reason category + ≥10-char reason, audited first, 90 days, notes excluded unless asked, rate-limited, not on self, visible to the user | `admin_read_user_logs()` (migration 5), `get_my_access_history()` |
| Account actions by admins need a recorded reason | `admin_set_user_status`, `admin_authorize_delete` |
| Download my data (3/day) | `export_my_data()` |
| Delete account removes data immediately; backups ≤30 days | `delete-account` Edge Function; `docs/BACKUPS.md` retention |
| Notifications pruned at 90 days; used/expired invitations at 30; rate-limit counters at 2 days | `prune_expired_data()` and `enforce_rate_limit` |
| Audit log kept, contains no health data | `audit_logs` (append-only, metadata only) |
| Push payloads are generic; lock-screen detail is opt-in | `send-notifications` Edge Function, `show_details_on_lock_screen` |
| Data stored in London | Supabase project region eu-west-2 |
| 18+ | Sign-up checkbox text, Terms; **not technically enforced** (no date-of-birth collected) |

If you change behaviour, change the policy in the same commit. `tests/unit/legal.test.js` guards the key phrases.

## Questions for counsel

1. **Applicable law.** Operator and users appear to be in Ghana: the Data Protection Act, 2012 (Act 843) and the
   Data Protection Commission. Does the operator need to register as a data controller? How are health data
   ("special personal data") and consent handled under it? Do users elsewhere (UK/EU) bring GDPR into scope?
2. **Special-category consent.** Is a separate, explicit tick at sign-up plus the in-app gate sufficient? Should the
   consent text be longer? Do we need a withdrawal mechanism short of deleting the account?
3. **Administrator access.** The original brief wanted admins to read individual logs and *not* mention it in the
   privacy statement. We disclose it, constrain it and show it to the user; counsel should confirm the disclosed
   purposes (user request, safety investigation, legal obligation, technical support) and the 90-day window.
4. **International transfers.** Data is stored in the UK (Supabase London); Vercel serves pages globally; push
   services are run by Google/Apple/Mozilla/Microsoft; the email provider is TBD. Is the current wording enough?
5. **Retention.** Audit logs are kept indefinitely and survive account deletion (they hold the target user's ID, a
   reason and a category, never health data). Is indefinite acceptable, or should it be time-limited?
6. **Backups.** Encrypted backups keep deleted data for ≤30 days. Is it fine to say so in the policy, as drafted?
7. **Age.** 18+ is a self-declaration. Is that adequate for this audience? Is a minimum age of 18 right locally?
8. **Terms.** Limitation of liability, indemnity, governing law/venue, and dispute process. Partner-sharing
   duties and what happens on coercion or safety reports (the policy lets us act on reports; define the process).
9. **Breach notification.** Policy promises notice to users and the regulator "as the law requires". Do we need an
   internal incident-response procedure and timelines?
10. **Operator identity.** Individual vs company, and whether the "9DEVs" brand should appear as the operator.
