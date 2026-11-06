-- Consent-based partner sharing: invitations, redemption, filtered view, revocation, blocking.
set local timezone = 'UTC';
select test.mk('wendy'); select test.mk('wanda');
select test.mk('paul', 'partner'); select test.mk('paula', 'partner'); select test.mk('mal', 'partner');

-- ============================ invitation creation guards ======================
select test.as_user(test.u('wendy'));
select test.expect_error('select public.create_partner_invitation(false, ''{}''::jsonb)', '22023', 'invitation without consent rejected', 'consent_required');
select test.expect_error('select public.create_partner_invitation(null, ''{}''::jsonb)', '22023', 'null consent rejected', 'consent_required');
select test.expect_error('select public.create_partner_invitation(true, ''{"email":true}''::jsonb)', '22023', 'unknown permission key rejected', 'invalid_permissions');
select test.expect_error('select public.create_partner_invitation(true, ''{"mood":"yes"}''::jsonb)', '22023', 'non-boolean permission rejected', 'invalid_permissions');
select test.expect_error('select public.create_partner_invitation(true, ''{"mood":1}''::jsonb)', '22023', 'numeric permission rejected', 'invalid_permissions');
select test.expect_error('select public.create_partner_invitation(true, ''[]''::jsonb)', '22023', 'non-object permissions rejected', 'invalid_permissions');
select test.as_user(test.u('paul'));
select test.expect_error('select public.create_partner_invitation(true, ''{}''::jsonb)', '42501', 'a partner account cannot create invitations');

-- ============================ valid invitation ================================
select test.as_user(test.u('wendy'));
select set_config('t.code', public.create_partner_invitation(true, '{"mood":true,"period_dates":true}'::jsonb) ->> 'code', true);
select test.ok(current_setting('t.code') ~ '^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$', 'code is 10 Crockford-base32 characters, grouped 5-5');
select test.expect_rows('select 1 from public.partner_invitations where status = ''pending''', 1, 'woman sees her pending invitation');
select test.expect_error('select code_hash from public.partner_invitations', '42501', 'woman cannot read the code hash');
select test.expect_error('insert into public.partner_invitations (woman_id, code_hash, expires_at, consent_given_at) values (gen_random_uuid(), ''x'', now(), now())', '42501', 'invitations cannot be inserted directly');
select test.as_super();
select test.eq((select count(*) from public.partner_invitations where code_hash = replace(current_setting('t.code'), '-', '')), 0::bigint, 'plaintext code is not stored');
select test.eq((select char_length(code_hash) from public.partner_invitations where status = 'pending'), 64, 'a SHA-256 hash is stored');
select test.eq((select code_hash from public.partner_invitations where status = 'pending'), public.hash_invite_code(current_setting('t.code')), 'hash matches the issued code');
select test.ok((select expires_at between now() + interval '71 hours' and now() + interval '73 hours' from public.partner_invitations where status = 'pending'), 'invitation expires in ~3 days');
select test.ok((select consent_given_at is not null from public.partner_invitations where status = 'pending'), 'consent timestamp recorded');

-- a second invitation revokes the first
select set_config('t.code_old', current_setting('t.code'), true);
select test.as_user(test.u('wendy'));
select set_config('t.code', public.create_partner_invitation(true, '{"mood":true,"period_dates":true}'::jsonb) ->> 'code', true);
select test.expect_rows('select 1 from public.partner_invitations where status = ''pending''', 1, 'only one pending invitation per woman');
select test.expect_rows('select 1 from public.partner_invitations where status = ''revoked''', 1, 'the previous invitation was revoked');
select test.as_user(test.u('paul'));
select test.eq(public.preview_partner_invitation(current_setting('t.code_old')) ->> 'ok', 'false', 'revoked code no longer works');

-- ============================ preview =========================================
select test.eq(public.preview_partner_invitation(current_setting('t.code')) ->> 'ok', 'true', 'partner can preview a valid code');
select test.eq(public.preview_partner_invitation(lower(replace(current_setting('t.code'), '-', ' '))) ->> 'ok', 'true', 'code entry ignores case, spaces and dashes');
select test.eq(public.preview_partner_invitation(current_setting('t.code')) ->> 'from_name', 'Wendy', 'preview names the inviting woman');
select test.eq(public.preview_partner_invitation(current_setting('t.code')) -> 'permissions' ->> 'mood', 'true', 'preview shows what she offers (mood)');
select test.eq(public.preview_partner_invitation(current_setting('t.code')) -> 'permissions' ->> 'fertility', 'false', 'fertility is not offered by default');
select test.eq(public.preview_partner_invitation(current_setting('t.code')) -> 'permissions' ->> 'private_notes', 'false', 'private notes are not offered by default');
select test.eq(public.preview_partner_invitation('ZZZZZ-ZZZZZ') ->> 'error', 'invalid_or_expired', 'unknown code gives a generic error');
select test.as_user(test.u('wanda'));
select test.eq(public.preview_partner_invitation(current_setting('t.code')) ->> 'ok', 'false', 'a woman account cannot preview/redeem invitations');

-- ============================ brute force =====================================
select test.as_user(test.u('mal'));
select public.preview_partner_invitation('AAAAA-BBBBB') from generate_series(1, 10);
select test.expect_error('select public.preview_partner_invitation(''AAAAA-BBBBC'')', '54000', 'the 11th guess in 15 minutes is rate limited', 'rate_limited');
select test.expect_error(format('select public.redeem_partner_invitation(%L)', current_setting('t.code')), '54000', 'even the CORRECT code is refused once rate limited');
select test.as_super();
select test.eq((select count(*) from public.rate_limit_events where user_id = test.u('mal') and action = 'redeem_invitation'), 10::bigint, 'failed guesses were counted (not rolled back)');

select test.reset_rl();
-- ============================ redeem ==========================================
select test.as_user(test.u('paul'));
select test.eq(public.redeem_partner_invitation(current_setting('t.code')) ->> 'ok', 'true', 'partner redeems a valid code');
select test.eq(public.redeem_partner_invitation(current_setting('t.code')) ->> 'ok', 'false', 'a code is single-use');
select test.as_user(test.u('paula'));
select test.eq(public.redeem_partner_invitation(current_setting('t.code')) ->> 'ok', 'false', 'another partner cannot reuse the code');
select test.as_super();
select test.eq((select count(*) from public.partner_connections where status = 'active'), 1::bigint, 'exactly one active connection');
select test.eq((select status::text from public.partner_invitations where code_hash = public.hash_invite_code(current_setting('t.code'))), 'accepted', 'invitation marked accepted');
select test.ok((select share_mood and share_period_dates and not share_fertility and not share_symptoms and not share_private_notes and not share_other_sensitive and not share_expected_period
                from public.sharing_permissions), 'permissions copied from the invitation; everything else stays OFF');
select set_config('t.conn', (select id::text from public.partner_connections where status = 'active'), true);
select test.ok((select consent_given_at is not null from public.partner_connections where status = 'active'), 'connection carries consent timestamp');
select test.as_user(test.u('wendy'));
select test.eq((select count(*) from public.notifications where kind = 'partner_update'), 1::bigint, 'woman is notified that a partner connected (generic kind only)');
select test.eq(public.get_my_connection() ->> 'status', 'active', 'woman sees an active connection');
select test.eq(public.get_my_connection() ->> 'counterpart_name', 'Paul', 'woman sees partner name');
select test.expect_error('select public.create_partner_invitation(true, ''{}''::jsonb)', '23505', 'cannot invite while connected', 'already_connected');

select test.reset_rl();
-- ============================ the filtered partner view =======================
select test.as_user(test.u('wendy'));
insert into public.period_entries (user_id, start_date, end_date) values (test.u('wendy'), current_date - 20, current_date - 16);
insert into public.mood_entries (user_id, log_date, mood) values
  (test.u('wendy'), current_date - 1, 'sad'), (test.u('wendy'), current_date - 2, 'calm'),
  (test.u('wendy'), current_date - 3, 'tired'), (test.u('wendy'), current_date - 4, 'happy'),
  (test.u('wendy'), current_date - 8, 'anxious');
insert into public.daily_logs (user_id, log_date, sleep_hours, energy_level, note) values (test.u('wendy'), current_date - 1, 5.5, 2, 'my very private note');
select public.set_day_symptoms(current_date - 1, array[1, 6]::smallint[]);
insert into public.support_tips (user_id, tip) values (test.u('wendy'), 'Warm tea helps');

select test.as_user(test.u('paul'));
select test.eq(public.get_partner_view() ->> 'connected', 'true', 'partner view: connected');
select test.eq(public.get_partner_view() ->> 'woman_name', 'Wendy', 'partner view: shows her name');
select test.ok(public.get_partner_view() ? 'period', 'shared: period dates present');
select test.ok(public.get_partner_view() ? 'mood', 'shared: mood present');
select test.eq(jsonb_array_length(public.get_partner_view() -> 'mood'), 3, 'mood is capped at the 3 most recent entries within 7 days (old/extra entries excluded)');
select test.ok(not (public.get_partner_view() ? 'symptoms'), 'NOT shared: symptoms absent');
select test.ok(not (public.get_partner_view() ? 'notes'), 'NOT shared: notes absent');
select test.ok(not (public.get_partner_view() ? 'fertility'), 'NOT shared: fertility absent');
select test.ok(not (public.get_partner_view() ? 'expected'), 'NOT shared: expected period absent');
select test.ok(not (public.get_partner_view() ? 'wellbeing'), 'NOT shared: sleep/energy absent');
select test.ok(not (public.get_partner_view() ? 'support_tips'), 'NOT shared: support tips absent');
select test.eq(position('very private note' in public.get_partner_view()::text), 0, 'private note text appears nowhere in the payload');
select test.eq(position('anxious' in public.get_partner_view()::text), 0, 'mood older than a week is not leaked');

-- a partner has no table-level route around the view
select test.expect_rows('select 1 from public.period_entries', 0, 'partner: no raw period entries');
select test.expect_rows('select 1 from public.mood_entries', 0, 'partner: no raw moods');
select test.expect_rows('select 1 from public.daily_logs', 0, 'partner: no raw daily logs');
select test.expect_rows('select 1 from public.symptom_logs', 0, 'partner: no raw symptoms');
select test.expect_rows('select 1 from public.cycle_predictions', 0, 'partner: no raw predictions');
select test.expect_rows('select 1 from public.support_tips', 0, 'partner: no raw support tips');
select test.expect_rows('select 1 from public.sharing_permissions', 1, 'partner can see WHAT is shared with them');
select test.eq(test.affected(format('update public.sharing_permissions set share_fertility = true, share_private_notes = true where connection_id = %L', current_setting('t.conn'))), 0::bigint, 'partner cannot grant themselves more access');
select test.expect_error(format('update public.partner_connections set status = ''active'' where id = %L', current_setting('t.conn')), '42501', 'partner cannot edit connections');

-- a stranger sees nothing of the relationship
select test.as_user(test.u('wanda'));
select test.expect_rows('select 1 from public.partner_connections', 0, 'third party: no connections visible');
select test.expect_rows('select 1 from public.sharing_permissions', 0, 'third party: no permissions visible');
select test.eq(public.get_partner_view() ->> 'connected', 'false', 'third party: partner view is empty');
select test.eq(public.get_my_connection() ->> 'status', 'none', 'third party: no connection');
select test.eq(test.affected(format('update public.sharing_permissions set share_fertility = true where connection_id = %L', current_setting('t.conn'))), 0::bigint, 'third party cannot edit permissions');
select public.revoke_partner_connection(current_setting('t.conn')::uuid);
select test.as_super();
select test.eq((select status::text from public.partner_connections where id = current_setting('t.conn')::uuid), 'active', 'a stranger cannot revoke someone else''s connection');

-- ============================ changing permissions is immediate ===============
select test.as_user(test.u('wendy'));
select test.eq(test.affected(format('update public.sharing_permissions set share_fertility = true, share_symptoms = true, share_private_notes = true, share_other_sensitive = true, share_expected_period = true, share_support_tips = true where connection_id = %L', current_setting('t.conn'))), 1::bigint, 'woman can widen her sharing');
select test.as_user(test.u('paul'));
select test.ok(public.get_partner_view() ? 'fertility' and public.get_partner_view() ? 'expected' and public.get_partner_view() ? 'symptoms'
               and public.get_partner_view() ? 'notes' and public.get_partner_view() ? 'wellbeing' and public.get_partner_view() ? 'support_tips', 'newly shared sections appear');
select test.eq(public.get_partner_view() -> 'fertility' ->> 'ovulation_date', (select (current_date - 20 + 28 - 14)::text), 'fertility block carries the server estimate');
select test.eq(jsonb_array_length(public.get_partner_view() -> 'symptoms'), 2, 'symptoms shared');
select test.eq(public.get_partner_view() -> 'notes' -> 0 ->> 'note', 'my very private note', 'notes shared once she opts in');
select test.as_user(test.u('wendy'));
select test.eq(test.affected(format('update public.sharing_permissions set share_fertility = false, share_symptoms = false, share_private_notes = false, share_other_sensitive = false, share_expected_period = false, share_support_tips = false where connection_id = %L', current_setting('t.conn'))), 1::bigint, 'woman can narrow her sharing');
select test.as_user(test.u('paul'));
select test.ok(not (public.get_partner_view() ? 'fertility') and not (public.get_partner_view() ? 'notes') and not (public.get_partner_view() ? 'symptoms'), 'withdrawn sections vanish on the very next call');

select test.reset_rl();
-- ============================ revocation ======================================
select test.as_user(test.u('wendy'));
select public.revoke_partner_connection(current_setting('t.conn')::uuid);
select test.as_user(test.u('paul'));
select test.eq(public.get_partner_view() ->> 'connected', 'false', 'after revoke: partner view is empty immediately');
select test.eq(public.get_my_connection() ->> 'status', 'none', 'after revoke: partner has no connection');
select test.expect_rows('select 1 from public.sharing_permissions', 0, 'after revoke: partner cannot see permissions');
select test.eq((select count(*) from public.notifications where kind = 'partner_update'), 1::bigint, 'partner is told the connection ended (generic kind only)');
select test.as_super();
select test.eq((select status::text from public.partner_connections where id = current_setting('t.conn')::uuid), 'revoked', 'connection is marked revoked');
select test.eq((select revoked_by from public.partner_connections where id = current_setting('t.conn')::uuid), test.u('wendy'), 'revoker recorded');
select test.ok((select not (share_mood or share_period_dates) from public.sharing_permissions where connection_id = current_setting('t.conn')::uuid), 'permissions zeroed on revoke');
select test.as_user(test.u('wendy'));
select test.eq(test.affected(format('update public.sharing_permissions set share_mood = true where connection_id = %L', current_setting('t.conn'))), 0::bigint, 'permissions of a revoked connection cannot be re-enabled');

-- a NEW consent is required to reconnect; old grants do not resurrect
select set_config('t.code', public.create_partner_invitation(true, '{"expected_period":true}'::jsonb) ->> 'code', true);
select test.as_user(test.u('paul'));
select test.eq(public.redeem_partner_invitation(current_setting('t.code')) ->> 'ok', 'true', 'reconnect with a fresh invitation');
select test.ok(public.get_partner_view() ? 'expected' and not (public.get_partner_view() ? 'mood') and not (public.get_partner_view() ? 'period'), 'reconnect starts from the NEW permissions only');
select set_config('t.conn2', public.get_my_connection() ->> 'connection_id', true);

-- partner can end it too
select public.revoke_partner_connection(current_setting('t.conn2')::uuid);
select test.eq(public.get_partner_view() ->> 'connected', 'false', 'partner can disconnect themselves');
select test.as_user(test.u('wendy'));
select test.eq(public.get_my_connection() ->> 'status', 'none', 'woman sees it ended');

select test.reset_rl();
-- ============================ blocking ========================================
select set_config('t.code', public.create_partner_invitation(true, '{"mood":true}'::jsonb) ->> 'code', true);
select test.as_user(test.u('paul'));
select public.redeem_partner_invitation(current_setting('t.code'));
select set_config('t.conn3', public.get_my_connection() ->> 'connection_id', true);
select test.as_user(test.u('wendy'));
select public.block_connection_counterpart(current_setting('t.conn3')::uuid);
select test.eq(public.get_my_connection() ->> 'status', 'none', 'after block: no connection');
select test.expect_rows('select 1 from public.blocked_users', 1, 'woman sees her block list');
select set_config('t.code', public.create_partner_invitation(true, '{"mood":true}'::jsonb) ->> 'code', true);
select test.as_user(test.u('paul'));
select test.eq(public.get_partner_view() ->> 'connected', 'false', 'blocked partner sees nothing');
select test.eq(public.preview_partner_invitation(current_setting('t.code')) ->> 'ok', 'false', 'blocked partner cannot preview her new invitation');
select test.eq(public.redeem_partner_invitation(current_setting('t.code')) ->> 'ok', 'false', 'blocked partner cannot redeem her new invitation');
select test.expect_rows('select 1 from public.blocked_users', 0, 'the blocked person cannot see that they are blocked');
select test.eq(test.affected('delete from public.blocked_users'), 0::bigint, 'the blocked person cannot remove the block');
select test.as_user(test.u('wendy'));
select test.eq(test.affected(format('delete from public.blocked_users where blocked_id = %L', test.u('paul'))), 1::bigint, 'she can unblock');
select test.as_user(test.u('paul'));
select test.eq(public.preview_partner_invitation(current_setting('t.code')) ->> 'ok', 'true', 'after unblock the code works again');

select test.reset_rl();
-- ============================ expiry & invitation revocation ==================
select test.as_super();
update public.partner_invitations set expires_at = now() - interval '1 minute' where status = 'pending';
select test.as_user(test.u('paul'));
select test.eq(public.preview_partner_invitation(current_setting('t.code')) ->> 'ok', 'false', 'expired code: preview fails');
select test.eq(public.redeem_partner_invitation(current_setting('t.code')) ->> 'ok', 'false', 'expired code: redeem fails');
select test.as_user(test.u('wendy'));
select test.expect_rows('select 1 from public.partner_invitations where status = ''pending'' and expires_at > now()', 0, 'no live invitation remains');
select set_config('t.code', public.create_partner_invitation(true, '{}'::jsonb) ->> 'code', true);
select public.revoke_partner_invitation();
select test.as_user(test.u('paul'));
select test.eq(public.preview_partner_invitation(current_setting('t.code')) ->> 'ok', 'false', 'revoked invitation cannot be redeemed');

select test.reset_rl();
-- ============================ one connection each =============================
select test.as_user(test.u('wendy'));
select set_config('t.code', public.create_partner_invitation(true, '{}'::jsonb) ->> 'code', true);
select test.as_user(test.u('paul'));
select public.redeem_partner_invitation(current_setting('t.code'));
select test.as_user(test.u('wanda'));
select set_config('t.code2', public.create_partner_invitation(true, '{}'::jsonb) ->> 'code', true);
select test.as_user(test.u('paul'));
select test.eq(public.redeem_partner_invitation(current_setting('t.code2')) ->> 'error', 'already_connected', 'a partner already connected cannot take a second connection');

-- ============================ suspension cuts sharing =========================
select test.as_super();
update public.profiles set status = 'suspended' where id = test.u('wendy');
select test.as_user(test.u('paul'));
select test.eq(public.get_partner_view() ->> 'connected', 'false', 'suspended woman: partner view goes dark');
select test.as_super();
update public.profiles set status = 'active' where id = test.u('wendy');
update public.profiles set status = 'suspended' where id = test.u('paul');
select test.as_user(test.u('paul'));
select test.eq(public.get_partner_view() ->> 'connected', 'false', 'suspended partner gets nothing');
select test.expect_error('select public.redeem_partner_invitation(''AAAAA-AAAAA'')', '28000', 'suspended partner cannot call redeem');
