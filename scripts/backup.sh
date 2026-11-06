#!/usr/bin/env bash
# Encrypted logical backup of a Menewoa database.
#
#   DATABASE_URL=postgres://...  AGE_RECIPIENT=age1...  scripts/backup.sh [out_dir]
#
# Produces  <out_dir>/menewoa-<UTC timestamp>.tar.age  containing
#   public.dump   - schema `public`, schema + data (custom format)
#   auth.dump     - DATA ONLY of auth.users / auth.identities (accounts + password hashes)
#   MANIFEST.txt  - row counts, pg_dump version, timestamp
# The plaintext only ever exists in a private temp dir (mode 700) that is removed on exit.
# The archive is encrypted to a PUBLIC age key: whoever runs this job (CI) cannot read
# it back. The matching private key stays offline with you — lose it and the backups
# are unrecoverable, so store it in a password manager AND somewhere offline.
#
# This is a LOGICAL dump: it contains health data. Treat the .age file as sensitive
# even though it is encrypted, and keep retention short (see docs/BACKUPS.md).
set -euo pipefail

: "${DATABASE_URL:?set DATABASE_URL (use the SESSION pooler URL, port 5432, from GitHub Actions: direct connections are IPv6-only on the free plan)}"
: "${AGE_RECIPIENT:?set AGE_RECIPIENT to an age public key (age1...)}"
[[ "$AGE_RECIPIENT" == age1* ]] || { echo "AGE_RECIPIENT must be an age PUBLIC key (starts with age1)" >&2; exit 2; }
OUT_DIR=${1:-.}
MIN_BYTES=${MIN_BACKUP_BYTES:-2000}

umask 077
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$OUT_DIR"
stamp=$(date -u +%Y%m%dT%H%M%SZ)

# rate_limit_events is operational noise; everything else in public is kept.
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-privileges --no-comments \
  --schema=public --exclude-table-data=public.rate_limit_events -f "$WORK/public.dump"
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-privileges --data-only \
  -t auth.users -t auth.identities -f "$WORK/auth.dump"

# Sanity: the dumps must be readable and contain the tables we depend on.
for t in profiles period_entries audit_logs admin_users; do
  pg_restore --list "$WORK/public.dump" | grep -q "TABLE DATA public $t " \
    || { echo "backup is missing table data entry for public.$t" >&2; exit 1; }
done
pg_restore --list "$WORK/auth.dump" | grep -q "TABLE DATA auth users " \
  || { echo "backup is missing auth.users" >&2; exit 1; }

{
  echo "created_utc=$stamp"
  echo "pg_dump=$(pg_dump --version)"
  echo "profiles=$(psql "$DATABASE_URL" -XAtc 'select count(*) from public.profiles')"
  echo "period_entries=$(psql "$DATABASE_URL" -XAtc 'select count(*) from public.period_entries')"
  echo "audit_logs=$(psql "$DATABASE_URL" -XAtc 'select count(*) from public.audit_logs')"
  echo "auth_users=$(psql "$DATABASE_URL" -XAtc 'select count(*) from auth.users')"
} > "$WORK/MANIFEST.txt"

tar -C "$WORK" -cf "$WORK/bundle.tar" public.dump auth.dump MANIFEST.txt
OUT="$OUT_DIR/menewoa-$stamp.tar.age"
age -r "$AGE_RECIPIENT" -o "$OUT" "$WORK/bundle.tar"

size=$(stat -c %s "$OUT")
(( size >= MIN_BYTES )) || { echo "encrypted backup suspiciously small ($size bytes)" >&2; rm -f "$OUT"; exit 1; }
echo "wrote $OUT ($size bytes)"
