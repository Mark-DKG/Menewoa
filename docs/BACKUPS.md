# Backups and keep-alive

Menewoa stores health data, so the free-plan gaps (no Supabase backups, projects paused after
7 days of inactivity) are closed by two scheduled GitHub Actions jobs.

| Job | File | Schedule | What it does |
|-----|------|----------|--------------|
| Backup | `.github/workflows/db-backup.yml` | daily 03:17 UTC | `pg_dump` of schema `public` (schema + data) and of `auth.users`/`auth.identities` (data), encrypted with an **age public key**, uploaded as a workflow artifact kept **30 days** |
| Keep-alive | `.github/workflows/keepalive.yml` | every 2 days | one query against the database and one call to the Auth health endpoint |

## One-time setup
1. **Make the repository private**, and push this project to it.
2. Generate the key pair **on your own machine**: `age-keygen -o menewoa-backup-key.txt`. The line
   `# public key: age1...` is the recipient. Store the file in a password manager **and** offline.
   Without it the backups cannot be read — by anyone, including you.
3. Repository **secrets**: `SUPABASE_DB_URL` — Dashboard > Connect > *Session pooler* (port **5432**,
   user `postgres.<ref>`); `BACKUP_AGE_RECIPIENT` — the `age1...` public key.
4. Repository **variables**: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`.
5. Actions > *db-backup* > **Run workflow**, then download the artifact and do the restore drill below.
   Do the same for *keepalive*.

Why the session pooler: GitHub-hosted runners have no IPv6 and the free-plan direct host is
IPv6-only; the transaction pooler (6543) cannot run `pg_dump`.

## Restore
Needs a project where all `supabase/migrations/*.sql` are applied and there are no users yet
(a fresh project, or an emptied one):

```bash
TARGET_DATABASE_URL='postgres://...' scripts/restore.sh menewoa-<stamp>.tar.age menewoa-backup-key.txt
```
It prints the backup manifest, refuses to run against a database that already has accounts, loads
data with triggers suspended (so audit/immutability/prediction triggers don't re-fire), then
prints row counts to compare with the manifest. Triggers are back to normal afterwards.
Restoring `auth.users` through the hosted `postgres` role is the part I could only test against a
local stand-in for Supabase's `auth` schema, so **run the drill on a scratch project before you
need it**, and repeat it monthly. A backup you have not restored is a hope, not a backup.

`scripts/test-backup.sh` runs the whole backup → restore → compare cycle on throwaway local
Postgres clusters (also checks that the ciphertext holds no plaintext and a wrong key fails).

## Limits you should know about
* **Up to 24 h of data can be lost** (daily dump, no point-in-time recovery). Upgrade to Supabase
  Pro (daily backups, PITR add-on) before this matters.
* **Retention vs. deletion.** An account deleted today is still in dumps for up to 30 days. This is
  stated in `docs/PRIVACY.md`; if you change `retention-days`, change that text too.
* **Failures are only visible if you look.** GitHub emails the person who last edited the workflow
  when a scheduled run fails. Scheduled workflows can also be disabled by GitHub after 60 days
  without repository activity — check the Actions tab monthly (the restore drill does this).
* The job holds a database credential (`SUPABASE_DB_URL`). Rotate the database password if the
  repository or a collaborator's account is ever compromised.
* Edge Function secrets, Auth settings and the Vercel config are **not** in the dump.
