-- Reference content from supabase/seed.sql (applied twice by the harness).
select test.as_user(test.mk('seedreader'));
select test.expect_rows('select 1 from public.articles', 6, 'seed articles visible to a signed-in user, no duplicates after a re-run');
select test.expect_rows('select 1 from public.faqs', 3, 'seed FAQs present once each');
select test.ok(not exists (select 1 from public.articles where body ~* '(guarantee|prevent pregnancy|safe days)' and body !~* '(not|never|cannot)'), 'seed articles make no contraception or pregnancy claims');
select test.ok(exists (select 1 from public.articles where slug = 'tracking-and-contraception' and body like '%not a form of contraception%'), 'contraception disclaimer present');
