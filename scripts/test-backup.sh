#!/usr/bin/env bash
# End-to-end drill on throwaway local clusters: build a database from the migrations,
# add data, back it up with scripts/backup.sh, restore into a second fresh database with
# scripts/restore.sh, and compare. Needs Postgres binaries, age, and root or a postgres user.
set -euo pipefail
cd "$(dirname "$0")/.."
PGBIN=$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)
DIR=$(mktemp -d); chmod 755 "$DIR"
RUN=""; [[ $(id -u) -eq 0 ]] && RUN="su postgres -c"
run() { if [[ -n "$RUN" ]]; then su postgres -c "$*"; else bash -c "$*"; fi; }
[[ -n "$RUN" ]] && chown postgres "$DIR"
run "$PGBIN/initdb -D $DIR/data -A trust -U postgres -E UTF8 >/dev/null"
run "$PGBIN/pg_ctl -D $DIR/data -o '-p 54330 -k $DIR -c listen_addresses=' -w -l $DIR/log start >/dev/null"
trap 'run "$PGBIN/pg_ctl -D $DIR/data -m immediate stop" >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
URL() { echo "postgres://postgres@%2F${DIR//\//%2F}:54330/$1"; }
psqlx() { psql -h "$DIR" -p 54330 -U postgres -X -q -v ON_ERROR_STOP=1 "$@"; }
build() {  # $1 = db name
  psqlx -d postgres -c "create database $1"
  # roles are cluster-global: only the first database may create them
  sed '/^create role/d' supabase/tests/00_shim.sql > "$DIR/shim_$1.sql"
  [[ -f "$DIR/roles_done" ]] || { grep '^create role' supabase/tests/00_shim.sql | psqlx -d postgres; touch "$DIR/roles_done"; }
  psqlx -d "$1" -f "$DIR/shim_$1.sql"
  psqlx -d "$1" -c "create table if not exists auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, provider text not null default 'email')"
  for f in supabase/migrations/*.sql; do psqlx -d "$1" -f "$f"; done
  psqlx -d "$1" -f supabase/tests/05_helpers_post.sql
}

echo "== build source + target"; build src; build dst
psqlx -d src -f supabase/seed.sql
psqlx -d src <<'SQL'
select test.make_user('a@example.com', 'woman', 'Ama');
select test.make_user('b@example.com', 'partner', 'Kofi');
insert into auth.identities (user_id) select id from auth.users;
insert into public.period_entries (user_id, start_date, end_date, flow)
select id, current_date - 60, current_date - 55, 'medium' from public.profiles where role = 'woman';
insert into public.period_entries (user_id, start_date, end_date, flow)
select id, current_date - 32, current_date - 27, 'light' from public.profiles where role = 'woman';
select public.write_audit('test_event');
SQL
count() { psqlx -d "$1" -AtF= -c "select 'profiles',count(*) from public.profiles union all select 'periods',count(*) from public.period_entries union all select 'audit',count(*) from public.audit_logs union all select 'users',count(*) from auth.users union all select 'identities',count(*) from auth.identities union all select 'settings',count(*) from public.app_settings union all select 'predictions',count(*) from public.cycle_predictions order by 1"; }

echo "== backup"
KEY="$DIR/key.txt"; age-keygen -o "$KEY" 2>/dev/null
REC=$(age-keygen -y "$KEY")
mkdir -p "$DIR/out"
DATABASE_URL=$(URL src) AGE_RECIPIENT=$REC MIN_BACKUP_BYTES=500 scripts/backup.sh "$DIR/out"
F=$(ls "$DIR"/out/*.tar.age)
# ciphertext must not contain recognisable plaintext
if grep -a -q -e 'Ama' -e 'a@example.com' -e 'PGDMP' "$F"; then echo "FAIL: plaintext leaked into backup"; exit 1; fi
echo "PASS: ciphertext contains no plaintext markers"

echo "== restore into fresh target"
TARGET_DATABASE_URL=$(URL dst) scripts/restore.sh "$F" "$KEY" >/dev/null
diff <(count src) <(count dst) && echo "PASS: row counts identical after restore"

echo "== restore refuses a populated target"
if TARGET_DATABASE_URL=$(URL dst) scripts/restore.sh "$F" "$KEY" >/dev/null 2>&1; then echo "FAIL: restored into populated DB"; exit 1; else echo "PASS: refused populated target"; fi

echo "== wrong key cannot decrypt"
age-keygen -o "$DIR/other.txt" 2>/dev/null
if age -d -i "$DIR/other.txt" "$F" >/dev/null 2>&1; then echo "FAIL: decrypted with wrong key"; exit 1; else echo "PASS: wrong key rejected"; fi

echo "== restored DB still enforces its rules"
out=$(psqlx -d dst -c "update public.audit_logs set action='x'" 2>&1 || true); echo "$out" | tail -3; grep -q "append-only" <<<"$out" && echo "PASS: audit_logs immutability triggers intact" || { echo "FAIL: audit_logs mutable after restore"; exit 1; }
psqlx -d dst -At -c "select count(*) from pg_trigger where tgname='on_auth_user_created' and tgenabled='O'" | grep -qx 1 && echo "PASS: triggers enabled (origin) after restore" || { echo "FAIL: trigger state"; exit 1; }
