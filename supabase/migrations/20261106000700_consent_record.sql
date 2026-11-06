-- ============================================================================
-- Menewoa — migration 7/7: consent record
--
-- Health information is special-category data: the app must be able to show WHEN a
-- person accepted the Terms / Privacy Policy and gave explicit consent to process the
-- health information they log. Timestamps are set by the database, never by the
-- browser, and clients cannot write these columns (no UPDATE grant).
--
--   * handle_new_user() records consent given on the sign-up form (user metadata).
--   * record_consent() lets a signed-in user record it later — used by the in-app
--     consent gate for people who signed up before this version or outside the UI.
--   * export_my_data() now includes the consent record.
-- ============================================================================

alter table public.profiles
  add column terms_version     text check (terms_version is null or terms_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  add column terms_accepted_at timestamptz,
  add column health_consent_at timestamptz;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role   public.app_role := 'woman';
  v_name   text;
  v_terms  text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'terms_version', '')), '');
  v_health boolean;
begin
  if (new.raw_user_meta_data ->> 'role') = 'partner' then
    v_role := 'partner';
  end if;

  v_name := left(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 80);
  if v_name = '' then
    v_name := 'Friend';
  end if;

  -- Only a well-formed version string counts; the timestamps are ours, not the client's.
  if v_terms is not null and v_terms !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    v_terms := null;
  end if;
  v_health := v_role = 'woman' and v_terms is not null and (new.raw_user_meta_data ->> 'health_consent') = 'true';

  insert into public.profiles (id, role, display_name, terms_version, terms_accepted_at, health_consent_at)
  values (new.id, v_role, v_name, v_terms,
          case when v_terms is not null then now() end,
          case when v_health then now() end);
  insert into public.notification_preferences (user_id) values (new.id);
  if v_role = 'woman' then
    insert into public.cycle_settings (user_id) values (new.id);
  end if;
  return new;
end;
$$;

create function public.record_consent(p_terms_version text, p_health_consent boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := public.active_uid();
  v_role public.app_role;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_terms_version is null or p_terms_version !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'invalid_version' using errcode = '22023';
  end if;
  perform public.enforce_rate_limit('record_consent', 20, interval '1 hour');

  select p.role into v_role from public.profiles p where p.id = v_uid;
  update public.profiles set
    terms_version = p_terms_version,
    terms_accepted_at = now(),
    health_consent_at = case when v_role = 'woman' and p_health_consent is true then now() else health_consent_at end
  where id = v_uid;

  perform public.write_audit('consent_recorded', v_uid, null, null,
                             jsonb_build_object('terms_version', p_terms_version, 'health_consent', coalesce(p_health_consent, false)));
end;
$$;
revoke all on function public.record_consent(text, boolean) from public, anon;
grant execute on function public.record_consent(text, boolean) to authenticated;

-- export_my_data: unchanged except for the added "consent" block.
create or replace function public.export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_out jsonb;
begin
  if v_uid is null or not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  perform public.enforce_rate_limit('export_my_data', 3, interval '1 day');

  v_out := jsonb_build_object(
    'exported_at', now(),
    'format_version', 1,
    'profile', (select jsonb_build_object('display_name', p.display_name, 'role', p.role, 'status', p.status,
                                          'timezone', p.timezone, 'created_at', p.created_at)
                from public.profiles p where p.id = v_uid),
    'consent', (select jsonb_build_object('terms_version', p.terms_version, 'terms_accepted_at', p.terms_accepted_at,
                                          'health_consent_at', p.health_consent_at)
                from public.profiles p where p.id = v_uid),
    'cycle_settings', (select to_jsonb(cs) - 'user_id' from public.cycle_settings cs where cs.user_id = v_uid),
    'notification_preferences', (select to_jsonb(np) - 'user_id' from public.notification_preferences np where np.user_id = v_uid),
    'cycle_prediction', (select to_jsonb(cp) - 'user_id' from public.cycle_predictions cp where cp.user_id = v_uid),
    'period_entries', (select coalesce(jsonb_agg(jsonb_build_object('start_date', e.start_date, 'end_date', e.end_date, 'flow', e.flow, 'created_at', e.created_at) order by e.start_date), '[]'::jsonb)
                       from public.period_entries e where e.user_id = v_uid),
    'symptoms', (select coalesce(jsonb_agg(jsonb_build_object('date', sl.log_date, 'symptom', c.name) order by sl.log_date, c.name), '[]'::jsonb)
                 from public.symptom_logs sl join public.symptom_catalog c on c.id = sl.symptom_id where sl.user_id = v_uid),
    'mood_entries', (select coalesce(jsonb_agg(jsonb_build_object('date', m.log_date, 'mood', m.mood) order by m.log_date), '[]'::jsonb)
                     from public.mood_entries m where m.user_id = v_uid),
    'daily_logs', (select coalesce(jsonb_agg(jsonb_build_object('date', d.log_date, 'sleep_hours', d.sleep_hours, 'energy_level', d.energy_level, 'note', d.note) order by d.log_date), '[]'::jsonb)
                   from public.daily_logs d where d.user_id = v_uid),
    'support_tips', (select coalesce(jsonb_agg(t.tip order by t.created_at), '[]'::jsonb)
                     from public.support_tips t where t.user_id = v_uid),
    'notifications', (select coalesce(jsonb_agg(jsonb_build_object('kind', n.kind, 'created_at', n.created_at, 'read_at', n.read_at) order by n.created_at), '[]'::jsonb)
                      from public.notifications n where n.user_id = v_uid),
    'partner_connection', public.get_my_connection(),
    'reports_submitted', (select coalesce(jsonb_agg(jsonb_build_object('category', r.category, 'details', r.details, 'status', r.status, 'created_at', r.created_at) order by r.created_at), '[]'::jsonb)
                          from public.reports r where r.reporter_id = v_uid),
    'administrator_access_history', public.get_my_access_history()
  );

  perform public.write_audit('data_export', v_uid);
  return v_out;
end;
$$;
