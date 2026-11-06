-- Cross-user isolation: a user must never read or change another user's data by
-- guessing ids or crafting requests.
set local timezone = 'UTC';
select test.mk('alice'); select test.mk('bob'); select test.mk('pat', 'partner');

-- alice creates her data
select test.as_user(test.u('alice'));
insert into public.period_entries (user_id, start_date, end_date, flow) values (test.u('alice'), current_date - 20, current_date - 16, 'medium');
insert into public.mood_entries (user_id, log_date, mood) values (test.u('alice'), current_date - 1, 'sad');
insert into public.daily_logs (user_id, log_date, sleep_hours, energy_level, note) values (test.u('alice'), current_date - 1, 6.5, 2, 'alice secret note');
select public.set_day_symptoms(current_date - 1, array[1, 3]::smallint[]);
insert into public.support_tips (user_id, tip) values (test.u('alice'), 'Tea please');

select test.expect_rows('select 1 from public.period_entries', 1, 'alice sees her own period entry');
select test.expect_rows('select 1 from public.symptom_logs', 2, 'alice sees her own symptoms');
select test.expect_rows('select 1 from public.cycle_predictions', 1, 'alice has a server-side prediction row');

-- alice cannot write rows owned by someone else
select test.expect_error(format('insert into public.period_entries (user_id, start_date) values (%L, current_date - 3)', test.u('bob')), '42501', 'alice cannot insert a period entry for bob');
select test.expect_error(format('insert into public.mood_entries (user_id, log_date, mood) values (%L, current_date, ''happy'')', test.u('bob')), '42501', 'alice cannot insert a mood for bob');
select test.expect_error(format('insert into public.daily_logs (user_id, log_date, note) values (%L, current_date, ''x'')', test.u('bob')), '42501', 'alice cannot insert a daily log for bob');
select test.expect_error(format('insert into public.symptom_logs (user_id, log_date, symptom_id) values (%L, current_date, 1)', test.u('bob')), '42501', 'alice cannot insert symptoms for bob');
select test.expect_error(format('insert into public.support_tips (user_id, tip) values (%L, ''x'')', test.u('bob')), '42501', 'alice cannot insert tips for bob');

-- bob sees and changes nothing of alice's
select test.as_user(test.u('bob'));
select test.expect_rows('select 1 from public.period_entries', 0, 'bob sees no period entries');
select test.expect_rows('select 1 from public.mood_entries', 0, 'bob sees no moods');
select test.expect_rows('select 1 from public.daily_logs', 0, 'bob sees no daily logs');
select test.expect_rows('select 1 from public.symptom_logs', 0, 'bob sees no symptom logs');
select test.expect_rows('select 1 from public.support_tips', 0, 'bob sees no support tips');
select test.expect_rows('select 1 from public.cycle_predictions', 0, 'bob sees no predictions');
select test.expect_rows(format('select 1 from public.period_entries where user_id = %L', test.u('alice')), 0, 'filtering by alice''s id still returns nothing');
select test.expect_rows(format('select 1 from public.profiles where id = %L', test.u('alice')), 0, 'bob cannot read alice''s profile');
select test.expect_rows(format('select 1 from public.cycle_settings where user_id = %L', test.u('alice')), 0, 'bob cannot read alice''s cycle settings');
select test.expect_rows(format('select 1 from public.notification_preferences where user_id = %L', test.u('alice')), 0, 'bob cannot read alice''s notification preferences');
select test.eq(test.affected(format('update public.daily_logs set note = ''hacked'' where user_id = %L', test.u('alice'))), 0::bigint, 'bob cannot update alice''s daily log');
select test.eq(test.affected(format('delete from public.period_entries where user_id = %L', test.u('alice'))), 0::bigint, 'bob cannot delete alice''s period entry');
select test.eq(test.affected(format('update public.profiles set display_name = ''Pwned'' where id = %L', test.u('alice'))), 0::bigint, 'bob cannot rename alice');
select test.eq(test.affected(format('update public.cycle_settings set cycle_length = 40 where user_id = %L', test.u('alice'))), 0::bigint, 'bob cannot change alice''s cycle settings');
select test.eq(test.affected(format('update public.mood_entries set mood = ''happy'' where user_id = %L', test.u('alice'))), 0::bigint, 'bob cannot change alice''s mood');
-- set_day_symptoms is SECURITY INVOKER: it can only ever touch the caller's rows
select public.set_day_symptoms(current_date - 1, array[2]::smallint[]);
select test.as_user(test.u('alice'));
select test.expect_rows('select 1 from public.symptom_logs', 2, 'alice''s symptoms untouched by bob''s set_day_symptoms');

-- Re-pointing ownership is impossible (user_id not in UPDATE grants)
select test.expect_error('update public.period_entries set user_id = ' || quote_literal(test.u('bob')), '42501', 'alice cannot hand her row to bob');

-- A partner (even one with no connection) sees no health tables
select test.as_user(test.u('pat'));
select test.expect_rows('select 1 from public.period_entries', 0, 'partner has no table access to period entries');
select test.expect_rows('select 1 from public.mood_entries', 0, 'partner has no table access to moods');
select test.expect_rows('select 1 from public.daily_logs', 0, 'partner has no table access to daily logs');
select test.expect_rows(format('select 1 from public.profiles where id = %L', test.u('alice')), 0, 'partner cannot read the woman''s profile row');

-- Suspended accounts lose all data access immediately (but can see their own profile)
select test.as_super();
update public.profiles set status = 'suspended' where id = test.u('alice');
select test.as_user(test.u('alice'));
select test.expect_rows('select 1 from public.period_entries', 0, 'suspended alice cannot read her entries');
select test.expect_rows('select 1 from public.profiles', 1, 'suspended alice can still read her own profile (to see the suspension)');
select test.expect_error(format('insert into public.mood_entries (user_id, log_date, mood) values (%L, current_date, ''happy'')', test.u('alice')), '42501', 'suspended alice cannot write');
select test.expect_error('select public.create_partner_invitation(true, ''{}''::jsonb)', '28000', 'suspended alice cannot create invitations');
select test.as_super();
