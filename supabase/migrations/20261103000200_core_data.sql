-- ============================================================================
-- Menewoa — migration 2/6: profiles, admin roster, cycle data, predictions
-- ============================================================================

-- ------------------------------------------------------------ profiles ----
create table public.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  role                 public.app_role not null default 'woman',
  status               public.account_status not null default 'active',
  display_name         text not null check (char_length(btrim(display_name)) between 1 and 80),
  timezone             text not null default 'UTC',
  onboarding_completed boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create function public.validate_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.display_name := btrim(new.display_name);
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.timezone) then
    raise exception 'invalid_timezone' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger profiles_validate before insert or update on public.profiles
  for each row execute function public.validate_profile();

-- Returns the caller's id ONLY if the account exists and is active. Policies
-- use this instead of auth.uid() so suspended accounts lose all data access.
create function public.active_uid()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.profiles p where p.id = auth.uid() and p.status = 'active';
$$;

-- ---------------------------------------------------------- admin roster --
-- Admin privileges live ONLY here. They are never derived from email
-- addresses, JWT user_metadata (user-editable) or profile fields. Rows can be
-- written only by the database owner / service role (see docs/DEPLOYMENT.md).
create table public.admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  admin_role public.admin_role not null,
  granted_by uuid,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table public.admin_users enable row level security;   -- no policies, no grants

create function public.is_admin(p_roles public.admin_role[] default null)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_mfa_required boolean;
  v_ok boolean;
begin
  select coalesce((select (s.value #>> '{}')::boolean from public.app_settings s where s.key = 'require_admin_mfa'), false)
    into v_mfa_required;

  if v_mfa_required and coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    return false;
  end if;

  select exists (
    select 1
    from public.admin_users a
    join public.profiles p on p.id = a.user_id
    where a.user_id = auth.uid()
      and a.revoked_at is null
      and p.status = 'active'
      and (a.admin_role = 'owner' or p_roles is null or a.admin_role = any (p_roles))
  ) into v_ok;
  return v_ok;
end;
$$;

-- ------------------------------------------------------ cycle settings ----
create table public.cycle_settings (
  user_id            uuid primary key references public.profiles (id) on delete cascade,
  cycle_length       smallint not null default 28 check (cycle_length between 15 and 60),
  period_length      smallint not null default 5  check (period_length between 1 and 14),
  track_period       boolean not null default true,
  track_symptoms     boolean not null default true,
  track_mood         boolean not null default true,
  track_sleep_energy boolean not null default false,
  track_notes        boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger cycle_settings_updated_at before update on public.cycle_settings
  for each row execute function public.set_updated_at();

create table public.notification_preferences (
  user_id            uuid primary key references public.profiles (id) on delete cascade,
  upcoming_period    boolean not null default true,
  period_started     boolean not null default true,
  tracking_reminders boolean not null default false,
  partner_updates    boolean not null default true,
  announcements      boolean not null default true,
  -- OFF by default: lock-screen / push text stays generic unless she opts in.
  show_details_on_lock_screen boolean not null default false,
  updated_at         timestamptz not null default now()
);
create trigger notification_preferences_updated_at before update on public.notification_preferences
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------- period entries --
create table public.period_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  start_date date not null check (start_date >= date '2000-01-01'),
  end_date   date,
  flow       public.flow_level,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint period_dates_ordered check (end_date is null or end_date >= start_date),
  constraint period_max_length    check (end_date is null or end_date - start_date <= 14)
);
create index period_entries_user_start on public.period_entries (user_id, start_date desc);
create trigger period_entries_updated_at before update on public.period_entries
  for each row execute function public.set_updated_at();

-- Validation that CHECK constraints cannot express (they must be immutable).
-- Error messages are stable machine codes the UI maps to friendly text.
create function public.validate_period_entry()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Ordering is checked here as well as by CHECK constraints: BEFORE triggers run
  -- first, and daterange() below would raise an opaque error for end < start.
  if new.end_date is not null and new.end_date < new.start_date then
    raise exception 'end_before_start' using errcode = '23514';
  end if;

  -- +1 day tolerates users who are ahead of the server's UTC date.
  if new.start_date > current_date + 1 or (new.end_date is not null and new.end_date > current_date + 1) then
    raise exception 'date_in_future' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.period_entries e
    where e.user_id = new.user_id
      and e.id <> new.id
      and daterange(e.start_date, coalesce(e.end_date, e.start_date) + 1)
          && daterange(new.start_date, coalesce(new.end_date, new.start_date) + 1)
  ) then
    raise exception 'period_overlaps_existing' using errcode = '23P01';
  end if;
  return new;
end;
$$;
create trigger period_entries_validate before insert or update on public.period_entries
  for each row execute function public.validate_period_entry();

-- ----------------------------------------------------- daily observations -
create function public.validate_log_date()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.log_date > current_date + 1 then
    raise exception 'date_in_future' using errcode = '23514';
  end if;
  return new;
end;
$$;

create table public.symptom_catalog (
  id         smallint primary key,
  name       text not null unique,
  sort_order smallint not null default 0
);
alter table public.symptom_catalog enable row level security;

create table public.symptom_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  log_date   date not null check (log_date >= date '2000-01-01'),
  symptom_id smallint not null references public.symptom_catalog (id),
  created_at timestamptz not null default now(),
  unique (user_id, log_date, symptom_id)
);
create index symptom_logs_user_date on public.symptom_logs (user_id, log_date desc);
create trigger symptom_logs_validate before insert or update on public.symptom_logs
  for each row execute function public.validate_log_date();

create table public.mood_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  log_date   date not null check (log_date >= date '2000-01-01'),
  mood       public.mood_type not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, log_date)
);
create index mood_entries_user_date on public.mood_entries (user_id, log_date desc);
create trigger mood_entries_updated_at before update on public.mood_entries
  for each row execute function public.set_updated_at();
create trigger mood_entries_validate before insert or update on public.mood_entries
  for each row execute function public.validate_log_date();

create table public.daily_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  log_date     date not null check (log_date >= date '2000-01-01'),
  sleep_hours  numeric(3,1) check (sleep_hours between 0 and 24),
  energy_level smallint check (energy_level between 1 and 5),
  note         text check (note is null or char_length(note) <= 2000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, log_date)
);
create index daily_logs_user_date on public.daily_logs (user_id, log_date desc);
create trigger daily_logs_updated_at before update on public.daily_logs
  for each row execute function public.set_updated_at();
create trigger daily_logs_validate before insert or update on public.daily_logs
  for each row execute function public.validate_log_date();

-- SECURITY INVOKER on purpose: RLS decides who may touch which rows, so this
-- atomic "replace today's symptoms" helper cannot be abused across users.
create function public.set_day_symptoms(p_date date, p_symptom_ids smallint[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if coalesce(array_length(p_symptom_ids, 1), 0) > 20 then
    raise exception 'too_many_symptoms' using errcode = '22023';
  end if;
  delete from public.symptom_logs where user_id = auth.uid() and log_date = p_date;
  insert into public.symptom_logs (user_id, log_date, symptom_id)
  select auth.uid(), p_date, s from (select distinct unnest(p_symptom_ids) as s) q;
end;
$$;

-- Upserts as functions (SECURITY INVOKER: RLS still decides). PostgREST's own upsert
-- would try to UPDATE user_id/log_date too, which column grants (rightly) forbid.
create function public.upsert_mood(p_date date, p_mood public.mood_type)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.mood_entries (user_id, log_date, mood) values (auth.uid(), p_date, p_mood)
  on conflict (user_id, log_date) do update set mood = excluded.mood;
$$;

create function public.upsert_daily_log(p_date date, p_sleep_hours numeric, p_energy smallint, p_note text)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.daily_logs (user_id, log_date, sleep_hours, energy_level, note)
  values (auth.uid(), p_date, p_sleep_hours, p_energy, nullif(btrim(coalesce(p_note, '')), ''))
  on conflict (user_id, log_date) do update
    set sleep_hours = excluded.sleep_hours, energy_level = excluded.energy_level, note = excluded.note;
$$;

-- ---------------------------------------------------------- predictions ---
-- Server-side ESTIMATES (never diagnoses). Used for notification scheduling and
-- the partner view. The client recomputes the same numbers locally from the
-- woman's own records (src/lib/cycle.js); tests keep the two in agreement.
create table public.cycle_predictions (
  user_id               uuid primary key references public.profiles (id) on delete cascade,
  based_on_period_start date not null,
  cycle_length_used     smallint not null,
  cycles_used           smallint not null,
  variability_days      numeric(4,1),
  next_period_start     date not null,
  ovulation_date        date not null,
  fertile_start         date not null,
  fertile_end           date not null,
  computed_at           timestamptz not null default now()
);

create function public.recompute_prediction(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_default integer;
  v_last    date;
  v_avg     numeric;
  v_sd      numeric;
  v_n       integer;
  v_cycle   integer;
  v_next    date;
  v_ovul    date;
begin
  select cs.cycle_length into v_default from public.cycle_settings cs where cs.user_id = p_user;
  select max(pe.start_date) into v_last from public.period_entries pe where pe.user_id = p_user;

  if v_default is null or v_last is null then
    delete from public.cycle_predictions where user_id = p_user;
    return;
  end if;

  with recent as (
    select start_date from public.period_entries
    where user_id = p_user order by start_date desc limit 7
  ), gaps as (
    select (start_date - lag(start_date) over (order by start_date))::integer as d from recent
  )
  select avg(d), stddev_samp(d), count(d) into v_avg, v_sd, v_n
  from gaps where d between 15 and 60;

  if coalesce(v_n, 0) >= 2 then
    v_cycle := round(v_avg)::integer;
  else
    v_cycle := v_default;
    v_n := 0;
    v_sd := null;
  end if;

  v_next := v_last + v_cycle;
  v_ovul := v_next - 14;   -- assumes a ~14 day luteal phase: an ESTIMATE

  insert into public.cycle_predictions as cp
    (user_id, based_on_period_start, cycle_length_used, cycles_used, variability_days,
     next_period_start, ovulation_date, fertile_start, fertile_end, computed_at)
  values
    (p_user, v_last, v_cycle, v_n, round(v_sd, 1), v_next, v_ovul, v_ovul - 5, v_ovul + 1, now())
  on conflict (user_id) do update set
    based_on_period_start = excluded.based_on_period_start,
    cycle_length_used     = excluded.cycle_length_used,
    cycles_used           = excluded.cycles_used,
    variability_days      = excluded.variability_days,
    next_period_start     = excluded.next_period_start,
    ovulation_date        = excluded.ovulation_date,
    fertile_start         = excluded.fertile_start,
    fertile_end           = excluded.fertile_end,
    computed_at           = excluded.computed_at;
end;
$$;

create function public.trg_recompute_prediction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.recompute_prediction(coalesce(new.user_id, old.user_id));
  return null;
end;
$$;
create trigger period_entries_predict after insert or update or delete on public.period_entries
  for each row execute function public.trg_recompute_prediction();
create trigger cycle_settings_predict after insert or update on public.cycle_settings
  for each row execute function public.trg_recompute_prediction();

-- ------------------------------------------- new-user bootstrap (server) ---
-- The ONLY place a profile role is assigned. Anything other than the literal
-- string 'partner' becomes 'woman' — a client cannot request 'admin' (that role
-- does not exist on profiles) or anything else.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.app_role := 'woman';
  v_name text;
begin
  if (new.raw_user_meta_data ->> 'role') = 'partner' then
    v_role := 'partner';
  end if;

  v_name := left(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 80);
  if v_name = '' then
    v_name := 'Friend';
  end if;

  insert into public.profiles (id, role, display_name) values (new.id, v_role, v_name);
  insert into public.notification_preferences (user_id) values (new.id);
  if v_role = 'woman' then
    insert into public.cycle_settings (user_id) values (new.id);
  end if;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ================================================================== RLS ===
alter table public.profiles                 enable row level security;
alter table public.cycle_settings           enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.period_entries           enable row level security;
alter table public.symptom_logs             enable row level security;
alter table public.mood_entries             enable row level security;
alter table public.daily_logs               enable row level security;
alter table public.cycle_predictions        enable row level security;

-- A suspended user can still read their own profile (to see the suspension
-- message) but nothing else: every other policy goes through active_uid().
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select public.active_uid())) with check (id = (select public.active_uid()));

create policy cycle_settings_select on public.cycle_settings
  for select to authenticated using (user_id = (select public.active_uid()));
create policy cycle_settings_update on public.cycle_settings
  for update to authenticated
  using (user_id = (select public.active_uid())) with check (user_id = (select public.active_uid()));

create policy notification_preferences_select on public.notification_preferences
  for select to authenticated using (user_id = (select public.active_uid()));
create policy notification_preferences_update on public.notification_preferences
  for update to authenticated
  using (user_id = (select public.active_uid())) with check (user_id = (select public.active_uid()));

create policy cycle_predictions_select on public.cycle_predictions
  for select to authenticated using (user_id = (select public.active_uid()));

create policy symptom_catalog_select on public.symptom_catalog
  for select to authenticated using (true);

do $$
declare
  t text;
begin
  foreach t in array array['period_entries', 'mood_entries', 'daily_logs'] loop
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select public.active_uid()))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select public.active_uid()))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select public.active_uid())) with check (user_id = (select public.active_uid()))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select public.active_uid()))', t || '_delete', t);
  end loop;
end $$;

create policy symptom_logs_select on public.symptom_logs
  for select to authenticated using (user_id = (select public.active_uid()));
create policy symptom_logs_insert on public.symptom_logs
  for insert to authenticated with check (user_id = (select public.active_uid()));
create policy symptom_logs_delete on public.symptom_logs
  for delete to authenticated using (user_id = (select public.active_uid()));
