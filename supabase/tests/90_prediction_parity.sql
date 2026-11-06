-- SQL <-> JavaScript prediction parity. tests/parity/scenarios.json is generated from
-- src/lib/cycle.js; here the database must reproduce every number exactly.
-- (The harness runs from the project root, so the relative path below resolves.)
set local timezone = 'UTC';
\set scen `cat tests/parity/scenarios.json`
-- psql variables are not expanded inside $$ bodies, so pass the file through a transaction-local setting.
select set_config('test.scen', :'scen', true);

do $$
declare
  s        jsonb;
  d        text;
  v_uid    uuid;
  v_n      integer := 0;
  p        public.cycle_predictions%rowtype;
  e        jsonb;
  v_cl     integer;
  v_var    numeric;
begin
  for s in select * from jsonb_array_elements(current_setting('test.scen')::jsonb) loop
    v_n := v_n + 1;
    v_uid := test.make_user(format('parity%s@example.com', v_n), null, 'Parity');
    update public.cycle_settings set cycle_length = (s->>'defaultCycleLength')::int where user_id = v_uid;
    for d in select jsonb_array_elements_text(s->'starts') loop
      insert into public.period_entries (user_id, start_date) values (v_uid, d::date);
    end loop;

    select * into p from public.cycle_predictions where user_id = v_uid;
    e := s->'expected';
    perform test.eq(p.based_on_period_start::text, e->>'based_on_period_start', s->>'name' || ': based_on');
    perform test.eq(p.cycle_length_used::int, (e->>'cycle_length_used')::int, s->>'name' || ': cycle length used');
    perform test.eq(p.cycles_used::int, (e->>'cycles_used')::int, s->>'name' || ': cycles used');
    perform test.eq(p.next_period_start::text, e->>'next_period_start', s->>'name' || ': next period');
    perform test.eq(p.ovulation_date::text, e->>'ovulation_date', s->>'name' || ': ovulation');
    perform test.eq(p.fertile_start::text, e->>'fertile_start', s->>'name' || ': fertile start');
    perform test.eq(p.fertile_end::text, e->>'fertile_end', s->>'name' || ': fertile end');
    perform test.ok(p.variability_days is not distinct from nullif(e->>'variability_days', '')::numeric, s->>'name' || ': variability');
  end loop;
  perform test.ok(v_n >= 10, 'parity ran every scenario');
end $$;
