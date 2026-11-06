// Timezone-safe calendar-date helpers.
//
// A "date" in Menewoa is a calendar day with no time-of-day: the ISO string "YYYY-MM-DD".
// `new Date("2026-03-01")` is parsed as UTC midnight, which displays as Feb 28 in the
// Americas — a classic off-by-one. Everything here goes through integer day numbers or
// local-time Date objects at noon (so DST shifts can never move the day).

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isISODate(s) {
  if (typeof s !== "string") return false;
  const m = ISO_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Local Date (noon) for an ISO day string, or a copy of a Date, or `new Date(x)` otherwise. */
export function asLocalDate(x) {
  if (x instanceof Date) return new Date(x.getFullYear(), x.getMonth(), x.getDate(), 12);
  if (typeof x === "string") {
    const m = ISO_RE.exec(x);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  }
  const d = new Date(x);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
}

/** ISO day string from a Date (local calendar day) or ISO string. */
export function toISO(x) {
  const d = asLocalDate(x);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Integer day number (days since 1970-01-01) of a calendar day; DST-proof. */
export function dayNumber(x) {
  const d = asLocalDate(x);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

export function addDays(x, n) {
  const d = asLocalDate(x);
  d.setDate(d.getDate() + n);
  return d;
}

export function addDaysISO(x, n) {
  return toISO(addDays(x, n));
}

/** Whole days from a to b (positive when b is after a). */
export function daysBetween(a, b) {
  return dayNumber(b) - dayNumber(a);
}

export function isSameDay(a, b) {
  return dayNumber(a) === dayNumber(b);
}

/** "Today" as an ISO day. With a time zone, the calendar day in THAT zone. */
export function todayISO(timeZone, now = new Date()) {
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      }).formatToParts(now);
      const get = (t) => parts.find((p) => p.type === t).value;
      return `${get("year")}-${get("month")}-${get("day")}`;
    } catch {
      /* unknown zone: fall through to device-local */
    }
  }
  return toISO(now);
}

export function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export const fmt = (d) => asLocalDate(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
export const fmtLong = (d) =>
  asLocalDate(d).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
