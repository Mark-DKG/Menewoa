#!/usr/bin/env bash
# Applies every migration to a THROWAWAY Postgres, then runs supabase/tests/*.sql.
#
#   scripts/test-db.sh                       # starts a temporary local cluster (needs Postgres binaries)
#   TEST_DATABASE_URL=postgres://... scripts/test-db.sh
#                                            # uses an EMPTY, disposable database you provide
#
# Each test file runs inside a transaction that is rolled back. Assertions print
# "PASS: ..." / "FAIL: ...". Exit code is non-zero if anything fails.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD
CLEANUP=""

if [[ -n "${TEST_DATABASE_URL:-}" ]]; then
  PSQL=(psql "$TEST_DATABASE_URL" -X -q -v ON_ERROR_STOP=1)
else
  PGBIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)
  [[ -x "${PGBIN:-}/initdb" ]] || { echo "No Postgres binaries found; set TEST_DATABASE_URL instead." >&2; exit 2; }
  DIR=$(mktemp -d)
  chmod 755 "$DIR"
  RUN=""; [[ $(id -u) -eq 0 ]] && RUN="su postgres -c"
  run() { if [[ -n "$RUN" ]]; then su postgres -c "$*"; else bash -c "$*"; fi; }
  [[ -n "$RUN" ]] && chown postgres "$DIR"
  run "$PGBIN/initdb -D $DIR/data -A trust -U postgres -E UTF8 >/dev/null"
  run "$PGBIN/pg_ctl -D $DIR/data -o '-p 54329 -k $DIR -c listen_addresses=' -w -l $DIR/log start >/dev/null"
  trap 'run "$PGBIN/pg_ctl -D $DIR/data -m immediate stop" >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
  PSQL=(psql -h "$DIR" -p 54329 -U postgres -d postgres -X -q -v ON_ERROR_STOP=1)
fi

echo "== shim"
"${PSQL[@]}" -f supabase/tests/00_shim.sql
echo "== migrations"
for f in supabase/migrations/*.sql; do echo "   $(basename "$f")"; "${PSQL[@]}" -f "$f"; done
"${PSQL[@]}" -f supabase/tests/05_helpers_post.sql
echo "== seed (applied twice: it must be idempotent)"
"${PSQL[@]}" -f supabase/seed.sql
"${PSQL[@]}" -f supabase/seed.sql

pass=0; fail=0; broken=0
for f in supabase/tests/[1-9]*.sql; do
  out=$( { echo "begin;"; cat "$f"; echo "rollback;"; } | "${PSQL[@]}" 2>&1 ) && rc=0 || rc=$?
  p=$(grep -c 'PASS:' <<<"$out" || true); x=$(grep -c 'FAIL:' <<<"$out" || true)
  pass=$((pass+p)); fail=$((fail+x))
  if [[ $rc -ne 0 ]]; then broken=$((broken+1)); echo "-- $(basename "$f"): ERROR (script aborted)"; grep -v 'PASS:' <<<"$out" | tail -8
  else echo "-- $(basename "$f"): $p passed, $x failed"; fi
  grep 'FAIL:' <<<"$out" | sed 's/^/     /' || true
done
echo "== $pass passed, $fail failed, $broken files aborted"
[[ $fail -eq 0 && $broken -eq 0 ]]
