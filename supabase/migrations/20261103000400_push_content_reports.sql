-- ============================================================================
-- Menewoa — migration 4/6: push subscriptions, education content, reports
-- ============================================================================

-- ------------------------------------------------- push subscriptions ------
-- Clients never read or write this table directly: register/unregister go
-- through validated functions, and only the send-notifications Edge Function
-- (service role) reads the keys. Expired endpoints (HTTP 404/410 from the push
-- service) are deleted by that function.
create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  endpoint   text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1024),
  p256dh     text not null check (char_length(p256dh) between 20 and 200),
  auth       text not null check (char_length(auth) between 10 and 100),
  created_at timestamptz not null default now(),
  last_success_at timestamptz
);
create index push_subscriptions_user on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;   -- no policies

create function public.register_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
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
  perform public.enforce_rate_limit('register_push', 20, interval '1 hour');

  -- Re-registering an endpoint on a shared device moves it to the current user:
  -- the previous user must never keep receiving this device's notifications.
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id <> v_uid;

  if (select count(*) from public.push_subscriptions s where s.user_id = v_uid and s.endpoint <> p_endpoint) >= 5 then
    delete from public.push_subscriptions
    where id in (select id from public.push_subscriptions where user_id = v_uid order by created_at asc limit 1);
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (v_uid, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;

create function public.unregister_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

-- ------------------------------------------------------------- content ----
create table public.articles (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,80}$'),
  title      text not null check (char_length(btrim(title)) between 3 and 160),
  category   public.article_category not null,
  body       text not null check (char_length(body) between 1 and 20000),
  published  boolean not null default false,
  author_id  uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index articles_category on public.articles (category) where published;
create trigger articles_updated_at before update on public.articles
  for each row execute function public.set_updated_at();

create table public.faqs (
  id         uuid primary key default gen_random_uuid(),
  question   text not null check (char_length(btrim(question)) between 3 and 300),
  answer     text not null check (char_length(btrim(answer)) between 1 and 4000),
  sort_order integer not null default 0,
  published  boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.announcements (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(btrim(title)) between 3 and 160),
  body         text not null check (char_length(body) between 1 and 2000),
  published_at timestamptz,
  expires_at   timestamptz,
  created_at   timestamptz not null default now()
);

-- General "How can I support her?" suggestions shown to every partner.
create table public.support_suggestions (
  id         uuid primary key default gen_random_uuid(),
  suggestion text not null check (char_length(btrim(suggestion)) between 3 and 200),
  sort_order integer not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.articles            enable row level security;
alter table public.faqs                enable row level security;
alter table public.announcements       enable row level security;
alter table public.support_suggestions enable row level security;

-- Readers see published content only. Writers must hold the content (or owner)
-- admin role, checked by the database — not by the UI.
create policy articles_read  on public.articles  for select to authenticated using (published or public.is_admin(array['content']::public.admin_role[]));
create policy articles_write_i on public.articles for insert to authenticated with check (public.is_admin(array['content']::public.admin_role[]));
create policy articles_write_u on public.articles for update to authenticated using (public.is_admin(array['content']::public.admin_role[])) with check (public.is_admin(array['content']::public.admin_role[]));
create policy articles_write_d on public.articles for delete to authenticated using (public.is_admin(array['content']::public.admin_role[]));

create policy faqs_read  on public.faqs for select to authenticated using (published or public.is_admin(array['content']::public.admin_role[]));
create policy faqs_write_i on public.faqs for insert to authenticated with check (public.is_admin(array['content']::public.admin_role[]));
create policy faqs_write_u on public.faqs for update to authenticated using (public.is_admin(array['content']::public.admin_role[])) with check (public.is_admin(array['content']::public.admin_role[]));
create policy faqs_write_d on public.faqs for delete to authenticated using (public.is_admin(array['content']::public.admin_role[]));

create policy announcements_read on public.announcements for select to authenticated
  using ((published_at is not null and published_at <= now() and (expires_at is null or expires_at > now()))
         or public.is_admin(array['content']::public.admin_role[]));
create policy announcements_write_i on public.announcements for insert to authenticated with check (public.is_admin(array['content']::public.admin_role[]));
create policy announcements_write_u on public.announcements for update to authenticated using (public.is_admin(array['content']::public.admin_role[])) with check (public.is_admin(array['content']::public.admin_role[]));
create policy announcements_write_d on public.announcements for delete to authenticated using (public.is_admin(array['content']::public.admin_role[]));

create policy support_suggestions_read on public.support_suggestions for select to authenticated
  using (active or public.is_admin(array['content']::public.admin_role[]));
create policy support_suggestions_write_i on public.support_suggestions for insert to authenticated with check (public.is_admin(array['content']::public.admin_role[]));
create policy support_suggestions_write_u on public.support_suggestions for update to authenticated using (public.is_admin(array['content']::public.admin_role[])) with check (public.is_admin(array['content']::public.admin_role[]));
create policy support_suggestions_write_d on public.support_suggestions for delete to authenticated using (public.is_admin(array['content']::public.admin_role[]));

-- App settings: everyone signed in may read (feature toggles / app name);
-- only owners may change them.
create policy app_settings_read   on public.app_settings for select to authenticated using (true);
create policy app_settings_write_i on public.app_settings for insert to authenticated with check (public.is_admin(array['owner']::public.admin_role[]));
create policy app_settings_write_u on public.app_settings for update to authenticated using (public.is_admin(array['owner']::public.admin_role[])) with check (public.is_admin(array['owner']::public.admin_role[]));

-- Every admin content / settings change is audited (who + which row, never content).
create trigger articles_audit            after insert or update or delete on public.articles            for each row execute function public.audit_row_change();
create trigger faqs_audit                after insert or update or delete on public.faqs                for each row execute function public.audit_row_change();
create trigger announcements_audit       after insert or update or delete on public.announcements       for each row execute function public.audit_row_change();
create trigger support_suggestions_audit after insert or update or delete on public.support_suggestions for each row execute function public.audit_row_change();
create trigger app_settings_audit        after insert or update or delete on public.app_settings        for each row execute function public.audit_row_change();

-- -------------------------------------------------------------- reports ---
create table public.reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid not null references public.profiles (id) on delete cascade,
  reported_user_id uuid references public.profiles (id) on delete set null,
  category         public.report_category not null,
  details          text not null check (char_length(btrim(details)) between 10 and 2000),
  status           public.report_status not null default 'open',
  resolution_note  text check (resolution_note is null or char_length(resolution_note) <= 2000),
  resolved_by      uuid,
  resolved_at      timestamptz,
  created_at       timestamptz not null default now()
);
create index reports_status_created on public.reports (status, created_at desc);
create index reports_reporter on public.reports (reporter_id, created_at desc);
alter table public.reports enable row level security;

create policy reports_select_own on public.reports for select to authenticated
  using (reporter_id = (select public.active_uid()));
create policy reports_insert_own on public.reports for insert to authenticated
  with check (reporter_id = (select public.active_uid()) and status = 'open'
              and resolution_note is null and resolved_by is null and resolved_at is null);

create function public.rate_limit_report_insert()
returns trigger
language plpgsql
security definer     -- so clients never need EXECUTE on enforce_rate_limit itself
set search_path = ''
as $$
begin
  perform public.enforce_rate_limit('submit_report', 5, interval '1 hour');
  new.details := btrim(new.details);
  return new;
end;
$$;
create trigger reports_rate_limit before insert on public.reports
  for each row execute function public.rate_limit_report_insert();
