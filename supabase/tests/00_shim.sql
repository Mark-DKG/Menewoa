-- ============================================================================
-- TEST HARNESS ONLY — never applied to a real project.
-- Emulates the parts of Supabase the migrations depend on (roles, auth schema,
-- auth.uid()/auth.jwt(), default privileges) plus a tiny assertion library.
-- Real Supabase already provides all of the first group.
-- ============================================================================
create role anon          nologin;
create role authenticated nologin;
create role service_role  nologin bypassrls;

create schema auth;
create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.jwt(), auth.uid() to anon, authenticated, service_role;

-- Supabase grants new public objects to the API roles by default. Reproduce
-- that so the tests prove migration 6 really strips it back.
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- ---------------------------------------------------------------- helpers ---
create schema test;
grant usage on schema test to public;

-- Results are emitted as NOTICEs ("PASS: ..." / "FAIL: ...") because each test
-- file runs in a transaction that is rolled back.
create function test.ok(p_cond boolean, p_label text) returns void language plpgsql as $$
begin
  if coalesce(p_cond, false) then raise notice 'PASS: %', p_label;
  else raise notice 'FAIL: %', p_label; end if;
end $$;

create function test.eq(p_actual anyelement, p_expected anyelement, p_label text) returns void language plpgsql as $$
begin
  if p_actual is not distinct from p_expected then raise notice 'PASS: %', p_label;
  else raise notice 'FAIL: % (expected %, got %)', p_label, p_expected, p_actual; end if;
end $$;

-- Passes only if the statement raises SQLSTATE p_state (and, if given, the
-- message contains p_msg).
create function test.expect_error(p_sql text, p_state text, p_label text, p_msg text default null) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = p_state and (p_msg is null or position(p_msg in sqlerrm) > 0) then
      raise notice 'PASS: %', p_label;
    else
      raise notice 'FAIL: % (wanted % %, got % %)', p_label, p_state, coalesce(p_msg, ''), sqlstate, sqlerrm;
    end if;
    return;
  end;
  raise notice 'FAIL: % (no error raised, wanted %)', p_label, p_state;
end $$;

create function test.expect_ok(p_sql text, p_label text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise notice 'PASS: %', p_label;
exception when others then
  raise notice 'FAIL: % (%: %)', p_label, sqlstate, sqlerrm;
end $$;

-- Number of rows the statement returns (under the CURRENT role / RLS).
create function test.rows(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('select count(*) from (%s) q', p_sql) into n;
  return n;
end $$;

create function test.expect_rows(p_sql text, p_n bigint, p_label text) returns void language plpgsql as $$
declare n bigint;
begin
  begin
    n := test.rows(p_sql);
  exception when others then
    raise notice 'FAIL: % (%: %)', p_label, sqlstate, sqlerrm;
    return;
  end;
  if n = p_n then raise notice 'PASS: %', p_label;
  else raise notice 'FAIL: % (expected % rows, got %)', p_label, p_n, n; end if;
end $$;

-- Creates an auth user. The profile row is made by the real handle_new_user trigger.
create function test.make_user(p_email text, p_role text default null, p_name text default null) returns uuid
language plpgsql security definer as $$
declare v_id uuid;
begin
  insert into auth.users (email, raw_user_meta_data)
  values (p_email, jsonb_strip_nulls(jsonb_build_object('role', p_role, 'display_name', p_name)))
  returning id into v_id;
  return v_id;
end $$;

-- Role switching. NOTE: the session user stays the superuser, so these can be
-- called while impersonating someone else.
create function test.as_user(p_uid uuid, p_extra jsonb default '{}'::jsonb) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', (jsonb_build_object('sub', p_uid, 'role', 'authenticated') || p_extra)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function test.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end $$;
create function test.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('role', 'service_role', true);
end $$;
create function test.as_super() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute format('set local role %I', session_user);
end $$;

grant execute on all functions in schema test to public;
