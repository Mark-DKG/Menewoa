-- ============================================================================
-- Menewoa — migration 5/6: admin functions, privacy dashboard, data lifecycle
--
-- Admins have NO direct table access to health data. They get:
--   * aggregate-only analytics (small groups suppressed, k >= 5),
--   * account-level moderation (status changes with a mandatory reason),
--   * ONE break-glass reader, admin_read_user_logs(), which requires a reason
--     category + written justification, is rate limited, is written to the
--     append-only audit log, and is visible to the affected user in
--     get_my_access_history().
-- Every function re-checks authorization itself via is_admin().
-- ============================================================================

-- Small-cell suppression for anything derived from health logs.
create function public.k_suppress(p_n bigint, p_k integer default 5)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case when p_n between 1 and (p_k - 1) then null else p_n end;
$$;

-- ----------------------------------------------------- who am I (for UI) ----
-- Display only. Real enforcement is is_admin() inside every admin function/policy.
create function public.get_my_admin_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.admin_role;
  v_mfa_required boolean;
  v_aal2 boolean;
begin
  select a.admin_role into v_role
  from public.admin_users a
  join public.profiles p on p.id = a.user_id
  where a.user_id = auth.uid() and a.revoked_at is null and p.status = 'active';
  if not found then
    return jsonb_build_object('is_admin', false);
  end if;
  v_mfa_required := coalesce((select (s.value #>> '{}')::boolean from public.app_settings s where s.key = 'require_admin_mfa'), false);
  v_aal2 := coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
  return jsonb_build_object(
    'is_admin', (not v_mfa_required) or v_aal2,
    'role', v_role,
    'mfa_required', v_mfa_required,
    'aal2', v_aal2
  );
end;
$$;

-- ------------------------------------------------------------ overview -----
create function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'total_users',       (select count(*) from public.profiles),
    'women',             (select count(*) from public.profiles where role = 'woman'),
    'partners',          (select count(*) from public.profiles where role = 'partner'),
    'suspended',         (select count(*) from public.profiles where status = 'suspended'),
    'new_users_7d',      (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'new_users_30d',     (select count(*) from public.profiles where created_at > now() - interval '30 days'),
    'active_connections',(select count(*) from public.partner_connections where status = 'active'),
    'open_reports',      (select count(*) from public.reports where status in ('open', 'in_review')),
    'active_loggers_7d', public.k_suppress((
      select count(distinct u) from (
        select user_id as u from public.period_entries where created_at > now() - interval '7 days'
        union all select user_id from public.mood_entries   where created_at > now() - interval '7 days'
        union all select user_id from public.daily_logs     where created_at > now() - interval '7 days'
        union all select user_id from public.symptom_logs   where created_at > now() - interval '7 days'
      ) x)),
    'feature_usage_30d', jsonb_build_object(
      'period_entries', public.k_suppress((select count(*) from public.period_entries where created_at > now() - interval '30 days')),
      'mood_entries',   public.k_suppress((select count(*) from public.mood_entries   where created_at > now() - interval '30 days')),
      'symptom_logs',   public.k_suppress((select count(*) from public.symptom_logs   where created_at > now() - interval '30 days')),
      'daily_logs',     public.k_suppress((select count(*) from public.daily_logs     where created_at > now() - interval '30 days'))
    )
  );
end;
$$;

-- ----------------------------------------------------------- analytics -----
create function public.admin_analytics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'k_threshold', 5,
    'signups_by_week', (
      select coalesce(jsonb_agg(jsonb_build_object('week', w.week, 'count', public.k_suppress(w.n)) order by w.week), '[]'::jsonb)
      from (
        select gs::date as week,
               (select count(*) from public.profiles p where p.created_at >= gs and p.created_at < gs + interval '7 days') as n
        from generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') gs
      ) w),
    'daily_logging_users_30d', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'users', public.k_suppress(d.n)) order by d.day), '[]'::jsonb)
      from (
        select x.d as day, count(distinct x.u) as n from (
          select user_id as u, created_at::date as d from public.mood_entries   where created_at > now() - interval '30 days'
          union all select user_id, created_at::date from public.daily_logs     where created_at > now() - interval '30 days'
          union all select user_id, created_at::date from public.symptom_logs   where created_at > now() - interval '30 days'
          union all select user_id, created_at::date from public.period_entries where created_at > now() - interval '30 days'
        ) x group by x.d
      ) d),
    'top_symptoms_90d', (
      select coalesce(jsonb_agg(jsonb_build_object('name', s.name, 'users', s.n) order by s.n desc, s.name), '[]'::jsonb)
      from (
        select c.name, count(distinct sl.user_id) as n
        from public.symptom_logs sl join public.symptom_catalog c on c.id = sl.symptom_id
        where sl.log_date >= current_date - 90
        group by c.name
        having count(distinct sl.user_id) >= 5
      ) s),
    'mood_distribution_90d', (
      select coalesce(jsonb_agg(jsonb_build_object('mood', m.mood, 'users', m.n) order by m.n desc, m.mood), '[]'::jsonb)
      from (
        select me.mood::text as mood, count(distinct me.user_id) as n
        from public.mood_entries me
        where me.log_date >= current_date - 90
        group by me.mood
        having count(distinct me.user_id) >= 5
      ) m),
    'cycle_stats', (
      select case when count(*) >= 5
                  then jsonb_build_object('users', count(*), 'avg_cycle_length', round(avg(cp.cycle_length_used), 1))
                  else null end
      from public.cycle_predictions cp where cp.cycles_used >= 2)
  );
end;
$$;

-- ------------------------------------------------------ user management -----
create function public.admin_list_users(p_search text default null, p_limit integer default 25, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pat   text;
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 50);
  v_off   integer := greatest(coalesce(p_offset, 0), 0);
  v_total bigint;
  v_rows  jsonb;
begin
  if not public.is_admin(array['support']::public.admin_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if nullif(btrim(p_search), '') is not null then
    -- escape LIKE wildcards so a search for "%" is a literal search
    v_pat := '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  select count(*) into v_total
  from public.profiles p join auth.users u on u.id = p.id
  where v_pat is null or p.display_name ilike v_pat escape '\' or u.email ilike v_pat escape '\';

  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb) into v_rows
  from (
    select p.id, p.display_name, u.email, p.role, p.status, p.created_at
    from public.profiles p join auth.users u on u.id = p.id
    where v_pat is null or p.display_name ilike v_pat escape '\' or u.email ilike v_pat escape '\'
    order by p.created_at desc
    limit v_limit offset v_off
  ) r;

  return jsonb_build_object('total', v_total, 'users', v_rows);
end;
$$;

create function public.admin_set_user_status(p_user uuid, p_status public.account_status, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.is_admin(array['support']::public.admin_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform public.enforce_rate_limit('admin_set_user_status', 60, interval '1 hour');
  if char_length(v_reason) < 5 or char_length(v_reason) > 1000 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if p_user = auth.uid() then
    raise exception 'cannot_target_self' using errcode = '42501';
  end if;
  if exists (select 1 from public.admin_users a where a.user_id = p_user and a.revoked_at is null) then
    raise exception 'cannot_target_admin' using errcode = '42501';
  end if;

  update public.profiles set status = p_status where id = p_user;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  perform public.write_audit('admin_set_user_status', p_user, 'moderation', v_reason,
                             jsonb_build_object('status', p_status));
end;
$$;

-- Step 1 of account deletion by an admin. The Edge Function calls this with the
-- ADMIN'S OWN JWT; only if it succeeds does it use the service role to delete.
create function public.admin_authorize_delete(p_user uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.is_admin(array['owner']::public.admin_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform public.enforce_rate_limit('admin_delete_user', 10, interval '1 hour');
  if char_length(v_reason) < 5 or char_length(v_reason) > 1000 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if p_user = auth.uid() then
    raise exception 'cannot_target_self' using errcode = '42501';
  end if;
  if exists (select 1 from public.admin_users a where a.user_id = p_user and a.revoked_at is null) then
    raise exception 'cannot_target_admin' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  perform public.write_audit('admin_delete_user', p_user, 'account_deletion', v_reason);
end;
$$;

-- --------------------------------------------------------------- reports ----
create function public.admin_list_reports(p_status public.report_status default null, p_limit integer default 50, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_off   integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not public.is_admin(array['support']::public.admin_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb)
    from (
      select rp.id, rp.category, rp.details, rp.status, rp.resolution_note, rp.created_at,
             rp.reporter_id, rep.display_name as reporter_name,
             rp.reported_user_id, tgt.display_name as reported_name
      from public.reports rp
      left join public.profiles rep on rep.id = rp.reporter_id
      left join public.profiles tgt on tgt.id = rp.reported_user_id
      where p_status is null or rp.status = p_status
      order by rp.created_at desc
      limit v_limit offset v_off
    ) r);
end;
$$;

create function public.admin_update_report(p_id uuid, p_status public.report_status, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin(array['support']::public.admin_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_note is not null and char_length(p_note) > 2000 then
    raise exception 'note_too_long' using errcode = '22023';
  end if;

  update public.reports set
    status = p_status,
    resolution_note = nullif(btrim(coalesce(p_note, '')), ''),
    resolved_by = case when p_status in ('resolved', 'dismissed') then auth.uid() else null end,
    resolved_at = case when p_status in ('resolved', 'dismissed') then now() else null end
  where id = p_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  perform public.write_audit('admin_update_report', null, null, null,
                             jsonb_build_object('report', p_id, 'status', p_status));
end;
$$;

-- ----------------------------------------------- break-glass record reader ---
create function public.admin_read_user_logs(
  p_target uuid,
  p_category text,
  p_reason text,
  p_include_notes boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_prof   public.profiles%rowtype;
  v_notes  boolean := coalesce(p_include_notes, false);
begin
  if not public.is_admin(array['support']::public.admin_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform public.enforce_rate_limit('admin_read_user_logs', 20, interval '1 hour');

  if p_category is null or p_category not in ('user_request', 'safety_investigation', 'legal_obligation', 'technical_support') then
    raise exception 'invalid_reason_category' using errcode = '22023';
  end if;
  if char_length(v_reason) < 10 or char_length(v_reason) > 1000 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if p_target = auth.uid() then
    raise exception 'cannot_target_self' using errcode = '42501';
  end if;

  select p.* into v_prof from public.profiles p where p.id = p_target;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  -- Audit FIRST, in the same transaction: no data is returned without a record.
  perform public.write_audit('admin_read_user_logs', p_target, p_category, v_reason,
                             jsonb_build_object('include_notes', v_notes, 'window_days', 90));

  return jsonb_build_object(
    'window_days', 90,
    'profile', jsonb_build_object(
      'display_name', v_prof.display_name, 'role', v_prof.role, 'status', v_prof.status,
      'timezone', v_prof.timezone, 'created_at', v_prof.created_at),
    'cycle_settings', (select to_jsonb(cs) - 'user_id' from public.cycle_settings cs where cs.user_id = p_target),
    'period_entries', (
      select coalesce(jsonb_agg(jsonb_build_object('start_date', e.start_date, 'end_date', e.end_date, 'flow', e.flow) order by e.start_date desc), '[]'::jsonb)
      from (select * from public.period_entries where user_id = p_target and start_date >= current_date - 90 order by start_date desc limit 50) e),
    'mood_entries', (
      select coalesce(jsonb_agg(jsonb_build_object('date', m.log_date, 'mood', m.mood) order by m.log_date desc), '[]'::jsonb)
      from (select * from public.mood_entries where user_id = p_target and log_date >= current_date - 90 order by log_date desc limit 90) m),
    'symptoms', (
      select coalesce(jsonb_agg(jsonb_build_object('date', s.log_date, 'symptom', s.name) order by s.log_date desc, s.name), '[]'::jsonb)
      from (select sl.log_date, c.name from public.symptom_logs sl join public.symptom_catalog c on c.id = sl.symptom_id
            where sl.user_id = p_target and sl.log_date >= current_date - 90
            order by sl.log_date desc, c.name limit 500) s),
    'daily_logs', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'date', d.log_date, 'sleep_hours', d.sleep_hours, 'energy_level', d.energy_level,
               'note', case when v_notes then d.note else null end) order by d.log_date desc), '[]'::jsonb)
      from (select * from public.daily_logs where user_id = p_target and log_date >= current_date - 90 order by log_date desc limit 90) d)
  );
end;
$$;

create function public.admin_list_audit_logs(p_limit integer default 100, p_before_id bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin(array['owner']::public.admin_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(to_jsonb(a) order by a.id desc), '[]'::jsonb)
    from (
      select id, actor_id, action, target_user_id, reason_category, reason, metadata, created_at
      from public.audit_logs
      where p_before_id is null or id < p_before_id
      order by id desc
      limit least(greatest(coalesce(p_limit, 100), 1), 200)
    ) a);
end;
$$;

-- ----------------------------------------- user-facing privacy dashboard -----
-- What an administrator did that touched THIS account. Reasons are not shown
-- (they may name other people); the category and time are.
create function public.get_my_access_history()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('at', h.created_at, 'action', h.action, 'reason_category', h.reason_category)
                            order by h.created_at desc), '[]'::jsonb)
  from (
    select a.created_at, a.action, a.reason_category
    from public.audit_logs a
    where a.target_user_id = auth.uid()
      and a.action in ('admin_read_user_logs', 'admin_set_user_status', 'admin_delete_user')
    order by a.created_at desc
    limit 100
  ) h;
$$;

-- --------------------------------------------------------- data export -----
create function public.export_my_data()
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

-- ------------------------------------------------ account deletion audit -----
-- Fires for every deletion path (self-service and admin) because it hangs off
-- the profile row that auth.users deletion cascades to. Logs the fact, not data.
create function public.audit_account_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.write_audit('account_deleted', old.id, null, null, jsonb_build_object('role', old.role));
  return old;
end;
$$;
create trigger profiles_audit_delete after delete on public.profiles
  for each row execute function public.audit_account_deleted();

-- ------------------------------------------------------ retention job -------
-- Schedule with pg_cron or a Supabase scheduled function (see docs/DEPLOYMENT.md).
-- Callable only by the database owner / service role.
create function public.prune_expired_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expired integer;
  v_inv     integer;
  v_rate    integer;
  v_notif   integer;
begin
  update public.partner_invitations set status = 'expired'
  where status = 'pending' and expires_at <= now();
  get diagnostics v_expired = row_count;

  delete from public.partner_invitations
  where status <> 'pending' and created_at < now() - interval '30 days';
  get diagnostics v_inv = row_count;

  delete from public.rate_limit_events where created_at < now() - interval '2 days';
  get diagnostics v_rate = row_count;

  delete from public.notifications where created_at < now() - interval '90 days';
  get diagnostics v_notif = row_count;

  return jsonb_build_object('invitations_expired', v_expired, 'invitations_deleted', v_inv,
                            'rate_events_deleted', v_rate, 'notifications_deleted', v_notif);
end;
$$;
