-- ============================================================================
-- Menewoa — migration 3/6: notifications core + consent-based partner sharing
--
-- MODEL
--   * A partner has NO table access to a woman's health data. Ever.
--   * A partner reads a minimal, permission-filtered summary through
--     get_partner_view(). Every call re-checks that the connection is still
--     active, so revocation is immediate and total.
--   * Sharing starts only after the woman gives explicit consent when she
--     creates an invitation; every permission defaults to OFF.
--   * Invitation codes are random, single-use, expiring, stored only as a
--     SHA-256 hash, and redemption attempts are rate limited.
-- ============================================================================

-- ------------------------------------------------- in-app notifications ----
-- Rows carry only a KIND and an optional related id — never health details.
-- The client renders the wording; pushes stay generic unless she opts in.
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       public.notification_kind not null,
  related_id uuid,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_created on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;

-- Internal: respects the recipient's notification preferences.
create function public.create_notification(p_user uuid, p_kind public.notification_kind, p_related uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowed boolean;
begin
  select case p_kind
           when 'upcoming_period'    then np.upcoming_period
           when 'period_started'     then np.period_started
           when 'tracking_reminder'  then np.tracking_reminders
           when 'partner_update'     then np.partner_updates
           when 'announcement'       then np.announcements
         end
    into v_allowed
  from public.notification_preferences np
  where np.user_id = p_user;

  if coalesce(v_allowed, false) then
    insert into public.notifications (user_id, kind, related_id) values (p_user, p_kind, p_related);
  end if;
end;
$$;

-- ------------------------------------------------------- support tips -----
create table public.support_tips (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  tip        text not null check (char_length(btrim(tip)) between 1 and 200),
  created_at timestamptz not null default now()
);
create index support_tips_user on public.support_tips (user_id, created_at);
alter table public.support_tips enable row level security;

create function public.limit_support_tips()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.support_tips t where t.user_id = new.user_id) >= 20 then
    raise exception 'too_many_tips' using errcode = '54000';
  end if;
  new.tip := btrim(new.tip);
  return new;
end;
$$;
create trigger support_tips_limit before insert on public.support_tips
  for each row execute function public.limit_support_tips();

-- ----------------------------------------------------------- blocking -----
create table public.blocked_users (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.blocked_users enable row level security;

-- ---------------------------------------------------------- invitations ---
create table public.partner_invitations (
  id                  uuid primary key default gen_random_uuid(),
  woman_id            uuid not null references public.profiles (id) on delete cascade,
  code_hash           text not null unique,
  status              public.invitation_status not null default 'pending',
  expires_at          timestamptz not null,
  consent_given_at    timestamptz not null,
  -- Permissions she is offering. Copied to sharing_permissions on acceptance.
  share_period_dates     boolean not null default false,
  share_expected_period  boolean not null default false,
  share_mood             boolean not null default false,
  share_symptoms         boolean not null default false,
  share_fertility        boolean not null default false,
  share_private_notes    boolean not null default false,
  share_other_sensitive  boolean not null default false,
  share_support_tips     boolean not null default false,
  accepted_by         uuid references public.profiles (id) on delete set null,
  accepted_at         timestamptz,
  created_at          timestamptz not null default now()
);
create unique index partner_invitations_one_pending on public.partner_invitations (woman_id) where status = 'pending';
alter table public.partner_invitations enable row level security;

-- ---------------------------------------------------------- connections ---
create table public.partner_connections (
  id                     uuid primary key default gen_random_uuid(),
  woman_id               uuid not null references public.profiles (id) on delete cascade,
  partner_id             uuid not null references public.profiles (id) on delete cascade,
  status                 public.connection_status not null default 'active',
  consent_given_at       timestamptz not null,
  partner_acknowledged_at timestamptz not null default now(),
  created_at             timestamptz not null default now(),
  revoked_at             timestamptz,
  revoked_by             uuid,
  check (woman_id <> partner_id)
);
-- MVP: one active connection per person. (Multiple supporters = future work.)
create unique index partner_connections_one_active_woman   on public.partner_connections (woman_id)   where status = 'active';
create unique index partner_connections_one_active_partner on public.partner_connections (partner_id) where status = 'active';
create index partner_connections_partner on public.partner_connections (partner_id);
alter table public.partner_connections enable row level security;

create table public.sharing_permissions (
  connection_id         uuid primary key references public.partner_connections (id) on delete cascade,
  share_period_dates    boolean not null default false,
  share_expected_period boolean not null default false,
  share_mood            boolean not null default false,
  share_symptoms        boolean not null default false,
  share_fertility       boolean not null default false,   -- sensitive: OFF by default
  share_private_notes   boolean not null default false,   -- sensitive: OFF by default
  share_other_sensitive boolean not null default false,   -- sleep + energy; OFF by default
  share_support_tips    boolean not null default false,
  updated_at            timestamptz not null default now()
);
create trigger sharing_permissions_updated_at before update on public.sharing_permissions
  for each row execute function public.set_updated_at();
alter table public.sharing_permissions enable row level security;

-- ------------------------------------------------------ invite helpers ----
create function public.normalize_invite_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  -- Crockford base32: ignore case, spaces and dashes; O->0, I/L->1.
  select translate(regexp_replace(upper(coalesce(p_code, '')), '[^0-9A-Z]', '', 'g'), 'OIL', '011');
$$;

create function public.hash_invite_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(public.normalize_invite_code(p_code), 'utf8')), 'hex');
$$;

-- Strict boolean extraction: anything that is not a JSON boolean is rejected.
create function public.json_flag(p_json jsonb, p_key text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_json is null or not (p_json ? p_key) then
    return false;
  end if;
  if jsonb_typeof(p_json -> p_key) <> 'boolean' then
    raise exception 'invalid_permissions' using errcode = '22023';
  end if;
  return (p_json ->> p_key)::boolean;
end;
$$;

-- ------------------------------------------------- create an invitation ---
create function public.create_partner_invitation(p_consent boolean, p_permissions jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := public.active_uid();
  v_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_bytes    bytea;
  v_code     text := '';
  v_idx      integer;
  v_expires  timestamptz := now() + interval '3 days';
  v_perms    jsonb := coalesce(p_permissions, '{}'::jsonb);
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'woman') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_consent is not true then
    raise exception 'consent_required' using errcode = '22023';
  end if;
  if jsonb_typeof(v_perms) <> 'object'
     or exists (
       select 1 from jsonb_object_keys(v_perms) k
       where k not in ('period_dates','expected_period','mood','symptoms','fertility','private_notes','other_sensitive','support_tips')
     ) then
    raise exception 'invalid_permissions' using errcode = '22023';
  end if;

  perform public.enforce_rate_limit('create_invitation', 5, interval '1 hour');

  if exists (select 1 from public.partner_connections c where c.woman_id = v_uid and c.status = 'active') then
    raise exception 'already_connected' using errcode = '23505';
  end if;

  update public.partner_invitations set status = 'revoked'
  where woman_id = v_uid and status = 'pending';

  -- 10 random Crockford characters (50 bits). Bytes 6 and 8 of a v4 UUID carry
  -- fixed version/variant bits, so they are skipped. 256 % 32 = 0: no bias.
  v_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  foreach v_idx in array array[0,1,2,3,4,5,9,10,11,12] loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, v_idx) % 32) + 1, 1);
  end loop;

  insert into public.partner_invitations (
    woman_id, code_hash, expires_at, consent_given_at,
    share_period_dates, share_expected_period, share_mood, share_symptoms,
    share_fertility, share_private_notes, share_other_sensitive, share_support_tips
  ) values (
    v_uid, public.hash_invite_code(v_code), v_expires, now(),
    public.json_flag(v_perms, 'period_dates'), public.json_flag(v_perms, 'expected_period'),
    public.json_flag(v_perms, 'mood'), public.json_flag(v_perms, 'symptoms'),
    public.json_flag(v_perms, 'fertility'), public.json_flag(v_perms, 'private_notes'),
    public.json_flag(v_perms, 'other_sensitive'), public.json_flag(v_perms, 'support_tips')
  );

  -- The plaintext code exists only in this return value. It is never stored.
  return jsonb_build_object(
    'code', substr(v_code, 1, 5) || '-' || substr(v_code, 6, 5),
    'expires_at', v_expires
  );
end;
$$;

create function public.revoke_partner_invitation()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.active_uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  update public.partner_invitations set status = 'revoked'
  where woman_id = v_uid and status = 'pending';
end;
$$;

-- ------------------------------------------- preview + redeem (partner) ---
-- Both return {ok:false,error:...} instead of RAISING on bad input. That is
-- deliberate: an exception would roll back the rate-limit row written at the
-- top, letting an attacker guess codes without ever being counted.
create function public.preview_partner_invitation(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.active_uid();
  v_inv public.partner_invitations%rowtype;
  v_name text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  perform public.enforce_rate_limit('redeem_invitation', 10, interval '15 minutes');

  if not exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'partner') then
    return jsonb_build_object('ok', false, 'error', 'invalid_or_expired');
  end if;

  select i.* into v_inv from public.partner_invitations i
  where i.code_hash = public.hash_invite_code(p_code) and i.status = 'pending' and i.expires_at > now();
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_or_expired');
  end if;

  if exists (
    select 1 from public.blocked_users b
    where (b.blocker_id = v_inv.woman_id and b.blocked_id = v_uid)
       or (b.blocker_id = v_uid and b.blocked_id = v_inv.woman_id)
  ) or not exists (select 1 from public.profiles w where w.id = v_inv.woman_id and w.status = 'active') then
    return jsonb_build_object('ok', false, 'error', 'invalid_or_expired');
  end if;

  select p.display_name into v_name from public.profiles p where p.id = v_inv.woman_id;
  return jsonb_build_object(
    'ok', true,
    'from_name', v_name,
    'expires_at', v_inv.expires_at,
    'permissions', jsonb_build_object(
      'period_dates', v_inv.share_period_dates, 'expected_period', v_inv.share_expected_period,
      'mood', v_inv.share_mood, 'symptoms', v_inv.share_symptoms,
      'fertility', v_inv.share_fertility, 'private_notes', v_inv.share_private_notes,
      'other_sensitive', v_inv.share_other_sensitive, 'support_tips', v_inv.share_support_tips
    )
  );
end;
$$;

create function public.redeem_partner_invitation(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.active_uid();
  v_inv public.partner_invitations%rowtype;
  v_conn uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  perform public.enforce_rate_limit('redeem_invitation', 10, interval '15 minutes');

  if not exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'partner') then
    return jsonb_build_object('ok', false, 'error', 'invalid_or_expired');
  end if;

  select i.* into v_inv from public.partner_invitations i
  where i.code_hash = public.hash_invite_code(p_code) and i.status = 'pending' and i.expires_at > now()
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_or_expired');
  end if;

  if exists (
    select 1 from public.blocked_users b
    where (b.blocker_id = v_inv.woman_id and b.blocked_id = v_uid)
       or (b.blocker_id = v_uid and b.blocked_id = v_inv.woman_id)
  ) or not exists (select 1 from public.profiles w where w.id = v_inv.woman_id and w.status = 'active') then
    return jsonb_build_object('ok', false, 'error', 'invalid_or_expired');
  end if;

  if exists (select 1 from public.partner_connections c where c.partner_id = v_uid and c.status = 'active') then
    return jsonb_build_object('ok', false, 'error', 'already_connected');
  end if;
  if exists (select 1 from public.partner_connections c where c.woman_id = v_inv.woman_id and c.status = 'active') then
    return jsonb_build_object('ok', false, 'error', 'invalid_or_expired');
  end if;

  insert into public.partner_connections (woman_id, partner_id, consent_given_at)
  values (v_inv.woman_id, v_uid, v_inv.consent_given_at)
  returning id into v_conn;

  insert into public.sharing_permissions (
    connection_id, share_period_dates, share_expected_period, share_mood, share_symptoms,
    share_fertility, share_private_notes, share_other_sensitive, share_support_tips
  ) values (
    v_conn, v_inv.share_period_dates, v_inv.share_expected_period, v_inv.share_mood, v_inv.share_symptoms,
    v_inv.share_fertility, v_inv.share_private_notes, v_inv.share_other_sensitive, v_inv.share_support_tips
  );

  update public.partner_invitations
  set status = 'accepted', accepted_by = v_uid, accepted_at = now()
  where id = v_inv.id;

  perform public.create_notification(v_inv.woman_id, 'partner_update', v_conn);
  return jsonb_build_object('ok', true, 'connection_id', v_conn);
end;
$$;

-- --------------------------------------------- revoke / block (either side) -
create function public.revoke_partner_connection(p_connection_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.active_uid();
  v_conn public.partner_connections%rowtype;
  v_other uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select c.* into v_conn from public.partner_connections c
  where c.id = p_connection_id and (c.woman_id = v_uid or c.partner_id = v_uid) and c.status = 'active'
  for update;
  if not found then
    return;   -- nothing to revoke; do not reveal whether the id exists
  end if;

  update public.partner_connections
  set status = 'revoked', revoked_at = now(), revoked_by = v_uid
  where id = v_conn.id;

  -- Belt and braces: even if some code path forgot to check status, nothing is shared.
  update public.sharing_permissions set
    share_period_dates = false, share_expected_period = false, share_mood = false,
    share_symptoms = false, share_fertility = false, share_private_notes = false,
    share_other_sensitive = false, share_support_tips = false
  where connection_id = v_conn.id;

  v_other := case when v_conn.woman_id = v_uid then v_conn.partner_id else v_conn.woman_id end;
  perform public.create_notification(v_other, 'partner_update', v_conn.id);
end;
$$;

create function public.block_connection_counterpart(p_connection_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.active_uid();
  v_conn public.partner_connections%rowtype;
  v_other uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select c.* into v_conn from public.partner_connections c
  where c.id = p_connection_id and (c.woman_id = v_uid or c.partner_id = v_uid)
  for update;
  if not found then
    return;
  end if;
  v_other := case when v_conn.woman_id = v_uid then v_conn.partner_id else v_conn.woman_id end;

  update public.partner_connections
  set status = 'blocked', revoked_at = coalesce(revoked_at, now()), revoked_by = coalesce(revoked_by, v_uid)
  where id = v_conn.id;

  update public.sharing_permissions set
    share_period_dates = false, share_expected_period = false, share_mood = false,
    share_symptoms = false, share_fertility = false, share_private_notes = false,
    share_other_sensitive = false, share_support_tips = false
  where connection_id = v_conn.id;

  update public.partner_invitations set status = 'revoked'
  where woman_id = v_uid and status = 'pending';

  insert into public.blocked_users (blocker_id, blocked_id) values (v_uid, v_other)
  on conflict do nothing;
end;
$$;

-- ------------------------------------------------- connection summaries ---
create function public.get_my_connection()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.active_uid();
  v_role public.app_role;
  v_conn public.partner_connections%rowtype;
  v_other uuid;
  v_name text;
  v_perm public.sharing_permissions%rowtype;
  v_inv public.partner_invitations%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'none');
  end if;
  select p.role into v_role from public.profiles p where p.id = v_uid;

  select c.* into v_conn from public.partner_connections c
  where c.status = 'active' and (c.woman_id = v_uid or c.partner_id = v_uid);

  if found then
    v_other := case when v_conn.woman_id = v_uid then v_conn.partner_id else v_conn.woman_id end;
    select p.display_name into v_name from public.profiles p where p.id = v_other;
    select sp.* into v_perm from public.sharing_permissions sp where sp.connection_id = v_conn.id;
    return jsonb_build_object(
      'status', 'active',
      'role', v_role,
      'connection_id', v_conn.id,
      'counterpart_id', v_other,
      'counterpart_name', v_name,
      'since', v_conn.created_at,
      'consent_given_at', v_conn.consent_given_at,
      'permissions', jsonb_build_object(
        'period_dates', v_perm.share_period_dates, 'expected_period', v_perm.share_expected_period,
        'mood', v_perm.share_mood, 'symptoms', v_perm.share_symptoms,
        'fertility', v_perm.share_fertility, 'private_notes', v_perm.share_private_notes,
        'other_sensitive', v_perm.share_other_sensitive, 'support_tips', v_perm.share_support_tips
      )
    );
  end if;

  if v_role = 'woman' then
    select i.* into v_inv from public.partner_invitations i
    where i.woman_id = v_uid and i.status = 'pending' and i.expires_at > now();
    if found then
      return jsonb_build_object('status', 'invited', 'role', v_role, 'invitation_expires_at', v_inv.expires_at);
    end if;
    if exists (select 1 from public.blocked_users b where b.blocker_id = v_uid) then
      return jsonb_build_object('status', 'none', 'role', v_role, 'has_blocked', true);
    end if;
  end if;
  return jsonb_build_object('status', 'none', 'role', v_role);
end;
$$;

-- ----------------------------------------------------- THE partner view ---
create function public.get_partner_view()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := public.active_uid();
  v_conn  public.partner_connections%rowtype;
  v_woman public.profiles%rowtype;
  v_perm  public.sharing_permissions%rowtype;
  v_today date;
  v_out   jsonb;
  v_pred  public.cycle_predictions%rowtype;
  v_pstart date;
  v_pend   date;
begin
  if v_uid is null then
    return jsonb_build_object('connected', false);
  end if;

  select c.* into v_conn from public.partner_connections c
  where c.partner_id = v_uid and c.status = 'active';
  if not found then
    return jsonb_build_object('connected', false);
  end if;

  select w.* into v_woman from public.profiles w where w.id = v_conn.woman_id and w.status = 'active';
  if not found then
    return jsonb_build_object('connected', false);
  end if;

  select sp.* into v_perm from public.sharing_permissions sp where sp.connection_id = v_conn.id;
  v_today := (now() at time zone v_woman.timezone)::date;

  v_out := jsonb_build_object(
    'connected', true,
    'connection_id', v_conn.id,
    'woman_name', v_woman.display_name,
    'woman_today', v_today,
    'shared', jsonb_build_object(
      'period_dates', v_perm.share_period_dates, 'expected_period', v_perm.share_expected_period,
      'mood', v_perm.share_mood, 'symptoms', v_perm.share_symptoms,
      'fertility', v_perm.share_fertility, 'private_notes', v_perm.share_private_notes,
      'other_sensitive', v_perm.share_other_sensitive, 'support_tips', v_perm.share_support_tips
    )
  );

  -- Every block below is gated by a permission AND returns only the most
  -- recent few items. A partner can never page through history.
  if v_perm.share_period_dates then
    select e.start_date, e.end_date into v_pstart, v_pend
    from public.period_entries e where e.user_id = v_woman.id order by e.start_date desc limit 1;
    v_out := v_out || jsonb_build_object('period', jsonb_build_object('last_start', v_pstart, 'last_end', v_pend));
  end if;

  if v_perm.share_expected_period or v_perm.share_fertility then
    select cp.* into v_pred from public.cycle_predictions cp where cp.user_id = v_woman.id;
    if found then
      if v_perm.share_expected_period then
        v_out := v_out || jsonb_build_object('expected', jsonb_build_object(
          'next_period_start', v_pred.next_period_start, 'cycles_used', v_pred.cycles_used));
      end if;
      if v_perm.share_fertility then
        v_out := v_out || jsonb_build_object('fertility', jsonb_build_object(
          'fertile_start', v_pred.fertile_start, 'fertile_end', v_pred.fertile_end,
          'ovulation_date', v_pred.ovulation_date));
      end if;
    end if;
  end if;

  if v_perm.share_mood then
    v_out := v_out || jsonb_build_object('mood', (
      select coalesce(jsonb_agg(jsonb_build_object('date', m.log_date, 'mood', m.mood::text) order by m.log_date desc), '[]'::jsonb)
      from (select log_date, mood from public.mood_entries
            where user_id = v_woman.id and log_date >= v_today - 6
            order by log_date desc limit 3) m));
  end if;

  if v_perm.share_symptoms then
    v_out := v_out || jsonb_build_object('symptoms', (
      select coalesce(jsonb_agg(jsonb_build_object('date', s.log_date, 'name', s.name) order by s.log_date desc, s.name), '[]'::jsonb)
      from (select sl.log_date, c.name from public.symptom_logs sl
            join public.symptom_catalog c on c.id = sl.symptom_id
            where sl.user_id = v_woman.id and sl.log_date >= v_today - 2
            order by sl.log_date desc, c.name limit 12) s));
  end if;

  if v_perm.share_other_sensitive then
    v_out := v_out || jsonb_build_object('wellbeing', (
      select coalesce(jsonb_agg(jsonb_build_object('date', d.log_date, 'sleep_hours', d.sleep_hours, 'energy_level', d.energy_level) order by d.log_date desc), '[]'::jsonb)
      from (select log_date, sleep_hours, energy_level from public.daily_logs
            where user_id = v_woman.id and log_date >= v_today - 2
              and (sleep_hours is not null or energy_level is not null)
            order by log_date desc limit 3) d));
  end if;

  if v_perm.share_private_notes then
    v_out := v_out || jsonb_build_object('notes', (
      select coalesce(jsonb_agg(jsonb_build_object('date', n.log_date, 'note', n.note) order by n.log_date desc), '[]'::jsonb)
      from (select log_date, note from public.daily_logs
            where user_id = v_woman.id and note is not null and btrim(note) <> ''
            order by log_date desc limit 3) n));
  end if;

  if v_perm.share_support_tips then
    v_out := v_out || jsonb_build_object('support_tips', (
      select coalesce(jsonb_agg(t.tip order by t.created_at), '[]'::jsonb)
      from public.support_tips t where t.user_id = v_woman.id));
  end if;

  return v_out;
end;
$$;

-- ================================================================== RLS ===
create policy notifications_select on public.notifications
  for select to authenticated using (user_id = (select public.active_uid()));
create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = (select public.active_uid())) with check (user_id = (select public.active_uid()));
create policy notifications_delete on public.notifications
  for delete to authenticated using (user_id = (select public.active_uid()));

create policy support_tips_select on public.support_tips
  for select to authenticated using (user_id = (select public.active_uid()));
create policy support_tips_insert on public.support_tips
  for insert to authenticated with check (user_id = (select public.active_uid()));
create policy support_tips_update on public.support_tips
  for update to authenticated
  using (user_id = (select public.active_uid())) with check (user_id = (select public.active_uid()));
create policy support_tips_delete on public.support_tips
  for delete to authenticated using (user_id = (select public.active_uid()));

create policy blocked_users_select on public.blocked_users
  for select to authenticated using (blocker_id = (select public.active_uid()));
create policy blocked_users_delete on public.blocked_users
  for delete to authenticated using (blocker_id = (select public.active_uid()));

create policy partner_invitations_select on public.partner_invitations
  for select to authenticated using (woman_id = (select public.active_uid()));

create policy partner_connections_select on public.partner_connections
  for select to authenticated
  using ((select public.active_uid()) in (woman_id, partner_id));

-- A woman may edit permissions only on HER OWN, STILL-ACTIVE connection.
create policy sharing_permissions_select on public.sharing_permissions
  for select to authenticated using (
    exists (select 1 from public.partner_connections c
            where c.id = connection_id and c.status = 'active'
              and (select public.active_uid()) in (c.woman_id, c.partner_id)));
create policy sharing_permissions_update on public.sharing_permissions
  for update to authenticated
  using (exists (select 1 from public.partner_connections c
                 where c.id = connection_id and c.status = 'active' and c.woman_id = (select public.active_uid())))
  with check (exists (select 1 from public.partner_connections c
                      where c.id = connection_id and c.status = 'active' and c.woman_id = (select public.active_uid())));
