-- Input validation enforced by the database + server-side predictions.
set local timezone = 'UTC';
select test.mk('val');
select test.as_user(test.u('val'));

-- ---- period entries -----------------------------------------------------
select test.expect_error(format('insert into public.period_entries (user_id, start_date) values (%L, current_date + 10)', test.u('val')), '23514', 'future start date rejected', 'date_in_future');
select test.expect_error(format('insert into public.period_entries (user_id, start_date, end_date) values (%L, current_date - 10, current_date + 10)', test.u('val')), '23514', 'future end date rejected');
select test.expect_error(format('insert into public.period_entries (user_id, start_date, end_date) values (%L, current_date - 5, current_date - 8)', test.u('val')), '23514', 'end before start rejected', 'end_before_start');
select test.expect_error(format('insert into public.period_entries (user_id, start_date, end_date) values (%L, current_date - 60, current_date - 40)', test.u('val')), '23514', 'period longer than 14 days rejected');
select test.expect_error(format('insert into public.period_entries (user_id, start_date) values (%L, date ''1999-12-31'')', test.u('val')), '23514', 'implausibly old date rejected');
select test.expect_error(format('insert into public.period_entries (user_id, start_date, flow) values (%L, current_date - 3, ''gushing'')', test.u('val')), '22P02', 'unknown flow value rejected');

insert into public.period_entries (user_id, start_date, end_date, flow) values (test.u('val'), current_date - 90, current_date - 86, 'medium');
select test.expect_error(format('insert into public.period_entries (user_id, start_date, end_date) values (%L, current_date - 88, current_date - 84)', test.u('val')), '23P01', 'overlapping period rejected', 'period_overlaps_existing');
select test.expect_error(format('insert into public.period_entries (user_id, start_date) values (%L, current_date - 90)', test.u('val')), '23P01', 'same start date rejected');
select test.expect_ok(format('insert into public.period_entries (user_id, start_date, end_date) values (%L, current_date - 85, current_date - 81)', test.u('val')), 'adjacent non-overlapping period accepted');
select test.expect_error(format('update public.period_entries set start_date = current_date - 87, end_date = current_date - 83 where user_id = %L and start_date = current_date - 90', test.u('val')), '23P01', 'editing into an overlap is rejected');

-- ---- logs ---------------------------------------------------------------
select test.expect_error(format('insert into public.mood_entries (user_id, log_date, mood) values (%L, current_date, ''ecstatic'')', test.u('val')), '22P02', 'unknown mood rejected');
select test.expect_error(format('insert into public.mood_entries (user_id, log_date, mood) values (%L, current_date + 5, ''happy'')', test.u('val')), '23514', 'future mood date rejected');
select test.expect_ok(format('insert into public.mood_entries (user_id, log_date, mood) values (%L, current_date, ''happy'')', test.u('val')), 'valid mood accepted');
select test.expect_error(format('insert into public.mood_entries (user_id, log_date, mood) values (%L, current_date, ''calm'')', test.u('val')), '23505', 'second mood on same day rejected (use upsert)');
select test.expect_ok(format('insert into public.mood_entries (user_id, log_date, mood) values (%L, current_date, ''calm'') on conflict (user_id, log_date) do update set mood = excluded.mood', test.u('val')), 'mood upsert works with column grants');
select test.expect_error(format('insert into public.daily_logs (user_id, log_date, sleep_hours) values (%L, current_date, 25)', test.u('val')), '23514', 'sleep > 24h rejected');
select test.expect_error(format('insert into public.daily_logs (user_id, log_date, energy_level) values (%L, current_date, 6)', test.u('val')), '23514', 'energy outside 1..5 rejected');
select test.expect_error(format('insert into public.daily_logs (user_id, log_date, note) values (%L, current_date, repeat(''n'', 2001))', test.u('val')), '23514', 'note over 2000 chars rejected');
select test.expect_ok(format('insert into public.daily_logs (user_id, log_date, sleep_hours, energy_level, note) values (%L, current_date, 7.5, 4, ''ok'')', test.u('val')), 'valid daily log accepted');

select test.expect_ok('select public.upsert_mood(current_date - 3, ''tired'')', 'upsert_mood inserts');
select test.expect_ok('select public.upsert_mood(current_date - 3, ''happy'')', 'upsert_mood updates the same day');
select test.eq((select mood::text from public.mood_entries where log_date = current_date - 3), 'happy', 'upsert_mood kept a single row per day');
select test.expect_error('select public.upsert_mood(current_date + 4, ''happy'')', '23514', 'upsert_mood rejects future dates');
select test.expect_ok('select public.upsert_daily_log(current_date - 3, 6.5, 3::smallint, ''  slept badly  '')', 'upsert_daily_log inserts');
select test.eq((select note from public.daily_logs where log_date = current_date - 3), 'slept badly', 'upsert_daily_log trims notes');
select test.expect_ok('select public.upsert_daily_log(current_date - 3, 8, 4::smallint, null)', 'upsert_daily_log updates');
select test.eq((select note from public.daily_logs where log_date = current_date - 3), null::text, 'blank note stored as null');
select test.expect_error('select public.upsert_daily_log(current_date - 3, 30, 3::smallint, null)', '23514', 'upsert_daily_log validates sleep');
select test.as_user(test.u('val'));
-- ---- symptoms -----------------------------------------------------------
select public.set_day_symptoms(current_date, array[1, 2, 3]::smallint[]);
select test.expect_rows(format('select 1 from public.symptom_logs where user_id = %L and log_date = current_date', test.u('val')), 3, 'set_day_symptoms stores the set');
select public.set_day_symptoms(current_date, array[2, 2, 5]::smallint[]);
select test.expect_rows(format('select 1 from public.symptom_logs where user_id = %L and log_date = current_date', test.u('val')), 2, 'set_day_symptoms replaces and de-duplicates');
select test.expect_error('select public.set_day_symptoms(current_date, array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21]::smallint[])', '22023', 'more than 20 symptoms rejected');
select test.expect_error('select public.set_day_symptoms(current_date, array[99]::smallint[])', '23503', 'unknown symptom id rejected');
select test.expect_error('select public.set_day_symptoms(current_date + 9, array[1]::smallint[])', '23514', 'future symptom date rejected');
select test.expect_rows(format('select 1 from public.symptom_logs where user_id = %L and log_date = current_date', test.u('val')), 2, 'failed set_day_symptoms left earlier data intact');

-- ---- settings & profile ---------------------------------------------------
select test.expect_error('update public.cycle_settings set cycle_length = 10', '23514', 'cycle length below 15 rejected');
select test.expect_error('update public.cycle_settings set cycle_length = 61', '23514', 'cycle length above 60 rejected');
select test.expect_error('update public.cycle_settings set period_length = 0', '23514', 'period length 0 rejected');
select test.expect_ok('update public.cycle_settings set cycle_length = 30, period_length = 6', 'valid cycle settings accepted');
select test.expect_error('update public.profiles set timezone = ''Mars/Olympus''', '23514', 'unknown timezone rejected', 'invalid_timezone');
select test.expect_ok('update public.profiles set timezone = ''Africa/Accra'', display_name = ''  Ama  ''', 'valid timezone + name accepted');
select test.eq((select display_name from public.profiles), 'Ama', 'display name is trimmed');
select test.expect_error('update public.profiles set display_name = ''   ''', '23514', 'blank display name rejected');
select test.expect_error('update public.notification_preferences set show_details_on_lock_screen = null', '23502', 'null preference rejected');

-- ---- predictions ------------------------------------------------------------
select test.as_super();
delete from public.period_entries where user_id = test.u('val');
select test.eq((select count(*) from public.cycle_predictions where user_id = test.u('val')), 0::bigint, 'no entries -> no prediction');
select test.mk('pred');
update public.cycle_settings set cycle_length = 28 where user_id = test.u('pred');

insert into public.period_entries (user_id, start_date, end_date) values (test.u('pred'), current_date - 100, current_date - 96);
select test.eq((select cycles_used from public.cycle_predictions where user_id = test.u('pred')), 0::smallint, 'one entry: no history, uses default length');
select test.eq((select cycle_length_used from public.cycle_predictions where user_id = test.u('pred')), 28::smallint, 'one entry: default cycle length used');
select test.eq((select next_period_start from public.cycle_predictions where user_id = test.u('pred')), current_date - 100 + 28, 'one entry: next = start + default');

insert into public.period_entries (user_id, start_date) values (test.u('pred'), current_date - 72);   -- gap 28
select test.eq((select cycles_used from public.cycle_predictions where user_id = test.u('pred')), 0::smallint, 'one gap is not enough history');
insert into public.period_entries (user_id, start_date) values (test.u('pred'), current_date - 42);   -- gap 30
select test.eq((select cycles_used from public.cycle_predictions where user_id = test.u('pred')), 2::smallint, 'two gaps -> uses history');
select test.eq((select cycle_length_used from public.cycle_predictions where user_id = test.u('pred')), 29::smallint, 'average of 28 and 30 is 29');
select test.eq((select next_period_start from public.cycle_predictions where user_id = test.u('pred')), current_date - 42 + 29, 'next period = last start + average');
select test.eq((select ovulation_date from public.cycle_predictions where user_id = test.u('pred')), current_date - 42 + 29 - 14, 'ovulation estimate = next - 14');
select test.eq((select fertile_start from public.cycle_predictions where user_id = test.u('pred')), current_date - 42 + 29 - 14 - 5, 'fertile window starts 5 days before ovulation');
select test.eq((select fertile_end from public.cycle_predictions where user_id = test.u('pred')), current_date - 42 + 29 - 14 + 1, 'fertile window ends 1 day after ovulation');
-- an outlier gap (> 60 days: a skipped/unlogged cycle) must not poison the average
insert into public.period_entries (user_id, start_date) values (test.u('pred'), current_date - 2);     -- gap 40, ok
insert into public.period_entries (user_id, start_date) values (test.u('pred'), current_date - 250);   -- gap 150 before first, excluded
select test.eq((select cycle_length_used from public.cycle_predictions where user_id = test.u('pred')), 33::smallint, 'outlier gap >60d ignored; average of 28,30,40 = 32.67 -> 33');
-- changing the default only matters while there is too little history
update public.cycle_settings set cycle_length = 35 where user_id = test.u('pred');
select test.eq((select cycle_length_used from public.cycle_predictions where user_id = test.u('pred')), 33::smallint, 'history beats the default setting');
-- deleting an entry recomputes
delete from public.period_entries where user_id = test.u('pred') and start_date = current_date - 2;
select test.eq((select based_on_period_start from public.cycle_predictions where user_id = test.u('pred')), current_date - 42, 'deleting the latest entry recomputes from the previous one');
