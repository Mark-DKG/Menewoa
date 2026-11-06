-- Helpers that need the migrated schema (run AFTER the migrations).
-- Makes a user an administrator. Only the DB owner can do this; there is no API for it.
create function test.make_admin(p_uid uuid, p_role public.admin_role) returns void language plpgsql security definer as $$
begin
  insert into public.admin_users (user_id, admin_role) values (p_uid, p_role);
end $$;
grant execute on all functions in schema test to public;

-- Rows touched by a DML statement (under the CURRENT role / RLS).
create function test.affected(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;

-- Named users: test.mk('alice') stores the id in a transaction-local setting so
-- it is readable under any role; test.u('alice') reads it back.
create function test.mk(p_name text, p_role text default null) returns uuid language plpgsql security definer as $$
declare v_id uuid;
begin
  v_id := test.make_user(p_name || '@example.test', p_role, initcap(p_name));
  perform set_config('t.' || p_name, v_id::text, true);
  return v_id;
end $$;
create function test.u(p_name text) returns uuid language sql stable as $$
  select current_setting('t.' || p_name)::uuid
$$;
grant execute on all functions in schema test to public;

-- Test-only: the redeem limit is per user per 15 minutes; long scenarios reset it.
create function test.reset_rl() returns void language sql security definer as $$
  delete from public.rate_limit_events;
$$;
grant execute on all functions in schema test to public;
