// Builds tests/parity/scenarios.json from the JavaScript predictor (src/lib/cycle.js).
// The SQL suite (supabase/tests/90_prediction_parity.sql) loads the same file and checks that
// public.recompute_prediction produces identical numbers, so the two can never drift apart.
//   node tests/parity/generate.mjs          # rewrite the file
//   node tests/parity/generate.mjs --check  # exit 1 if the file is stale
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { predictCycle } from "../../src/lib/cycle.js";

const regular = (start, gap, n) => Array.from({ length: n }, (_, i) => {
  const d = new Date(Date.UTC(+start.slice(0, 4), +start.slice(5, 7) - 1, +start.slice(8, 10) + gap * i));
  return d.toISOString().slice(0, 10);
});

const scenarios = [
  { name: "single period uses the user's setting", defaultCycleLength: 28, starts: ["2025-03-02"] },
  { name: "single period, 33-day setting", defaultCycleLength: 33, starts: ["2025-03-02"] },
  { name: "two periods = one gap = not enough, falls back", defaultCycleLength: 30, starts: ["2025-01-10", "2025-02-04"] },
  { name: "three regular 28-day cycles", defaultCycleLength: 30, starts: regular("2025-01-01", 28, 4) },
  { name: "irregular cycles", defaultCycleLength: 28, starts: ["2025-01-03", "2025-02-02", "2025-03-09", "2025-04-02", "2025-05-06"] },
  { name: "implausible gap (70 days) is ignored", defaultCycleLength: 28, starts: ["2025-01-01", "2025-03-12", "2025-04-09", "2025-05-08"] },
  { name: "too-short gap (10 days) is ignored", defaultCycleLength: 29, starts: ["2025-01-01", "2025-01-11", "2025-02-09", "2025-03-10"] },
  { name: "only the last 7 periods count", defaultCycleLength: 28, starts: [...regular("2024-01-01", 40, 3), ...regular("2024-06-10", 26, 8)] },
  { name: "month and year boundary + leap day", defaultCycleLength: 28, starts: ["2023-12-20", "2024-01-17", "2024-02-14", "2024-03-13"] },
  { name: "unsorted input", defaultCycleLength: 28, starts: ["2025-03-01", "2025-01-01", "2025-02-01"] },
];

const out = scenarios.map((s) => {
  const p = predictCycle(s.starts, s.defaultCycleLength);
  return {
    ...s,
    expected: {
      based_on_period_start: p.basedOnPeriodStart,
      cycle_length_used: p.cycleLengthUsed,
      cycles_used: p.cyclesUsed,
      variability_days: p.variabilityDays,
      next_period_start: p.nextPeriodStart,
      ovulation_date: p.ovulationDate,
      fertile_start: p.fertileStart,
      fertile_end: p.fertileEnd,
    },
  };
});

const file = fileURLToPath(new URL("./scenarios.json", import.meta.url));
const text = JSON.stringify(out, null, 1) + "\n";
if (process.argv.includes("--check")) {
  const same = readFileSync(file, "utf8") === text;
  console.log(same ? "scenarios.json is up to date" : "scenarios.json is STALE - run: node tests/parity/generate.mjs");
  process.exit(same ? 0 : 1);
}
writeFileSync(file, text);
console.log(`wrote ${out.length} scenarios`);
