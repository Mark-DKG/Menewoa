-- ============================================================================
-- Menewoa — migration 6/6: least-privilege grants + reference data
--
-- Default-deny: strip every privilege from PUBLIC/anon/authenticated, then
-- grant back exactly what the app needs. RLS (migrations 2-5) restricts ROWS;
-- these grants restrict TABLES, COLUMNS and FUNCTIONS. Two independent layers.
--
-- Anything new that is not listed here is unreachable by clients until someone
-- adds it deliberately — and supabase/tests/10_privileges.sql fails the build
-- if a function becomes executable without being on its allowlist.
-- ============================================================================

-- ------------------------------------------------------------- default-deny --
revoke all on all tables    in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

-- Objects created by later migrations must start closed too.
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

grant usage on schema public to anon, authenticated;

-- The service role (Edge Functions only; its key never reaches the browser).
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- ------------------------------------------------------------ table grants --
-- profiles: a user may edit presentation fields only. `role` and `status` are
-- NOT updatable by clients (the columns are absent from the UPDATE grant).
grant select on public.profiles to authenticated;
grant update (display_name, timezone, onboarding_completed) on public.profiles to authenticated;

grant select on public.cycle_settings to authenticated;
grant update (cycle_length, period_length, track_period, track_symptoms, track_mood,
              track_sleep_energy, track_notes) on public.cycle_settings to authenticated;

grant select on public.notification_preferences to authenticated;
grant update (upcoming_period, period_started, tracking_reminders, partner_updates,
              announcements, show_details_on_lock_screen) on public.notification_preferences to authenticated;

grant select on public.cycle_predictions to authenticated;

grant select on public.period_entries to authenticated;
grant insert (user_id, start_date, end_date, flow) on public.period_entries to authenticated;
grant update (start_date, end_date, flow) on public.period_entries to authenticated;
grant delete on public.period_entries to authenticated;

grant select on public.symptom_catalog to authenticated;
grant select on public.symptom_logs to authenticated;
grant insert (user_id, log_date, symptom_id) on public.symptom_logs to authenticated;
grant delete on public.symptom_logs to authenticated;

grant select on public.mood_entries to authenticated;
grant insert (user_id, log_date, mood) on public.mood_entries to authenticated;
grant update (mood) on public.mood_entries to authenticated;
grant delete on public.mood_entries to authenticated;

grant select on public.daily_logs to authenticated;
grant insert (user_id, log_date, sleep_hours, energy_level, note) on public.daily_logs to authenticated;
grant update (sleep_hours, energy_level, note) on public.daily_logs to authenticated;
grant delete on public.daily_logs to authenticated;

grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant delete on public.notifications to authenticated;

grant select on public.support_tips to authenticated;
grant insert (user_id, tip) on public.support_tips to authenticated;
grant update (tip) on public.support_tips to authenticated;
grant delete on public.support_tips to authenticated;

grant select, delete on public.blocked_users to authenticated;

-- code_hash is deliberately NOT selectable.
grant select (id, woman_id, status, expires_at, consent_given_at, share_period_dates,
              share_expected_period, share_mood, share_symptoms, share_fertility,
              share_private_notes, share_other_sensitive, share_support_tips, accepted_at, created_at)
  on public.partner_invitations to authenticated;

grant select on public.partner_connections to authenticated;
grant select on public.sharing_permissions to authenticated;
grant update (share_period_dates, share_expected_period, share_mood, share_symptoms,
              share_fertility, share_private_notes, share_other_sensitive, share_support_tips)
  on public.sharing_permissions to authenticated;

-- Content: everyone signed in reads (RLS limits to published); writes are gated
-- by RLS policies that require an admin role.
grant select, insert, update, delete on public.articles, public.faqs, public.announcements, public.support_suggestions to authenticated;
grant select, insert, update on public.app_settings to authenticated;

-- resolved_by (an admin id) is not exposed to reporters.
grant select (id, reporter_id, reported_user_id, category, details, status, resolution_note, resolved_at, created_at)
  on public.reports to authenticated;
grant insert (reporter_id, reported_user_id, category, details) on public.reports to authenticated;

-- NO grants at all (service role / SECURITY DEFINER functions only):
--   admin_users, audit_logs, rate_limit_events, push_subscriptions.

-- -------------------------------------------------------- function allowlist --
-- Used by RLS policies (must be executable by the caller):
grant execute on function public.active_uid() to authenticated;
grant execute on function public.is_admin(public.admin_role[]) to authenticated;

-- Client-callable RPCs. Each authorizes the caller itself.
grant execute on function public.set_day_symptoms(date, smallint[]) to authenticated;
grant execute on function public.upsert_mood(date, public.mood_type) to authenticated;
grant execute on function public.upsert_daily_log(date, numeric, smallint, text) to authenticated;
grant execute on function public.register_push_subscription(text, text, text) to authenticated;
grant execute on function public.unregister_push_subscription(text) to authenticated;
grant execute on function public.create_partner_invitation(boolean, jsonb) to authenticated;
grant execute on function public.revoke_partner_invitation() to authenticated;
grant execute on function public.preview_partner_invitation(text) to authenticated;
grant execute on function public.redeem_partner_invitation(text) to authenticated;
grant execute on function public.revoke_partner_connection(uuid) to authenticated;
grant execute on function public.block_connection_counterpart(uuid) to authenticated;
grant execute on function public.get_my_connection() to authenticated;
grant execute on function public.get_partner_view() to authenticated;
grant execute on function public.get_my_admin_status() to authenticated;
grant execute on function public.get_my_access_history() to authenticated;
grant execute on function public.export_my_data() to authenticated;
grant execute on function public.admin_overview() to authenticated;
grant execute on function public.admin_analytics() to authenticated;
grant execute on function public.admin_list_users(text, integer, integer) to authenticated;
grant execute on function public.admin_set_user_status(uuid, public.account_status, text) to authenticated;
grant execute on function public.admin_authorize_delete(uuid, text) to authenticated;
grant execute on function public.admin_list_reports(public.report_status, integer, integer) to authenticated;
grant execute on function public.admin_update_report(uuid, public.report_status, text) to authenticated;
grant execute on function public.admin_read_user_logs(uuid, text, text, boolean) to authenticated;
grant execute on function public.admin_list_audit_logs(integer, bigint) to authenticated;

-- anon (signed-out visitors) gets nothing: the public landing page is static.

-- -------------------------------------------------------- reference data ----
insert into public.symptom_catalog (id, name, sort_order) values
  (1, 'Cramps',            10),
  (2, 'Headache',          20),
  (3, 'Bloating',          30),
  (4, 'Breast tenderness', 40),
  (5, 'Back pain',         50),
  (6, 'Fatigue',           60),
  (7, 'Nausea',            70),
  (8, 'Acne',              80),
  (9, 'Other',             90);

insert into public.support_suggestions (suggestion, sort_order) values
  ('Ask how she is feeling today, and listen without trying to fix it.', 10),
  ('Offer to help with daily tasks like cooking, errands or chores.',    20),
  ('Encourage rest and make space for quiet time.',                       30),
  ('Offer her favourite food or a warm drink.',                           40),
  ('Be patient and kind. Moods and energy can shift from day to day.',    50),
  ('Check in about plans — she may prefer a calmer schedule.',            60);
