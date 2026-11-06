#!/usr/bin/env bash
# Restore an encrypted Menewoa backup into an EMPTY-DATA database whose schema already
# exists (i.e. all supabase/migrations/*.sql applied, no users yet).
#
#   TARGET_DATABASE_URL=postgres://...  scripts/restore.sh backup.tar.age  /path/to/age-private-key.txt
#
# Refuses to run if the target already has accounts or profiles. Run it against a
# scratch project first to prove the backup works (docs/BACKUPS.md: monthly drill).
set -euo pipefail
: "${TARGET_DATABASE_URL:?set TARGET_DATABASE_URL}"
[[ $# -eq 2 ]] || { echo "usage: $0 <backup.tar.age> <age-identity-file>" >&2; exit 2; }
BACKUP=$1; IDENTITY=$2
umask 077
WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT

existing=$(psql "$TARGET_DATABASE_URL" -XAtc "select (select count(*) from auth.users) + (select count(*) from public.profiles)")
[[ "$existing" == "0" ]] || { echo "target already contains $existing users/profiles; refusing to restore into it" >&2; exit 1; }

age -d -i "$IDENTITY" -o "$WORK/bundle.tar" "$BACKUP"
tar -C "$WORK" -xf "$WORK/bundle.tar"
cat "$WORK/MANIFEST.txt"

# Migrations/seed pre-load a few rows (app_settings, symptom_catalog, content). Clear any
# non-empty public table so the backup's copy replaces them instead of colliding.
psql "$TARGET_DATABASE_URL" -X -v ON_ERROR_STOP=1 -q <<'SQL'
set session_replication_role = replica;
do $$
declare r record;
begin
  for r in select format('%I.%I', n.nspname, c.relname) as t
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('truncate table %s cascade', r.t);
  end loop;
end $$;
SQL

# replica role: skip triggers (on_auth_user_created, audit/immutability, prediction
# recompute) and FK checks while rows are loaded; the data already satisfies them.
export PGOPTIONS='-c session_replication_role=replica'
# auth.users must exist before profiles reference it.
pg_restore --dbname="$TARGET_DATABASE_URL" --data-only --no-owner --exit-on-error "$WORK/auth.dump"
pg_restore --dbname="$TARGET_DATABASE_URL" --data-only --no-owner --exit-on-error "$WORK/public.dump"
unset PGOPTIONS

echo "restored. Row counts in target:"
psql "$TARGET_DATABASE_URL" -XAtc "select 'profiles='||count(*) from public.profiles union all select 'period_entries='||count(*) from public.period_entries union all select 'audit_logs='||count(*) from public.audit_logs union all select 'auth_users='||count(*) from auth.users"
echo "Compare with MANIFEST.txt above."
