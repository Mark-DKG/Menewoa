-- Data export, account deletion, retention and push subscriptions.
set local timezone = 'UTC';
select test.mk('alice'); select test.mk('bob'); select test.mk('paul', 'partner'); select test.mk('support1'); select test.make_admin(test.u('support1'), 'support');

select test.as_user(test.u('alice'));
insert into public.period_entries (user_id, start_date, end_date) values (test.u('alice'), current_date - 12, current_date - 8);
insert into public.mood_entries (user_id, log_date, mood) values (test.u('alice'), current_date - 1, 'calm');
insert into public.daily_logs (user_id, log_date, sleep_hours, note) values (test.u('alice'), current_date - 1, 8, 'export me');
select public.set_day_symptoms(current_date - 1, array[2]::smallint[]);
insert into public.support_tips (user_id, tip) values (test.u('alice'), 'Chocolate');
select test.as_user(test.u('bob'));
insert into public.period_entries (user_id, start_date) values (test.u('bob'), current_date - 5);
insert into public.daily_logs (user_id, log_date, note) values (test.u('bob'), current_date - 1, 'BOB-ONLY');

-- ============================ export ==========================================
select test.as_user(test.u('alice'));
select set_config('t.export', public.export_my_data()::text, true);
select test.eq(jsonb_array_length(current_setting('t.export')::jsonb -> 'period_entries'), 1, 'export: her period entries');
select test.eq(current_setting('t.export')::jsonb -> 'daily_logs' -> 0 ->> 'note', 'export me', 'export: her notes');
select test.eq(current_setting('t.export')::jsonb -> 'symptoms' -> 0 ->> 'symptom', 'Headache', 'export: symptoms by name');
select test.eq(current_setting('t.export')::jsonb -> 'support_tips' ->> 0, 'Chocolate', 'export: her support tips');
select test.ok(current_setting('t.export')::jsonb ? 'cycle_settings' and current_setting('t.export')::jsonb ? 'notification_preferences' and current_setting('t.export')::jsonb ? 'administrator_access_history', 'export: settings, preferences and admin access history included');
select test.eq(position('BOB-ONLY' in current_setting('t.export')), 0, 'export never contains another user''s data');
select test.eq(position('@example.test' in current_setting('t.export')), 0, 'export does not leak other accounts'' emails');
select public.export_my_data(); select public.export_my_data();
select test.expect_error('select public.export_my_data()', '54000', 'a 4th export in a day is rate limited', 'rate_limited');
select test.as_super();
select test.ok(exists (select 1 from public.audit_logs where action = 'data_export' and target_user_id = test.u('alice')), 'exports are logged (fact only)');
-- a suspended user keeps the right to take their data
update public.profiles set status = 'suspended' where id = test.u('bob');
select test.as_user(test.u('bob'));
select test.ok(public.export_my_data() ? 'profile', 'suspended users can still export');
select test.as_super();
update public.profiles set status = 'active' where id = test.u('bob');

-- ============================ push subscriptions ==============================
select test.as_user(test.u('alice'));
select test.expect_ok('select public.register_push_subscription(''https://push.example.test/a1'', repeat(''p'', 30), repeat(''a'', 20))', 'valid subscription registers');
select test.expect_error('select public.register_push_subscription(''http://push.example.test/insecure'', repeat(''p'', 30), repeat(''a'', 20))', '23514', 'non-https endpoint rejected');
select test.expect_error('select public.register_push_subscription(''https://push.example.test/short'', ''x'', ''y'')', '23514', 'implausibly short keys rejected');
select test.expect_error('select * from public.push_subscriptions', '42501', 'clients cannot read subscriptions (or their keys)');
select test.as_user(test.u('bob'));
select public.register_push_subscription('https://push.example.test/a1', repeat('q', 30), repeat('b', 20));
select test.as_super();
select test.eq((select user_id from public.push_subscriptions where endpoint = 'https://push.example.test/a1'), test.u('bob'), 'a shared device''s endpoint moves to the newest user');
select test.eq((select count(*) from public.push_subscriptions where user_id = test.u('alice')), 0::bigint, 'the previous user no longer receives pushes for that device');
select test.as_user(test.u('alice'));
select public.register_push_subscription('https://push.example.test/n' || i, repeat('p', 30), repeat('a', 20)) from generate_series(1, 7) i;
select test.as_super();
select test.eq((select count(*) from public.push_subscriptions where user_id = test.u('alice')), 5::bigint, 'at most 5 devices per user');
select test.as_user(test.u('alice'));
select public.unregister_push_subscription('https://push.example.test/a1');
select test.as_super();
select test.eq((select count(*) from public.push_subscriptions where endpoint = 'https://push.example.test/a1'), 1::bigint, 'unregister cannot remove someone else''s device');

-- ============================ account deletion ================================
select test.mk('del'); select test.mk('delpartner', 'partner'); select test.mk('reporter');
select test.as_user(test.u('del'));
insert into public.period_entries (user_id, start_date) values (test.u('del'), current_date - 30), (test.u('del'), current_date - 2);
insert into public.mood_entries (user_id, log_date, mood) values (test.u('del'), current_date - 1, 'sad');
insert into public.daily_logs (user_id, log_date, note) values (test.u('del'), current_date - 1, 'DELETE-ME');
select public.set_day_symptoms(current_date - 1, array[1]::smallint[]);
insert into public.support_tips (user_id, tip) values (test.u('del'), 'tip');
select public.register_push_subscription('https://push.example.test/del', repeat('p', 30), repeat('a', 20));
select set_config('t.code', public.create_partner_invitation(true, '{"mood":true}'::jsonb) ->> 'code', true);
select test.as_user(test.u('delpartner'));
select public.redeem_partner_invitation(current_setting('t.code'));
select test.as_user(test.u('del'));
insert into public.reports (reporter_id, reported_user_id, category, details) values (test.u('del'), test.u('bob'), 'technical_problem', 'a problem I reported');
select test.as_user(test.u('reporter'));
insert into public.reports (reporter_id, reported_user_id, category, details) values (test.u('reporter'), test.u('del'), 'suspicious_behavior', 'about the user being deleted');
select test.as_user(test.u('support1'));
select public.admin_read_user_logs(test.u('del'), 'technical_support', 'Support ticket 7 investigation');
select test.as_super();

-- Simulates the Auth Admin API call the Edge Function makes (auth.users is owned by Supabase Auth).
delete from auth.users where id = test.u('del');
select test.eq((select count(*) from public.profiles where id = test.u('del')), 0::bigint, 'deleted: profile gone');
select test.eq((select count(*) from public.period_entries where user_id = test.u('del')), 0::bigint, 'deleted: period entries gone');
select test.eq((select count(*) from public.mood_entries where user_id = test.u('del')), 0::bigint, 'deleted: moods gone');
select test.eq((select count(*) from public.daily_logs where user_id = test.u('del')), 0::bigint, 'deleted: daily logs (and notes) gone');
select test.eq((select count(*) from public.symptom_logs where user_id = test.u('del')), 0::bigint, 'deleted: symptoms gone');
select test.eq((select count(*) from public.support_tips where user_id = test.u('del')), 0::bigint, 'deleted: support tips gone');
select test.eq((select count(*) from public.cycle_settings where user_id = test.u('del')), 0::bigint, 'deleted: cycle settings gone');
select test.eq((select count(*) from public.cycle_predictions where user_id = test.u('del')), 0::bigint, 'deleted: predictions gone');
select test.eq((select count(*) from public.notification_preferences where user_id = test.u('del')), 0::bigint, 'deleted: notification preferences gone');
select test.eq((select count(*) from public.push_subscriptions where user_id = test.u('del')), 0::bigint, 'deleted: push subscriptions gone');
select test.eq((select count(*) from public.partner_invitations where woman_id = test.u('del')), 0::bigint, 'deleted: invitations gone');
select test.eq((select count(*) from public.partner_connections where woman_id = test.u('del')), 0::bigint, 'deleted: connections gone');
select test.eq((select count(*) from public.sharing_permissions), 0::bigint, 'deleted: sharing permissions gone');
select test.eq((select count(*) from public.reports where reporter_id = test.u('del')), 0::bigint, 'deleted: reports she filed gone');
select test.eq((select reported_user_id from public.reports where reporter_id = test.u('reporter')), null::uuid, 'reports ABOUT her survive, with the link to her removed');
select test.as_user(test.u('delpartner'));
select test.eq(public.get_partner_view() ->> 'connected', 'false', 'her partner''s view goes dark immediately');
select test.as_super();
select test.ok(exists (select 1 from public.audit_logs where action = 'account_deleted' and target_user_id = test.u('del')), 'deletion itself is recorded');
select test.eq((select metadata::text from public.audit_logs where action = 'account_deleted' and target_user_id = test.u('del')), '{"role": "woman"}', 'deletion record holds no personal or health data');
select test.ok(exists (select 1 from public.audit_logs where action = 'admin_read_user_logs' and target_user_id = test.u('del')), 'earlier admin-access records are retained (accountability)');
select test.eq((select count(*) from public.audit_logs where metadata::text like '%DELETE-ME%'), 0::bigint, 'no health text anywhere in the audit log');

-- deleting a partner leaves the woman's data untouched
select test.as_user(test.u('alice'));
select set_config('t.code', public.create_partner_invitation(true, '{}'::jsonb) ->> 'code', true);
select test.as_user(test.u('paul'));
select public.redeem_partner_invitation(current_setting('t.code'));
select test.as_super();
delete from auth.users where id = test.u('paul');
select test.as_user(test.u('alice'));
select test.expect_rows('select 1 from public.period_entries', 1, 'deleting her partner does not touch her data');
select test.eq(public.get_my_connection() ->> 'status', 'none', 'and she is no longer connected');

-- ============================ retention job ===================================
select test.as_super();
insert into public.partner_invitations (woman_id, code_hash, expires_at, consent_given_at, status, created_at)
values (test.u('alice'), 'h-expired', now() - interval '1 hour', now() - interval '3 days', 'pending', now() - interval '3 days'),
       (test.u('bob'),   'h-old',     now() - interval '40 days', now() - interval '45 days', 'revoked', now() - interval '45 days');
insert into public.rate_limit_events (user_id, action, created_at) values (test.u('alice'), 'old', now() - interval '3 days');
insert into public.notifications (user_id, kind, created_at) values (test.u('alice'), 'announcement', now() - interval '100 days');
select test.as_user(test.u('alice'));
select test.expect_error('select public.prune_expired_data()', '42501', 'clients cannot run the retention job');
select test.as_service();
select set_config('t.prune', public.prune_expired_data()::text, true);
select test.as_super();
select test.eq((current_setting('t.prune')::jsonb ->> 'invitations_deleted')::int, 1, 'old settled invitations deleted');
select test.ok((current_setting('t.prune')::jsonb ->> 'invitations_expired')::int >= 1, 'stale pending invitations marked expired');
select test.eq((select status::text from public.partner_invitations where code_hash = 'h-expired'), 'expired', 'expired invitation has the right status');
select test.eq((select count(*) from public.rate_limit_events where action = 'old'), 0::bigint, 'old rate-limit events pruned');
select test.eq((select count(*) from public.notifications where created_at < now() - interval '90 days'), 0::bigint, 'old notifications pruned');
