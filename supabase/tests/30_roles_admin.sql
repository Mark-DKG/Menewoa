-- Role assignment and admin privilege: nobody can become an admin by any client-side means.
set local timezone = 'UTC';

-- ---- role comes from the server-side trigger, whitelisted ------------------
select test.make_user('a1@example.test', 'partner', 'P');
select test.make_user('a2@example.test', 'woman', 'W');
select test.make_user('a3@example.test', 'admin', 'Hacker');
select test.make_user('a4@example.test', 'owner', 'Hacker');
select test.make_user('a5@example.test', 'PARTNER', 'Hacker');
select test.make_user('a6@example.test', null, null);
select test.make_user('a7@example.test', null, null);
select test.make_user('a8@example.test', null, repeat('x', 300));
create function pg_temp.prof(p_email text) returns public.profiles language sql as
  $$ select p.* from public.profiles p join auth.users u on u.id = p.id where u.email = p_email $$;
select test.eq((pg_temp.prof('a1@example.test')).role::text, 'partner', 'signup metadata "partner" -> partner');
select test.eq((pg_temp.prof('a2@example.test')).role::text, 'woman', 'signup metadata "woman" -> woman');
select test.eq((pg_temp.prof('a3@example.test')).role::text, 'woman', 'signup metadata "admin" -> woman (no admin self-assignment)');
select test.eq((pg_temp.prof('a4@example.test')).role::text, 'woman', 'signup metadata "owner" -> woman');
select test.eq((pg_temp.prof('a5@example.test')).role::text, 'woman', 'role match is exact, not case-insensitive guessing');
select test.eq((pg_temp.prof('a6@example.test')).role::text, 'woman', 'missing metadata -> woman');
select test.eq((pg_temp.prof('a7@example.test')).display_name, 'Friend', 'missing display name gets a neutral default');
select test.eq(char_length((pg_temp.prof('a8@example.test')).display_name), 80, 'long display names are truncated to 80');
select test.eq((select count(*) from public.cycle_settings where user_id = (pg_temp.prof('a1@example.test')).id), 0::bigint, 'partners get no cycle settings row');
select test.eq((select count(*) from public.cycle_settings where user_id = (pg_temp.prof('a2@example.test')).id), 1::bigint, 'women get cycle settings');
select test.eq((select count(*) from public.notification_preferences where user_id = (pg_temp.prof('a2@example.test')).id), 1::bigint, 'notification preferences created');
select test.eq((select show_details_on_lock_screen from public.notification_preferences where user_id = (pg_temp.prof('a2@example.test')).id), false, 'lock-screen details are OFF by default');

-- ---- an "admin-looking" account is just a normal user ----------------------
select test.mk('eve'); select test.mk('adminlookalike');
update auth.users set email = 'admin@menewoa.com', raw_user_meta_data = '{"role":"admin","is_admin":true}' where id = test.u('adminlookalike');
select test.as_user(test.u('adminlookalike'), '{"app_metadata":{"role":"admin"},"user_metadata":{"role":"admin","admin":true},"email":"admin@menewoa.com"}');
select test.eq(public.is_admin(), false, 'admin@ email + admin metadata + admin JWT claims grant nothing');
select test.eq(public.get_my_admin_status() ->> 'is_admin', 'false', 'status endpoint agrees');
select test.expect_error('select public.admin_overview()', '42501', 'forged admin cannot call admin_overview');
select test.expect_error('select public.admin_list_users()', '42501', 'forged admin cannot list users');
select test.expect_error('select public.admin_read_user_logs(gen_random_uuid(), ''technical_support'', ''a reasonably long reason'')', '42501', 'forged admin cannot read user logs');
select test.expect_error('select public.admin_list_audit_logs()', '42501', 'forged admin cannot read the audit log');

-- ---- direct escalation attempts --------------------------------------------
select test.as_user(test.u('eve'));
select test.expect_error(format('insert into public.admin_users (user_id, admin_role) values (%L, ''owner'')', test.u('eve')), '42501', 'cannot INSERT into admin_users');
select test.expect_error('select * from public.admin_users', '42501', 'cannot read admin_users');
select test.expect_error(format('update public.profiles set role = ''partner'' where id = %L', test.u('eve')), '42501', 'cannot change own role');
select test.expect_error(format('update public.profiles set status = ''active'' where id = %L', test.u('eve')), '42501', 'cannot change own status');
select test.expect_error(format('insert into public.profiles (id, display_name) values (gen_random_uuid(), ''x'')'), '42501', 'cannot create profiles');
select test.expect_error('select * from public.audit_logs', '42501', 'cannot read audit logs');
select test.expect_error('insert into public.audit_logs (action) values (''forged'')', '42501', 'cannot forge audit entries');
select test.expect_error('select public.write_audit(''forged'')', '42501', 'cannot call write_audit');
select test.expect_error(format('select public.recompute_prediction(%L)', test.u('eve')), '42501', 'cannot call recompute_prediction');
select test.expect_error(format('select public.create_notification(%L, ''announcement'')', test.u('eve')), '42501', 'cannot call create_notification');
select test.expect_error('select public.enforce_rate_limit(''x'', 1, interval ''1 hour'')', '42501', 'cannot call enforce_rate_limit directly');
select test.expect_error('select public.prune_expired_data()', '42501', 'cannot call prune_expired_data');
select test.eq(test.affected('update public.app_settings set value = ''false''::jsonb where key = ''feature_partner_sharing'''), 0::bigint, 'normal user cannot change app settings (RLS hides rows)');
select test.as_super();

-- ---- real admins: role scoping ----------------------------------------------
select test.mk('owner1'); select test.mk('support1'); select test.mk('content1'); select test.mk('revoked1'); select test.mk('susp1');
select test.make_admin(test.u('owner1'), 'owner');
select test.make_admin(test.u('support1'), 'support');
select test.make_admin(test.u('content1'), 'content');
select test.make_admin(test.u('revoked1'), 'support');
select test.make_admin(test.u('susp1'), 'support');
update public.admin_users set revoked_at = now() where user_id = test.u('revoked1');
update public.profiles set status = 'suspended' where id = test.u('susp1');

select test.as_user(test.u('owner1'));
select test.eq(public.is_admin(), true, 'owner is admin');
select test.eq(public.is_admin(array['support']::public.admin_role[]), true, 'owner passes support checks');
select test.eq(public.get_my_admin_status() ->> 'role', 'owner', 'status reports owner role');
select test.as_user(test.u('support1'));
select test.eq(public.is_admin(array['support']::public.admin_role[]), true, 'support passes support check');
select test.eq(public.is_admin(array['content']::public.admin_role[]), false, 'support does not pass content check');
select test.eq(public.is_admin(array['owner']::public.admin_role[]), false, 'support does not pass owner check');
select test.as_user(test.u('content1'));
select test.eq(public.is_admin(array['content']::public.admin_role[]), true, 'content passes content check');
select test.eq(public.is_admin(array['support']::public.admin_role[]), false, 'content does not pass support check');
select test.expect_error('select public.admin_list_users()', '42501', 'content admin cannot list users');
select test.expect_error(format('select public.admin_read_user_logs(%L, ''technical_support'', ''a reasonably long reason'')', test.u('eve')), '42501', 'content admin cannot read user logs');
select test.eq(public.admin_overview() ->> 'total_users' is not null, true, 'any admin can open the overview');
select test.as_user(test.u('revoked1'));
select test.eq(public.is_admin(), false, 'revoked admin has no privileges');
select test.as_user(test.u('susp1'));
select test.eq(public.is_admin(), false, 'suspended admin has no privileges');

-- ---- MFA enforcement (opt-in setting) ---------------------------------------
select test.as_super();
update public.app_settings set value = 'true' where key = 'require_admin_mfa';
select test.as_user(test.u('owner1'));
select test.eq(public.is_admin(), false, 'with MFA required, an aal1 session is NOT admin');
select test.expect_error('select public.admin_overview()', '42501', 'with MFA required, aal1 cannot use admin functions');
select test.eq((public.get_my_admin_status() ->> 'mfa_required'), 'true', 'status tells the UI that MFA is needed');
select test.as_user(test.u('owner1'), '{"aal":"aal2"}');
select test.eq(public.is_admin(), true, 'with MFA required, an aal2 session IS admin');
select test.as_super();
update public.app_settings set value = 'false' where key = 'require_admin_mfa';

-- ---- content / settings writes need the right admin role --------------------
select test.as_user(test.u('eve'));
select test.expect_error('insert into public.articles (slug, title, category, body, published) values (''hello-world'', ''Hello'', ''pms'', ''x'', true)', '42501', 'normal user cannot create articles');
select test.expect_error('insert into public.faqs (question, answer) values (''Q?? ok'', ''A'')', '42501', 'normal user cannot create FAQs');
select test.expect_error('insert into public.announcements (title, body, published_at) values (''Hey'', ''x'', now())', '42501', 'normal user cannot create announcements');
select test.as_user(test.u('support1'));
select test.expect_error('insert into public.articles (slug, title, category, body, published) values (''hello-world'', ''Hello'', ''pms'', ''x'', true)', '42501', 'support admin cannot create articles (needs content role)');
select test.as_user(test.u('content1'));
select test.expect_ok('insert into public.articles (slug, title, category, body, published) values (''hello-world'', ''Hello'', ''pms'', ''x'', true)', 'content admin can create articles');
select test.eq(test.affected('update public.app_settings set value = ''false''::jsonb where key = ''feature_insights'''), 0::bigint, 'content admin cannot change app settings');
select test.as_user(test.u('owner1'));
select test.eq(test.affected('update public.app_settings set value = ''false''::jsonb where key = ''feature_insights'''), 1::bigint, 'owner can change app settings');
select test.as_super();
select test.ok(exists (select 1 from public.audit_logs where action = 'articles_insert'), 'article creation was audited');
select test.ok(exists (select 1 from public.audit_logs where action = 'app_settings_update'), 'settings change was audited');
