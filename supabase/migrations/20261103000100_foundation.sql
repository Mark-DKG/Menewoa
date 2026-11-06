-- ============================================================================
-- Menewoa — migration 1/6: foundation
--
-- Enums, shared helpers, rate limiting, the append-only audit log and
-- app-level settings.
--
-- SECURITY CONVENTIONS used by every migration (checked by supabase/tests):
--   * Every table in `public` has RLS enabled.
--   * `anon` has no table or function access at all.
--   * `authenticated` gets only the explicit column/row grants listed in
--     migration 6. Everything else is reachable ONLY through SECURITY DEFINER
--     functions, which pin `search_path = ''` and re-check authorization
--     themselves (they never trust the front end).
--   * New functions are revoked from PUBLIC/anon/authenticated by the loop at the
--     end of migration 6. Any function added later must be added to the
--     allowlist in supabase/tests/10_privileges.sql or the test suite fails.
-- ============================================================================

-- ---------------------------------------------------------------- enums ----
create type public.app_role           as enum ('woman', 'partner');
create type public.admin_role         as enum ('owner', 'support', 'content');
create type public.account_status     as enum ('active', 'suspended');
create type public.flow_level         as enum ('light', 'medium', 'heavy');
create type public.mood_type          as enum ('happy', 'calm', 'irritated', 'sad', 'anxious', 'energetic', 'tired', 'other');
create type public.invitation_status  as enum ('pending', 'accepted', 'revoked', 'expired');
create type public.connection_status  as enum ('active', 'revoked', 'blocked');
create type public.notification_kind  as enum ('upcoming_period', 'period_started', 'tracking_reminder', 'partner_update', 'announcement');
create type public.article_category   as enum ('menstrual_cycles', 'period_symptoms', 'pms', 'cycle_tracking', 'supporting_a_partner', 'reproductive_health');
create type public.report_category    as enum ('harassment', 'abuse', 'suspicious_behavior', 'privacy_concern', 'technical_problem');
create type public.report_status      as enum ('open', 'in_review', 'resolved', 'dismissed');

-- -------------------------------------------------------------- helpers ----
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ------------------------------------------------------- app settings -----
-- Non-sensitive, admin-managed configuration (feature toggles, branding).
create table public.app_settings (
  key         text primary key check (key ~ '^[a-z][a-z0-9_]{1,63}$'),
  value       jsonb not null,
  updated_by  uuid,                       -- no FK: survives admin deletion
  updated_at  timestamptz not null default now()
);
create trigger app_settings_updated_at before update on public.app_settings
  for each row execute function public.set_updated_at();
alter table public.app_settings enable row level security;

insert into public.app_settings (key, value) values
  ('app_name',               '"Menewoa"'),
  ('feature_partner_sharing','true'),
  ('feature_insights',       'true'),
  ('feature_education',      'true'),
  -- Strongly recommended ON before launch once admins have enrolled MFA.
  ('require_admin_mfa',      'false');

-- ------------------------------------------------------- audit log --------
-- Append-only. user ids are stored WITHOUT foreign keys on purpose: the log
-- must outlive deleted accounts, and it never contains health data (only
-- action names, ids, reason categories and free-text reasons written by staff).
create table public.audit_logs (
  id              bigint generated always as identity primary key,
  actor_id        uuid,
  action          text not null check (char_length(action) between 1 and 80),
  target_user_id  uuid,
  reason_category text,
  reason          text check (reason is null or char_length(reason) <= 1000),
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index audit_logs_target_idx on public.audit_logs (target_user_id, created_at desc);
create index audit_logs_actor_idx  on public.audit_logs (actor_id, created_at desc);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
alter table public.audit_logs enable row level security;   -- no policies: no client access

create function public.audit_logs_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_logs is append-only' using errcode = '42501';
end;
$$;
create trigger audit_logs_no_update before update or delete on public.audit_logs
  for each row execute function public.audit_logs_immutable();
create trigger audit_logs_no_truncate before truncate on public.audit_logs
  for each statement execute function public.audit_logs_immutable();

-- Internal: write an audit row. Not callable by clients.
create function public.write_audit(
  p_action text,
  p_target uuid default null,
  p_reason_category text default null,
  p_reason text default null,
  p_metadata jsonb default '{}'::jsonb
) returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (actor_id, action, target_user_id, reason_category, reason, metadata)
  values (auth.uid(), p_action, p_target, p_reason_category, p_reason, coalesce(p_metadata, '{}'::jsonb));
$$;

-- Generic trigger for admin-managed content tables: records WHO changed WHICH
-- row, never the content itself.
create function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text;
begin
  v_id := coalesce((to_jsonb(new) ->> 'id'), (to_jsonb(old) ->> 'id'), (to_jsonb(new) ->> 'key'), (to_jsonb(old) ->> 'key'));
  perform public.write_audit(
    tg_table_name || '_' || lower(tg_op), null, null, null,
    jsonb_build_object('row', v_id)
  );
  return coalesce(new, old);
end;
$$;

-- ----------------------------------------------------- rate limiting ------
-- Sensitive RPCs call enforce_rate_limit(). Auth endpoints (login, signup,
-- password reset, OTP) are rate limited by Supabase Auth itself — see
-- supabase/config.toml and docs/SECURITY.md.
create table public.rate_limit_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null,
  action     text not null,
  created_at timestamptz not null default now()
);
create index rate_limit_events_lookup on public.rate_limit_events (user_id, action, created_at desc);
alter table public.rate_limit_events enable row level security;   -- no policies

create function public.enforce_rate_limit(p_action text, p_max integer, p_window interval)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  insert into public.rate_limit_events (user_id, action) values (v_uid, p_action);

  select count(*) into v_count
  from public.rate_limit_events
  where user_id = v_uid and action = p_action and created_at > now() - p_window;

  if v_count > p_max then
    raise exception 'rate_limited' using errcode = '54000';
  end if;

  delete from public.rate_limit_events
  where user_id = v_uid and created_at < now() - interval '2 days';
end;
$$;
