-- Education content visibility and the reporting & safety workflow.
set local timezone = 'UTC';
select test.mk('alice'); select test.mk('bob'); select test.mk('owner1'); select test.mk('support1'); select test.mk('content1');
select test.make_admin(test.u('owner1'), 'owner'); select test.make_admin(test.u('support1'), 'support'); select test.make_admin(test.u('content1'), 'content');

-- ============================ content visibility ==============================
-- The project ships seed content (supabase/seed.sql); these tests need a known-empty table.
set local session_replication_role = replica;   -- clean-up only: skip the audit triggers
delete from public.articles; delete from public.faqs;
set local session_replication_role = origin;
insert into public.articles (slug, title, category, body, published) values
  ('about-cycles', 'About cycles', 'menstrual_cycles', 'text', true),
  ('draft-piece',  'Draft piece',  'pms', 'text', false);
insert into public.faqs (question, answer, published) values ('Is it private?', 'Yes.', true), ('Hidden question?', 'Hidden.', false);
insert into public.announcements (title, body, published_at, expires_at) values
  ('Live now',      'x', now() - interval '1 day', null),
  ('Scheduled',     'x', now() + interval '1 day', null),
  ('Expired',       'x', now() - interval '3 days', now() - interval '1 day'),
  ('Never shown',   'x', null, null);
update public.support_suggestions set active = false where sort_order = 60;

select test.as_user(test.u('alice'));
select test.expect_rows('select 1 from public.articles', 1, 'users see only published articles');
select test.expect_rows('select 1 from public.faqs', 1, 'users see only published FAQs');
select test.expect_rows('select 1 from public.announcements', 1, 'users see only live announcements (not scheduled, expired or unpublished)');
select test.expect_rows('select 1 from public.support_suggestions', 5, 'users see only active support suggestions');
select test.expect_rows('select 1 from public.symptom_catalog', 9, 'symptom catalogue readable');
select test.expect_rows('select 1 from public.app_settings', 5, 'users can read (non-sensitive) app settings');
select test.eq(test.affected('update public.articles set title = ''hacked'''), 0::bigint, 'users cannot edit articles');
select test.eq(test.affected('delete from public.faqs'), 0::bigint, 'users cannot delete FAQs');
select test.as_user(test.u('content1'));
select test.expect_rows('select 1 from public.articles', 2, 'content admin sees drafts too');
select test.eq(test.affected('update public.articles set title = ''About cycles (edited)'' where slug = ''about-cycles'''), 1::bigint, 'content admin can edit');
select test.expect_error('insert into public.articles (slug, title, category, body) values (''Bad Slug!'', ''Title'', ''pms'', ''x'')', '23514', 'slug format enforced');
select test.expect_error('insert into public.articles (slug, title, category, body) values (''ok-slug'', ''Title'', ''not_a_category'', ''x'')', '22P02', 'category enum enforced');
select test.eq(test.affected('delete from public.articles where slug = ''draft-piece'''), 1::bigint, 'content admin can delete');
select test.as_super();
select test.ok((select count(*) from public.audit_logs where action in ('articles_update', 'articles_delete')) = 2, 'content edits and deletes are audited');

-- ============================ reporting =======================================
select test.as_user(test.u('alice'));
select test.expect_ok(format('insert into public.reports (reporter_id, reported_user_id, category, details) values (%L, %L, ''harassment'', ''  He keeps sending me messages  '')', test.u('alice'), test.u('bob')), 'user can file a report');
select test.eq((select details from public.reports), 'He keeps sending me messages', 'details are trimmed');
select test.expect_error(format('insert into public.reports (reporter_id, category, details) values (%L, ''abuse'', ''too short'')', test.u('alice')), '23514', 'details must be at least 10 characters');
select test.expect_error(format('insert into public.reports (reporter_id, category, details) values (%L, ''abuse'', repeat(''x'', 2001))', test.u('alice')), '23514', 'details capped at 2000 characters');
select test.expect_error(format('insert into public.reports (reporter_id, category, details) values (%L, ''abuse'', ''reporting as someone else'')', test.u('bob')), '42501', 'cannot file a report as another user');
select test.expect_error(format('insert into public.reports (reporter_id, category, details, status) values (%L, ''abuse'', ''trying to pre-resolve it'', ''resolved'')', test.u('alice')), '42501', 'cannot choose the report status');
select test.expect_error('select resolved_by from public.reports', '42501', 'reporter cannot read which admin handled it');
select test.expect_error('update public.reports set details = ''edited after the fact''', '42501', 'reports cannot be edited by the reporter');
select test.expect_error('delete from public.reports', '42501', 'reports cannot be deleted by the reporter');
select test.expect_rows('select id from public.reports', 1, 'reporter sees their own report');
select test.as_user(test.u('bob'));
select test.expect_rows('select id from public.reports', 0, 'the person reported cannot see the report');
select test.as_user(test.u('alice'));
-- rate limit: 5 per hour (1 filed so far)
insert into public.reports (reporter_id, category, details) select test.u('alice'), 'technical_problem', 'rate limit exercise ' || i from generate_series(1, 4) i;
select test.expect_error(format('insert into public.reports (reporter_id, category, details) values (%L, ''technical_problem'', ''the sixth report this hour'')', test.u('alice')), '54000', 'a 6th report within an hour is rate limited', 'rate_limited');

-- ============================ moderation ======================================
select test.as_user(test.u('content1'));
select test.expect_error('select public.admin_list_reports()', '42501', 'content admin cannot see reports');
select test.as_user(test.u('support1'));
select test.eq(jsonb_array_length(public.admin_list_reports()), 5, 'support sees all reports');
select test.eq(jsonb_array_length(public.admin_list_reports('resolved')), 0, 'status filter works');
select test.eq(public.admin_list_reports() -> 0 ->> 'reporter_name', 'Alice', 'report list names the reporter');
select set_config('t.rid', (select e ->> 'id' from jsonb_array_elements(public.admin_list_reports()) e where e ->> 'category' = 'harassment'), true);
select test.expect_error(format('select public.admin_update_report(%L, ''resolved'', repeat(''n'', 2001))', current_setting('t.rid')), '22023', 'resolution note capped');
select test.expect_error('select public.admin_update_report(gen_random_uuid(), ''resolved'', ''x'')', 'P0002', 'unknown report -> not_found');
select public.admin_update_report(current_setting('t.rid')::uuid, 'resolved', 'Account warned.');
select test.eq(jsonb_array_length(public.admin_list_reports('resolved')), 1, 'report is resolved');
select test.as_super();
select test.ok((select resolved_by = test.u('support1') and resolved_at is not null from public.reports where id = current_setting('t.rid')::uuid), 'resolver and time recorded');
select test.ok(exists (select 1 from public.audit_logs where action = 'admin_update_report' and (metadata ->> 'report') = current_setting('t.rid')), 'moderation action audited');
select test.as_user(test.u('alice'));
select test.eq((select status::text from public.reports where id = current_setting('t.rid')::uuid), 'resolved', 'the reporter sees the outcome');
select test.eq((select resolution_note from public.reports where id = current_setting('t.rid')::uuid), 'Account warned.', 'and the resolution note');
