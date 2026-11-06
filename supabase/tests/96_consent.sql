-- Consent record: sign-up metadata, the in-app gate function, and who may write the columns.
-- Users are created through the same auth.users trigger the real sign-up uses.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'consent-w@example.test', '{"role":"woman","display_name":"W","terms_version":"2026-11-06","health_consent":"true"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'consent-p@example.test', '{"role":"partner","display_name":"P","terms_version":"2026-11-06","health_consent":"true"}'),
  ('00000000-0000-0000-0000-0000000000a3', 'consent-bad@example.test', '{"role":"woman","display_name":"B","terms_version":"yesterday; drop table","health_consent":"true","terms_accepted_at":"2001-01-01"}'),
  ('00000000-0000-0000-0000-0000000000a4', 'consent-none@example.test', '{"role":"woman","display_name":"N"}');

select test.ok((select terms_accepted_at is not null and terms_version = '2026-11-06' and health_consent_at is not null from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'),
               'sign-up with consent metadata records terms + health consent');
select test.ok((select terms_accepted_at is not null and health_consent_at is null from public.profiles where id = '00000000-0000-0000-0000-0000000000a2'),
               'a partner records terms only: they log no health data, so there is no health consent');
select test.ok((select terms_version is null and terms_accepted_at is null and health_consent_at is null from public.profiles where id = '00000000-0000-0000-0000-0000000000a3'),
               'a malformed version records nothing, and a client-supplied timestamp is ignored');
select test.ok((select terms_accepted_at is null and health_consent_at is null from public.profiles where id = '00000000-0000-0000-0000-0000000000a4'),
               'sign-up without consent metadata (direct API use) records nothing');
select test.ok((select terms_accepted_at > now() - interval '1 minute' from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'),
               'the timestamp is the database''s clock');

-- Clients cannot write the consent columns directly.
select test.ok(not has_column_privilege('authenticated', 'public.profiles', 'terms_accepted_at', 'update'), 'clients cannot UPDATE terms_accepted_at');
select test.ok(not has_column_privilege('authenticated', 'public.profiles', 'terms_version', 'update'),     'clients cannot UPDATE terms_version');
select test.ok(not has_column_privilege('authenticated', 'public.profiles', 'health_consent_at', 'update'), 'clients cannot UPDATE health_consent_at');
select test.as_user('00000000-0000-0000-0000-0000000000a4');
select test.expect_error($$update public.profiles set terms_accepted_at = now() where id = '00000000-0000-0000-0000-0000000000a4'$$, '42501', 'direct UPDATE of the consent record is refused');

-- record_consent: the gate's path.
select test.expect_error($$select public.record_consent('not-a-date', true)$$, '22023', 'record_consent rejects a malformed version', 'invalid_version');
select test.expect_error($$select public.record_consent(null, true)$$, '22023', 'record_consent rejects a null version');
select public.record_consent('2026-11-06', true);
select test.as_super();
select test.ok((select terms_version = '2026-11-06' and terms_accepted_at is not null and health_consent_at is not null from public.profiles where id = '00000000-0000-0000-0000-0000000000a4'),
               'record_consent stores terms + health consent for a woman');
select test.ok(exists (select 1 from public.audit_logs where action = 'consent_recorded' and target_user_id = '00000000-0000-0000-0000-0000000000a4'
                       and metadata ->> 'terms_version' = '2026-11-06'), 'recording consent is audited (fact only)');

select test.as_user('00000000-0000-0000-0000-0000000000a2');
select public.record_consent('2026-11-06', true);
select test.as_super();
select test.ok((select health_consent_at is null from public.profiles where id = '00000000-0000-0000-0000-0000000000a2'),
               'a partner cannot acquire a health-consent record');

select test.as_anon();
select test.expect_error($$select public.record_consent('2026-11-06', true)$$, '42501', 'anon cannot call record_consent');

-- The user can see their own record, and it is part of the export.
select test.as_user('00000000-0000-0000-0000-0000000000a1');
select test.ok((select terms_version = '2026-11-06' from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 'a user can read their own consent record');
select test.ok(public.export_my_data() -> 'consent' ->> 'terms_version' = '2026-11-06', 'the export includes the consent record');
select test.as_super();
