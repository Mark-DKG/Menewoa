-- Structural security checks: RLS everywhere, default-deny grants, function allowlist.
select test.eq((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
               0::bigint, 'every table in public has row level security enabled');

select test.eq((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'public' and c.relkind in ('r', 'p')
                  and (has_any_column_privilege('anon', c.oid, 'select,insert,update,references')
                       or has_table_privilege('anon', c.oid, 'delete,truncate,trigger'))),
               0::bigint, 'anon has no privileges on any table');

select test.eq((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'public' and c.relkind = 'S'
                  and case when c.relkind = 'S' then has_sequence_privilege('anon', c.oid, 'usage,select,update') else false end),
               0::bigint, 'anon has no sequence privileges');

select test.eq((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'public' and c.relkind in ('r', 'p')
                  and has_table_privilege('authenticated', c.oid, 'truncate,trigger')),
               0::bigint, 'authenticated cannot truncate or create triggers on anything');

-- Tables clients must never touch directly.
select test.eq((select count(*) from unnest(array['admin_users', 'audit_logs', 'rate_limit_events', 'push_subscriptions']) t
                where has_any_column_privilege('authenticated', ('public.' || t)::regclass, 'select,insert,update,references')),
               0::bigint, 'authenticated has no access to admin_users / audit_logs / rate_limit_events / push_subscriptions');

-- Column-level protections.
select test.ok(not has_column_privilege('authenticated', 'public.profiles', 'role', 'update'),   'clients cannot UPDATE profiles.role');
select test.ok(not has_column_privilege('authenticated', 'public.profiles', 'status', 'update'), 'clients cannot UPDATE profiles.status');
select test.ok(not has_table_privilege('authenticated', 'public.profiles', 'insert'),            'clients cannot INSERT profiles');
select test.ok(not has_table_privilege('authenticated', 'public.profiles', 'delete'),            'clients cannot DELETE profiles');
select test.ok(not has_column_privilege('authenticated', 'public.partner_invitations', 'code_hash', 'select'), 'clients cannot read invitation code hashes');
select test.ok(not has_table_privilege('authenticated', 'public.partner_invitations', 'insert'), 'clients cannot INSERT invitations directly');
select test.ok(not has_table_privilege('authenticated', 'public.partner_connections', 'insert'), 'clients cannot INSERT connections directly');
select test.ok(not has_table_privilege('authenticated', 'public.partner_connections', 'update'), 'clients cannot UPDATE connections directly');
select test.ok(not has_column_privilege('authenticated', 'public.reports', 'resolved_by', 'select'), 'reporters cannot read resolved_by');
select test.ok(not has_column_privilege('authenticated', 'public.reports', 'status', 'insert'),      'reporters cannot set report status');
select test.ok(not has_column_privilege('authenticated', 'public.sharing_permissions', 'connection_id', 'update'), 'permissions cannot be re-pointed to another connection');
select test.ok(not has_column_privilege('authenticated', 'public.period_entries', 'user_id', 'update'), 'period_entries.user_id cannot be re-assigned');

-- Function allowlist: this list is the ONLY set of functions clients may execute.
create temp table expected_fns (name text primary key) on commit drop;
insert into expected_fns values
  ('active_uid'), ('is_admin'), ('set_day_symptoms'), ('upsert_mood'), ('upsert_daily_log'), ('register_push_subscription'),
  ('unregister_push_subscription'), ('create_partner_invitation'), ('revoke_partner_invitation'),
  ('preview_partner_invitation'), ('redeem_partner_invitation'), ('revoke_partner_connection'),
  ('block_connection_counterpart'), ('get_my_connection'), ('get_partner_view'),
  ('get_my_admin_status'), ('get_my_access_history'), ('export_my_data'),
  ('admin_overview'), ('admin_analytics'), ('admin_list_users'), ('admin_set_user_status'),
  ('admin_authorize_delete'), ('admin_list_reports'), ('admin_update_report'),
  ('admin_read_user_logs'), ('admin_list_audit_logs'), ('record_consent');

create temp table fn_exec on commit drop as
select p.proname as name,
       has_function_privilege('authenticated', p.oid, 'execute') as authed,
       has_function_privilege('anon', p.oid, 'execute') as anon
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public';

select test.eq((select string_agg(name, ', ' order by name) from fn_exec where anon), null::text,
               'anon can execute no function in public');
select test.eq((select string_agg(name, ', ' order by name) from fn_exec where authed and name not in (select name from expected_fns)), null::text,
               'authenticated can execute ONLY allowlisted functions (unexpected: see value)');
select test.eq((select string_agg(name, ', ' order by name) from expected_fns where name not in (select name from fn_exec where authed)), null::text,
               'every allowlisted function is actually executable (missing: see value)');

-- Every SECURITY DEFINER function must pin search_path (search-path hijack defence).
select test.eq((select string_agg(p.proname, ', ' order by p.proname)
                from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.prosecdef
                  and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
               null::text, 'every SECURITY DEFINER function pins search_path');

-- Behavioural: anon is shut out entirely.
select test.as_anon();
select test.expect_error('select * from public.profiles',        '42501', 'anon cannot read profiles');
select test.expect_error('select * from public.articles',        '42501', 'anon cannot read articles');
select test.expect_error('select public.get_partner_view()',     '42501', 'anon cannot call get_partner_view');
select test.expect_error('select public.admin_overview()',       '42501', 'anon cannot call admin_overview');
select test.expect_error('select public.is_admin()',             '42501', 'anon cannot call is_admin');
select test.as_super();
