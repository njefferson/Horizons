// Local calendar time — computed, never guessed.
//
// Everything this app calls "today" is a LOCAL calendar day, not a UTC one. The
// first version used `setUTCHours(23,59,59)` for "end of today" ([V-13]): for a
// user in Denver a thought captured at 20:30 local is already 02:30 UTC the NEXT
// day, so "end of today" landed nearly a full day late, and a card that should
// have read "returns today" read as a date. The audit caught the symptom (a long
// status overflowing the card); this module is the cause, fixed.
//
// PURE. Nothing here reads the clock — `now` and the zone are both arguments,
// for the same reason fold.ts refuses `Date.now()`: a function that reads the
// clock cannot be tested at an arbitrary moment, and grows exactly the timezone
// bug this module exists to remove. The zone is read once at the UI edge
// (`deviceZone()`) and threaded in.
//
// The zone is NEVER stored in the log. A clock's `at` is an absolute instant, so
// it is zone-independent once computed; the zone matters only when computing
// "the end of the day I am in" (write time) and when saying "today" (read time).
// That is also the behaviour a traveller wants: after a flight, "today" means
// today where you are, without rewriting a single stored event.

/** Intl.DateTimeFormat construction is expensive and these are hot in render;
 *  one formatter per zone, built on first use. A pure memo — same in, same out. */
const FORMATTERS = new Map<string, Intl.DateTimeFormat>();
const formatterFor = (tz: string): Intl.DateTimeFormat => {
  let f = FORMATTERS.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    FORMATTERS.set(tz, f);
  }
  return f;
};

export interface LocalParts {
  year: number; month: number; day: number;
  hour: number; minute: number; second: number;
}

/**
 * `Date.UTC` without the legacy two-digit-year trap: `Date.UTC(99, …)` means
 * 1999, so any year below 100 that reached it silently landed nineteen
 * centuries away — a typed "0099-08-04" became a date 27 years in the past and
 * raised an instant replan card about a day nobody chose (audit). Every date
 * built from PARTS in this codebase goes through here; out-of-range parts
 * (day 32, month 13) normalise by rolling over, exactly as `Date.UTC` does.
 */
export const utcMs = (
  year: number, month: number, day: number, hour = 0, minute = 0, second = 0,
): number => {
  const t = new Date(0);
  t.setUTCFullYear(year, month - 1, day);
  t.setUTCHours(hour, minute, second, 0);
  return t.getTime();
};

/**
 * Is this a real instant? `Intl.formatToParts` throws `RangeError: Invalid time
 * value` on an invalid Date, and every projection here feeds it unvalidated
 * payload data — so one malformed `at` in the log (a hand-edited import, a
 * partially corrupt file) threw out of the work surface, which is constructed
 * BEFORE capture's handlers are registered, and killed the whole app with the
 * data intact and unreachable. Capture is the one thing that must always work.
 *
 * Callers that read stored dates must check this first; the gate refuses new
 * events carrying anything else, so this is the belt for data already landed.
 */
export const isValidIso = (iso: unknown): iso is string =>
  typeof iso === 'string' && Number.isFinite(Date.parse(iso));

/** The wall-clock reading a person in `tz` would see at this instant. */
/**
 * Answers already worked out (1.17.1).
 *
 * **This is the read path's single biggest cost, and it was invisible.**
 * `formatToParts` is the expensive part of `Intl` — the formatter beside this
 * is cached precisely because construction is dear, and then every call did the
 * formatting work again. Nine projections walk every node and ask for calendar
 * distances, each of which resolves TWO instants to local days, so a store of
 * 566 things spent 90 ms on one refresh. With this memo: 35 ms. Measured on the
 * 1.16.0 sample set, which is what made the number knowable at all.
 *
 * The worst of it was self-inflicted: `calendarDaysBetween(nowIso, …)` resolves
 * the SAME `nowIso` for every node in every projection, so one render asked the
 * same question thousands of times and paid full price each time.
 *
 * A memo on a pure function — same in, same out — exactly like `FORMATTERS`
 * above, and it inherits that precedent rather than inventing a pattern.
 *
 * **The bound is crude on purpose.** Keys are (zone, instant) pairs, so growth
 * is bounded by the distinct instants a session touches; 20,000 is far past any
 * real store and the clear is a cliff rather than an eviction policy. An LRU
 * would be more elegant and would be a cache to maintain, in a file whose job is
 * to be obviously correct about time. Clearing loses nothing but speed.
 */
const PARTS_CACHE = new Map<string, LocalParts>();
const PARTS_CACHE_MAX = 20_000;

export function localParts(iso: string, tz: string): LocalParts {
  const key = `${tz}|${iso}`;
  const hit = PARTS_CACHE.get(key);
  if (hit) return hit;
  const p: Record<string, string> = {};
  for (const part of formatterFor(tz).formatToParts(new Date(iso))) {
    if (part.type !== 'literal') p[part.type] = part.value;
  }
  const parts: LocalParts = {
    year: Number(p['year']), month: Number(p['month']), day: Number(p['day']),
    // Some ICU builds render midnight as hour 24 under hour12:false.
    hour: Number(p['hour']) % 24,
    minute: Number(p['minute']), second: Number(p['second']),
  };
  // Nothing about invalid input is handled here, and that is not an oversight:
  // `formatToParts` THROWS on one (`RangeError: Invalid time value`) rather than
  // yielding NaN parts, so this line is never reached with a bad instant. The
  // first draft of this memo carried a NaN guard and a paragraph explaining it —
  // both describing behaviour the platform does not have. Callers guard with
  // `isValidIso` before they get here, which is why that has always been the
  // rule rather than a suggestion.
  //
  // FROZEN, because a memo hands the SAME object to every caller and this repo
  // has already paid for aliasing once — the three-place rule in `fold.ts`
  // exists because a shared object mutated in one place changed another. Nothing
  // mutates `LocalParts` today (`endOfLocalDay` reads `p.day + plusDays` and
  // builds a new date), and freezing means a future writer finds out at the
  // write rather than through a date that is wrong somewhere else.
  Object.freeze(parts);
  if (PARTS_CACHE.size >= PARTS_CACHE_MAX) PARTS_CACHE.clear();
  PARTS_CACHE.set(key, parts);
  return parts;
}

/** How far `tz` is from UTC at this instant, in ms (positive = ahead of UTC). */
function offsetMsAt(instantMs: number, tz: string): number {
  const p = localParts(new Date(instantMs).toISOString(), tz);
  const asIfUTC = utcMs(p.year, p.month, p.day, p.hour, p.minute, p.second);
  // Both sides are truncated to the second, so compare at that resolution.
  return asIfUTC - Math.floor(instantMs / 1000) * 1000;
}

/**
 * The absolute instant at which the clock in `tz` reads this wall time.
 *
 * Two passes, because the offset depends on the instant we are solving for: the
 * first guess uses the offset at the naive instant, the second uses the offset
 * at the corrected one, which is the fixed point everywhere except inside a DST
 * transition.
 *
 * **A previous version of this comment claimed transitions "happen between 01:00
 * and 03:00 in every zone that has them", and used that to wave the edge cases
 * away. That is simply false** — an audit enumerated all 15,887 offset
 * transitions in the 418 IANA zones from 1990–2040 and found several that cross
 * 23:59:59, the one wall time this function is actually asked for:
 * `America/Nuuk` and `America/Scoresbysund` shift at local 23:00→00:00,
 * `America/Santiago` and `America/Coyhaique` fall back over midnight, and
 * `Africa/Cairo` transitions at 23:59:59 too. The conclusion survived; the
 * reasoning did not, and a false justification is worse than none because the
 * next reader trusts it.
 *
 * So the cases are handled rather than dismissed:
 *
 * - **Autumn overlap** (the wall time happens twice): resolve to the LATER
 *   instant, by taking the smaller of the offsets either side. The end of a day
 *   is its last second, and picking the earlier one ended the day an hour early,
 *   once a year, in Santiago and Nuuk.
 * - **Spring-forward gap** (the wall time never happens): the fixed point lands
 *   on the far side of the jump, which is the first instant of the following
 *   local time — still inside the day it names, which is what callers rely on.
 */
function instantFromWallTime(p: LocalParts, tz: string): string {
  const naive = utcMs(p.year, p.month, p.day, p.hour, p.minute, p.second);
  let ms = naive - offsetMsAt(naive, tz);
  ms = naive - offsetMsAt(ms, tz);
  // Overlap resolution: if the hour after this instant carries a different
  // offset, the named wall time is ambiguous; the smaller offset is the later
  // instant, which is the one that genuinely ends the day.
  const alt = offsetMsAt(ms + 3_600_000, tz);
  const here = offsetMsAt(ms, tz);
  if (alt !== here) {
    const candidate = naive - Math.min(here, alt);
    // Only accept it if it still reads as the wall time we asked for — in a gap
    // it will not, and the fixed point above is the right answer there.
    const back = localParts(new Date(candidate).toISOString(), tz);
    if (back.hour === p.hour && back.minute === p.minute && back.second === p.second &&
        back.day === p.day && back.month === p.month && back.year === p.year) {
      ms = candidate;
    }
  }
  return new Date(ms).toISOString();
}

/**
 * The last instant of a local calendar day — the day containing `iso`, or
 * `plusDays` after it. This is the app's "comes back by" boundary: a clock at
 * this instant means "this should be back with you before the day is out."
 *
 * `plusDays` counts CALENDAR days, so a DST changeover in between does not shift
 * the answer by an hour the way adding 86_400_000 ms would.
 */
export function endOfLocalDay(iso: string, tz: string, plusDays = 0): string {
  const p = localParts(iso, tz);
  // Normalise through UTC arithmetic on the date parts only — no zone involved,
  // so month/year/leap rollover is the calendar's, not a guess.
  const shifted = new Date(utcMs(p.year, p.month, p.day + plusDays));
  return instantFromWallTime({
    year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate(),
    hour: 23, minute: 59, second: 59,
  }, tz);
}

/** `YYYY-MM-DD` for the local day containing `iso`. Two instants share a local
 *  day exactly when their keys match — which is what "today" actually means. */
export function localDayKey(iso: string, tz: string): string {
  const p = localParts(iso, tz);
  const pad = (n: number): string => String(n).padStart(2, '0');
  // The year is padded too: Intl renders year 99 as "99", and an unpadded key
  // breaks the shape every consumer parses and compares ("0099-08-04").
  return `${String(p.year).padStart(4, '0')}-${pad(p.month)}-${pad(p.day)}`;
}

/**
 * Whole CALENDAR days from one instant's local day to another's — 0 for today,
 * 1 for tomorrow, negative for the past.
 *
 * Not `(b - a) / 86_400_000`: that measures elapsed hours, so at 23:00 a clock
 * two hours away reads as "today" when it is plainly tomorrow, and any DST day
 * is off by an hour. Day keys have no such failure mode.
 */
export function calendarDaysBetween(fromIso: string, toIso: string, tz: string): number {
  const [fy, fm, fd] = localDayKey(fromIso, tz).split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = localDayKey(toIso, tz).split('-').map(Number) as [number, number, number];
  return Math.round((utcMs(ty, tm, td) - utcMs(fy, fm, fd)) / 86_400_000);
}

/** The device's zone, read at the UI edge and threaded inward. Falls back to UTC
 *  only if the platform refuses to name one — which no supported browser does. */
export const deviceZone = (): string =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
