-- Administrator powers are narrow, aggregate-first, audited and visible to the user.
set local timezone = 'UTC';
select test.mk('alice'); select test.mk('bob'); select test.mk('carol');
select test.mk('owner1'); select test.mk('support1'); select test.mk('content1');
select test.make_admin(test.u('owner1'), 'owner'); select test.make_admin(test.u('support1'), 'support'); select test.make_admin(test.u('content1'), 'content');

select test.as_user(test.u('alice'));
insert into public.period_entries (user_id, start_date, end_date, flow) values (test.u('alice'), current_date - 10, current_date - 6, 'heavy');
insert into public.mood_entries (user_id, log_date, mood) values (test.u('alice'), current_date - 1, 'sad');
insert into public.daily_logs (user_id, log_date, sleep_hours, energy_level, note) values (test.u('alice'), current_date - 1, 4.5, 1, 'ALICE-PRIVATE-NOTE');
select public.set_day_symptoms(current_date - 1, array[1, 3]::smallint[]);

-- ---- an ordinary account can call none of it -------------------------------
select test.expect_error('select public.admin_overview()', '42501', 'user: admin_overview denied');
select test.expect_error('select public.admin_analytics()', '42501', 'user: admin_analytics denied');
select test.expect_error('select public.admin_list_users()', '42501', 'user: admin_list_users denied');
select test.expect_error(format('select public.admin_set_user_status(%L, ''suspended'', ''because I feel like it'')', test.u('bob')), '42501', 'user: admin_set_user_status denied');
select test.expect_error(format('select public.admin_authorize_delete(%L, ''because I feel like it'')', test.u('bob')), '42501', 'user: admin_authorize_delete denied');
select test.expect_error('select public.admin_list_reports()', '42501', 'user: admin_list_reports denied');
select test.expect_error('select public.admin_update_report(gen_random_uuid(), ''resolved'', null)', '42501', 'user: admin_update_report denied');
select test.expect_error(format('select public.admin_read_user_logs(%L, ''technical_support'', ''I am curious about bob'')', test.u('bob')), '42501', 'user: admin_read_user_logs denied');
select test.expect_error('select public.admin_list_audit_logs()', '42501', 'user: admin_list_audit_logs denied');

-- ---- overview: aggregates only ----------------------------------------------
select test.as_user(test.u('content1'));
select test.ok(public.admin_overview() ? 'total_users' and public.admin_overview() ? 'active_connections', 'overview returns aggregate counts');
select test.eq(jsonb_typeof(public.admin_overview() -> 'active_loggers_7d'), 'null', 'a group of fewer than 5 active users is suppressed');
select test.ok(position('ALICE' in public.admin_overview()::text) = 0 and position('alice' in public.admin_overview()::text) = 0, 'overview names no individuals');

-- ---- user directory ------------------------------------------------------------
select test.as_super();
insert into auth.users (email) select 'bulk' || i || '@example.test' from generate_series(1, 60) i;
select test.as_user(test.u('support1'));
select test.eq((public.admin_list_users('alice') ->> 'total')::int, 1, 'search by name finds one user');
select test.eq(public.admin_list_users('alice') -> 'users' -> 0 ->> 'email', 'alice@example.test', 'support can see the email (needed for support requests)');
select test.eq((public.admin_list_users('%') ->> 'total')::int, 0, 'LIKE wildcards are escaped (search "%" matches nothing)');
select test.eq((public.admin_list_users('_') ->> 'total')::int, 0, 'LIKE wildcards are escaped (search "_" matches nothing)');
select test.eq(jsonb_array_length(public.admin_list_users('bulk', 1000, 0) -> 'users'), 50, 'page size is capped at 50');
select test.eq(jsonb_array_length(public.admin_list_users('bulk', 10, 55) -> 'users'), 5, 'offset paging works');
select test.ok(position('heavy' in public.admin_list_users('alice')::text) = 0 and position('PRIVATE' in public.admin_list_users('alice')::text) = 0, 'the directory carries no health data');

-- ---- account status ---------------------------------------------------------------
select test.expect_error(format('select public.admin_set_user_status(%L, ''suspended'', ''no'')', test.u('bob')), '22023', 'status change needs a real reason');
select test.expect_error(format('select public.admin_set_user_status(%L, ''suspended'', %L)', test.u('support1'), 'testing self'), '42501', 'admin cannot change own status');
select test.expect_error(format('select public.admin_set_user_status(%L, ''suspended'', %L)', test.u('owner1'), 'attempt on owner'), '42501', 'support cannot suspend an administrator');
select test.expect_error(format('select public.admin_set_user_status(%L, ''suspended'', %L)', gen_random_uuid(), 'ghost user'), 'P0002', 'unknown user -> not_found');
select public.admin_set_user_status(test.u('bob'), 'suspended', 'Repeated harassment reports (ticket 4411)');
select test.as_user(test.u('bob'));
select test.expect_rows('select 1 from public.cycle_settings', 0, 'suspended bob loses data access');
select test.as_super();
select test.eq((select status::text from public.profiles where id = test.u('bob')), 'suspended', 'status updated');
select test.ok(exists (select 1 from public.audit_logs where action = 'admin_set_user_status' and target_user_id = test.u('bob') and actor_id = test.u('support1')
                       and reason_category = 'moderation' and reason like '%ticket 4411%'), 'status change audited with actor, target and reason');
select test.as_user(test.u('support1'));
select public.admin_set_user_status(test.u('bob'), 'active', 'Appeal upheld');
select test.as_user(test.u('bob'));
select test.expect_rows('select 1 from public.cycle_settings', 1, 'reinstated bob has access again');

-- ---- the break-glass reader ----------------------------------------------------------
select test.as_user(test.u('support1'));
select test.expect_error(format('select public.admin_read_user_logs(%L, ''technical_support'', ''short'')', test.u('alice')), '22023', 'reading logs needs a written reason', 'reason_required');
select test.expect_error(format('select public.admin_read_user_logs(%L, null, %L)', test.u('alice'), 'a long enough reason'), '22023', 'reading logs needs a reason category', 'invalid_reason_category');
select test.expect_error(format('select public.admin_read_user_logs(%L, ''curiosity'', %L)', test.u('alice'), 'a long enough reason'), '22023', 'unlisted reason category rejected', 'invalid_reason_category');
select test.expect_error(format('select public.admin_read_user_logs(%L, ''technical_support'', %L)', test.u('support1'), 'reading my own logs'), '42501', 'cannot target self');
select test.expect_error(format('select public.admin_read_user_logs(%L, ''technical_support'', %L)', gen_random_uuid(), 'unknown user here'), 'P0002', 'unknown target -> not_found');
select test.as_super();
select test.eq((select count(*) from public.audit_logs where action = 'admin_read_user_logs'), 0::bigint, 'rejected attempts leave no data access and no audit noise');

select test.as_user(test.u('support1'));
select set_config('t.r1', public.admin_read_user_logs(test.u('alice'), 'user_request', 'User asked for help fixing her cycle history (ticket 4412)')::text, true);
select test.eq(current_setting('t.r1')::jsonb -> 'profile' ->> 'display_name', 'Alice', 'break-glass returns the profile');
select test.eq(jsonb_array_length(current_setting('t.r1')::jsonb -> 'period_entries'), 1, 'break-glass returns period entries');
select test.eq(current_setting('t.r1')::jsonb -> 'mood_entries' -> 0 ->> 'mood', 'sad', 'break-glass returns moods');
select test.eq(jsonb_array_length(current_setting('t.r1')::jsonb -> 'symptoms'), 2, 'break-glass returns symptoms');
select test.eq(current_setting('t.r1')::jsonb -> 'daily_logs' -> 0 ->> 'sleep_hours', '4.5', 'break-glass returns sleep');
select test.eq(position('ALICE-PRIVATE-NOTE' in current_setting('t.r1')), 0, 'private note text is withheld by default');
select test.eq(public.admin_read_user_logs(test.u('alice'), 'safety_investigation', 'Escalated safety case needs the note', true) -> 'daily_logs' -> 0 ->> 'note', 'ALICE-PRIVATE-NOTE', 'notes are returned only when explicitly requested');
select test.as_super();
select test.eq((select count(*) from public.audit_logs where action = 'admin_read_user_logs' and target_user_id = test.u('alice') and actor_id = test.u('support1')), 2::bigint, 'both reads were audited with actor and target');
select test.ok(exists (select 1 from public.audit_logs where action = 'admin_read_user_logs' and reason like '%ticket 4412%' and reason_category = 'user_request'), 'audit row stores category + reason');
select test.ok(exists (select 1 from public.audit_logs where action = 'admin_read_user_logs' and (metadata ->> 'include_notes')::boolean), 'audit row records that notes were requested');
select test.eq((select count(*) from public.audit_logs where metadata::text like '%ALICE-PRIVATE-NOTE%' or reason like '%ALICE-PRIVATE-NOTE%'), 0::bigint, 'the audit log itself never contains health data');

-- the affected user can see that it happened
select test.as_user(test.u('alice'));
select test.eq(jsonb_array_length(public.get_my_access_history()), 2, 'alice sees both administrator accesses');
select test.eq(public.get_my_access_history() -> 0 ->> 'action', 'admin_read_user_logs', 'access history names the action');
select test.ok(position('ticket' in public.get_my_access_history()::text) = 0 and position(test.u('support1')::text in public.get_my_access_history()::text) = 0, 'history shows neither the free-text reason nor the admin identity');
select test.as_user(test.u('carol'));
select test.eq(jsonb_array_length(public.get_my_access_history()), 0, 'carol sees only her own history (none)');
select test.as_user(test.u('bob'));
select test.eq(jsonb_array_length(public.get_my_access_history()), 2, 'bob''s history lists the two status changes');

-- rate limit: 20 reads per hour (2 already used)
select test.as_user(test.u('support1'));
select public.admin_read_user_logs(test.u('alice'), 'technical_support', 'bulk rate-limit exercise') from generate_series(1, 18);
select test.expect_error(format('select public.admin_read_user_logs(%L, ''technical_support'', %L)', test.u('alice'), 'one more than allowed'), '54000', 'the 21st read in an hour is rate limited', 'rate_limited');
select test.as_super();
select test.eq((select count(*) from public.audit_logs where action = 'admin_read_user_logs'), 20::bigint, 'every successful read has exactly one audit row');

-- ---- audit log integrity ---------------------------------------------------------------
select test.expect_error('update public.audit_logs set action = ''edited''', '42501', 'audit rows cannot be edited (even by the DB owner)', 'append-only');
select test.expect_error('delete from public.audit_logs', '42501', 'audit rows cannot be deleted', 'append-only');
select test.expect_error('truncate public.audit_logs', '42501', 'audit log cannot be truncated', 'append-only');
select test.as_user(test.u('owner1'));
select test.expect_error('select * from public.audit_logs', '42501', 'even the owner admin has no table access to audit_logs');
select test.ok(jsonb_array_length(public.admin_list_audit_logs(5)) = 5, 'owner can page the audit log through the function');
select test.ok(public.admin_list_audit_logs(1000) is not null and jsonb_array_length(public.admin_list_audit_logs(1000)) <= 200, 'audit page size is capped');
select test.as_user(test.u('support1'));
select test.expect_error('select public.admin_list_audit_logs()', '42501', 'support cannot read the audit log');

-- ---- analytics: small groups suppressed ---------------------------------------------------
select test.as_super();
select test.eq(public.k_suppress(0), 0::bigint, 'k_suppress keeps zero');
select test.eq(public.k_suppress(3), null::bigint, 'k_suppress hides 1..4');
select test.eq(public.k_suppress(4), null::bigint, 'k_suppress hides 4');
select test.eq(public.k_suppress(5), 5::bigint, 'k_suppress shows 5+');
select test.as_user(test.u('support1'));
select test.eq(jsonb_array_length(public.admin_analytics() -> 'top_symptoms_90d'), 0, 'one user''s symptoms never appear in analytics');
select test.eq(jsonb_array_length(public.admin_analytics() -> 'mood_distribution_90d'), 0, 'one user''s moods never appear in analytics');
select test.eq(jsonb_typeof(public.admin_analytics() -> 'cycle_stats'), 'null', 'cycle stats need >= 5 users');
select test.ok(not exists (select 1 from jsonb_array_elements(public.admin_analytics() -> 'daily_logging_users_30d') e where e ->> 'users' is not null), 'daily logging counts below 5 are hidden');
select test.as_super();
-- five more people log Cramps, a happy mood, and three periods each
do $$
declare i int; v uuid;
begin
  for i in 1..5 loop
    v := test.make_user('crowd' || i || '@example.test');
    insert into public.symptom_logs (user_id, log_date, symptom_id) values (v, current_date - 1, 1);
    insert into public.mood_entries (user_id, log_date, mood) values (v, current_date - 1, 'happy');
    insert into public.period_entries (user_id, start_date) values (v, current_date - 90), (v, current_date - 60), (v, current_date - 30);
  end loop;
end $$;
select test.as_user(test.u('support1'));
select test.eq((public.admin_analytics() -> 'top_symptoms_90d' -> 0 ->> 'name') || ':' || (public.admin_analytics() -> 'top_symptoms_90d' -> 0 ->> 'users'), 'Cramps:6', 'symptom appears once >= 5 distinct users logged it');
select test.eq(jsonb_array_length(public.admin_analytics() -> 'top_symptoms_90d'), 1, 'symptoms logged by < 5 users (Bloating) stay hidden');
select test.eq(public.admin_analytics() -> 'mood_distribution_90d' -> 0 ->> 'mood', 'happy', 'mood appears once >= 5 users');
select test.eq(jsonb_array_length(public.admin_analytics() -> 'mood_distribution_90d'), 1, 'the single user''s "sad" stays hidden');
select test.eq(public.admin_analytics() -> 'cycle_stats' ->> 'avg_cycle_length', '30.0', 'cycle stats appear with >= 5 users');
select test.ok(position('crowd' in public.admin_analytics()::text) = 0, 'analytics contains no identities');

-- ---- deletion authorisation (step 1 of admin delete) ----------------------------------------
select test.expect_error(format('select public.admin_authorize_delete(%L, %L)', test.u('carol'), 'spam account removal'), '42501', 'support cannot authorise deletion (owner only)');
select test.as_user(test.u('owner1'));
select test.expect_error(format('select public.admin_authorize_delete(%L, %L)', test.u('carol'), 'no'), '22023', 'deletion needs a real reason');
select test.expect_error(format('select public.admin_authorize_delete(%L, %L)', test.u('owner1'), 'deleting myself'), '42501', 'owner cannot delete self here');
select test.expect_error(format('select public.admin_authorize_delete(%L, %L)', test.u('support1'), 'deleting staff'), '42501', 'cannot delete another administrator through this path');
select test.expect_error(format('select public.admin_authorize_delete(%L, %L)', gen_random_uuid(), 'ghost account'), 'P0002', 'unknown user -> not_found');
select public.admin_authorize_delete(test.u('carol'), 'Confirmed spam account (ticket 4420)');
select test.as_super();
select test.ok(exists (select 1 from public.audit_logs where action = 'admin_delete_user' and target_user_id = test.u('carol') and actor_id = test.u('owner1') and reason like '%ticket 4420%'), 'deletion authorisation audited');
