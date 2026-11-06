-- Reference content for a fresh project. Safe to re-run (guarded by slug / question).
-- IMPORTANT: have a qualified health professional review this wording before launch.
-- The text is general information only and deliberately avoids diagnosis or dosing advice.

insert into public.articles (slug, title, category, body, published) values
('understanding-your-cycle-phases', 'Understanding your cycle phases', 'menstrual_cycles',
 'Your cycle moves through four phases — menstrual, follicular, ovulation and luteal — each shaped by different hormones. A "typical" cycle is often described as 28 days, but anywhere from about 21 to 35 days is common, and it can vary month to month for the same person. Menewoa estimates your phases from your own logged history, so the longer you track, the more it reflects your actual pattern rather than a generic average.', true),
('gentle-ways-to-ease-pms', 'Gentle ways to ease PMS', 'pms',
 'PMS refers to physical and emotional symptoms in the days before a period — mood changes, bloating, tenderness, fatigue, cravings. Gentle movement, consistent sleep, and cutting back on salt and caffeine help many people. Tracking your own patterns in Menewoa is often more useful than generic advice, since PMS varies a lot between people. If symptoms are severe enough to disrupt daily life, that''s worth raising with a doctor.', true),
('supporting-your-partner-practically', 'How to support your partner, practically', 'supporting_a_partner',
 'Ask how she''s feeling rather than assuming from a notification. Offer something concrete — tea, a chore taken off her plate, just sitting with her. Expect symptoms and mood to vary from cycle to cycle. And respect what she''s chosen to share; if something feels private, it probably is. The Support tab shows suggestions she has told you help — usually a better guide than general advice.', true),
('whats-normal-and-when-to-see-a-doctor', 'What''s normal, and what''s worth a doctor''s visit', 'period_symptoms',
 'Most period symptoms are common and not a sign of anything wrong. A few patterns are worth mentioning to a doctor: periods that regularly last more than about 7 days, bleeding that soaks through a pad or tampon every hour for several hours, pain that regularly interferes with daily life, a cycle that has suddenly changed a lot, or no period for three months when you are not pregnant or breastfeeding. This is not a diagnosis — it''s a prompt to bring a clear, dated history to an appointment.', true),
('getting-the-most-out-of-tracking', 'Getting the most out of tracking your cycle', 'cycle_tracking',
 'Log period start and end as soon as you notice them — it''s the single most useful data point for your estimates. Pick two or three things to track consistently rather than everything at once. Don''t worry about gaps; Menewoa recalculates from whatever you''ve logged. And revisit your cycle-length setting occasionally if your actual cycles run consistently longer or shorter than what you first entered.', true),
('tracking-and-contraception', 'Cycle tracking and contraception', 'reproductive_health',
 'Menewoa is a tracking and support tool. It is not a form of contraception, it cannot detect or confirm pregnancy, and its estimates should never be relied on alone to prevent or plan a pregnancy. If you are considering contraception, talk with a doctor or reproductive health clinic. Fertility-awareness methods that work reliably involve more than cycle-length estimates and are usually taught by a trained provider.', true)
on conflict (slug) do nothing;

insert into public.faqs (question, answer, sort_order, published)
select q, a, o, true from (values
  ('Who can see my cycle information?', 'Only you — unless you invite a partner and choose what to share. Each item (period dates, expected period, mood, symptoms, fertility estimate, notes, sleep and energy, support tips) is a separate switch, off by default for the sensitive ones. Turning one off or disconnecting takes effect immediately. A small number of Menewoa support staff can open logs only when they record a reason, and every such access is listed under Profile → Privacy.', 10),
  ('How accurate are the predictions?', 'They are estimates based on your own logged periods and are clearly labelled that way. They improve as you log more cycles, but bodies vary and cycles change, so please do not use Menewoa to avoid or plan a pregnancy.', 20),
  ('How do I delete my data?', 'Go to Profile and choose Delete account. You will be asked for your password, and your account and everything you logged is permanently removed. You can also download a copy of your data first from the same page.', 30)
) as t(q, a, o)
where not exists (select 1 from public.faqs f where f.question = t.q);
