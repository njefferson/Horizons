// The calendar file — T1, and the only tier that actually reminds you
// (build-plan item 30, [ADR-0007](../docs/adr/0007-notification-tiers.md)).
//
// Everything built so far only brings something back WHILE THE APP IS OPEN, and
// the thesis says the return "is not a feature — it is the structural property
// the whole schema exists to guarantee". Depending on the user to remember to
// look is depending on exactly the capacity this app compensates for.
//
// So the job is handed to the OS calendar, which already has notification
// permission, already runs when this app does not, and works on every platform
// including iOS in the EU — with **no server**, which is part of what this app
// is. Unglamorous, and the only mechanism that works everywhere.
//
// PURE. `now` and `zone` are arguments, like every other projection here.
//
// HONESTY, required by ADR-0007: a `.ics` is a POINT-IN-TIME SNAPSHOT. If a
// clock changes in the app the exported calendar is stale, and the app must say
// so rather than implying the calendar is live. Both the calendar name and every
// event description carry the moment they were made.

import type { NodeState, State } from './fold.ts';
import { heldGroups } from './held.ts';
import { localDayKey, isValidIso } from './time.ts';

/**
 * What the calendar leaves OUT: completed work, Menu items (demand-free by law
 * 6) and anything still in triage. Everything else goes in, and this list is the
 * only place that is decided, so the calendar and the held list cannot disagree.
 *
 * **It is an exclusion, and it must stay one.** It was an allowlist of
 * `ready`/`soon`/`later`, and adding the `replan` group in 0.9.0 therefore
 * dropped every passed hard date out of the calendar silently — the single thing
 * a reminder is most for, gone, with all eight gates green (audit; the smoke
 * check compares the file against the surface's own promised count, so both
 * moved together and neither noticed).
 *
 * The two directions of failure are not symmetric. An allowlist that forgets a
 * new group loses someone's reminders without a word; an exclusion that forgets
 * one sends a reminder that should not have gone. In an app whose promise is
 * that nothing is lost, the second is the failure to prefer.
 */
const NOT_IN_CALENDAR = new Set(['done', 'menu', 'unsorted']);
const inCalendar = (key: string): boolean => !NOT_IN_CALENDAR.has(key);

/** The hour an all-day reminder speaks up, in the reader's own local time.
 *  A clock is an end-of-local-day instant; a timed event would fire every
 *  reminder at 23:59, which is nobody's idea of a reminder. */
const ALARM_AT_HOUR = 9;

/**
 * RFC 5545 §3.3.11 text escaping. Backslash first, or it escapes its own
 * escapes. Captured text is stored verbatim and reaches here unfiltered — the
 * share target composes title/text/url with NEWLINES, and a bare newline in a
 * property value terminates the property and corrupts the file.
 */
const esc = (s: string): string => s
  // Strip every control character EXCEPT the line breaks, which are handled
  // below. §3.1's VALUE-CHAR admits WSP, %x21-7E and non-ASCII and nothing else,
  // so a form feed or an ANSI escape pasted out of a PDF or a terminal produced a
  // file no strict parser would accept. `cleanTitle` guards the rename path, but
  // capture assigns the raw text straight to the title, so this is the only place
  // that catches it (audit).
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  .replace(/\\/g, '\\\\')
  .replace(/;/g, '\\;')
  .replace(/,/g, '\\,')
  .replace(/\r\n|\r|\n/g, '\\n');

/**
 * RFC 5545 §3.1 line folding: no line over 75 OCTETS, continuations begin with a
 * single space.
 *
 * Octets, not characters — the limit is on the encoded length, and a title can
 * hold anything a person can type. Folding is done on a code-POINT boundary so a
 * multi-byte character is never split down the middle, which would produce
 * invalid UTF-8 rather than merely a long line.
 */
function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  let curBytes = 0;
  let first = true;
  // Iterating the string yields whole code points, so surrogate pairs stay whole.
  for (const ch of line) {
    const size = enc.encode(ch).length;
    // A continuation line's leading space counts toward its own 75.
    const limit = first ? 75 : 74;
    if (curBytes + size > limit) {
      out.push(first ? cur : ` ${cur}`);
      first = false;
      cur = '';
      curBytes = 0;
    }
    cur += ch;
    curBytes += size;
  }
  if (cur) out.push(first ? cur : ` ${cur}`);
  return out.join('\r\n');
}

/** `YYYYMMDD` for an all-day DATE value, resolved in the reader's zone. */
const dateValue = (iso: string, zone: string): string => localDayKey(iso, zone).replace(/-/g, '');

/** `YYYYMMDDTHHMMSSZ` — used only for DTSTAMP, which is a UTC instant by spec. */
const stampValue = (iso: string): string =>
  new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/**
 * Clock kinds a CALENDAR may carry, and the axis is **did the reader choose this
 * day** — not "is it a hard deadline".
 *
 * In: `due` (somebody picked a date, or said "today"), `start`, `suspense` (the day
 * this must move to still land), and `park` — a park is a return date the held list
 * already shows as "parked until…", so leaving it out made the app contradict
 * something plainly on screen. That was settled by an earlier audit and is not
 * reopened here.
 *
 * Out: **`review`, and that exclusion is the whole point of this constant.** A
 * review clock is the app's own resurfacing marker — "bring this back to me on a
 * surface" — and it is what routing, repeats, bother handling, the comms sweep,
 * replan's escalate and renegotiate, and every gate cure set by default. Nobody
 * ever typed one.
 *
 * Exporting them turned "show me this again tomorrow" into "this is due tomorrow",
 * with a nine o'clock alarm, once per item. Noah routed nine things to Next action
 * in one afternoon and his calendar offered him nine all-day events on a single day,
 * none of which he had ever given a date to. **A planner that misreports your
 * obligations to a calendar you trust is worse than one with no calendar export at
 * all**: the app can be wrong on its own screen and be corrected by the next
 * glance, but it cannot follow the mistake back out of your diary.
 */
export const CALENDAR_KINDS: ReadonlySet<string> = new Set(['due', 'start', 'suspense', 'park']);

/** The soonest clock a calendar may carry. NOT `soonestClock`, which answers a
 *  different question — `held.ts` groups on any clock, because the app genuinely
 *  should resurface a review-clocked item. Only the export is narrower. */
const soonestAt = (n: NodeState, zone: string, nowIso: string): string | null => {
  void zone; void nowIso;
  let best: { at: string; ms: number } | null = null;
  for (const c of Object.values(n.clocks)) {
    if (!c || !isValidIso(c.at)) continue;
    if (!CALENDAR_KINDS.has(c.kind)) continue;
    const ms = Date.parse(c.at);
    if (best === null || ms < best.ms) best = { at: c.at, ms };
  }
  return best?.at ?? null;
};

export interface CalendarOptions {
  /** Overridable so tests do not depend on the wall clock. */
  alarmHour?: number;
}

/**
 * The whole calendar, as RFC 5545 text with CRLF line endings.
 *
 * One all-day VEVENT per item that will come back, each carrying a VALARM — the
 * VALARM is the entire point; an event without one is a diary entry, not a
 * reminder.
 */
export function toCalendar(
  state: State,
  nowIso: string,
  zone: string,
  opts: CalendarOptions = {},
): string {
  // A whole hour in 0..23, or the default. `PT-1H` and `PT9.5H` are both
  // malformed DURATIONs (3.3.6 puts the sign before the P), and this is a
  // parameter, so it is validated rather than trusted.
  const asked = opts.alarmHour ?? ALARM_AT_HOUR;
  const hour = Number.isSafeInteger(asked) && asked >= 0 && asked <= 23 ? asked : ALARM_AT_HOUR;
  const madeOn = isValidIso(nowIso) ? localDayKey(nowIso, zone) : 'an earlier day';
  const stamp = isValidIso(nowIso) ? stampValue(nowIso) : '19700101T000000Z';

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    // Identifies the writer, per §3.7.3. Not a version claim about the app.
    'PRODID:-//Quietkeep//Quietkeep//EN',
    'CALSCALE:GREGORIAN',
    // Says WHEN, because this file is a snapshot and will not update itself.
    `X-WR-CALNAME:${esc(`Quietkeep — as of ${madeOn}`)}`,
    // No METHOD. It would promote this from a plain iCalendar object into an
    // iTIP message, and RFC 5546 3.2.1 then REQUIRES an ORGANIZER on every
    // VEVENT - which a personal, serverless export has no business inventing.
    // Strict importers reject the mismatch (audit).
  ];

  for (const group of heldGroups(state, nowIso, zone)) {
    if (!inCalendar(group.key)) continue;
    for (const n of group.items) {
      const at = soonestAt(n, zone, nowIso);
      // No real clock, nothing to put in a calendar. Skipping rather than
      // throwing is deliberate: one malformed stored date must not take the
      // whole export down (the audit's crash class).
      if (!at) continue;

      lines.push('BEGIN:VEVENT');
      // Stable per node, so re-importing UPDATES the event rather than adding a
      // second copy — the failure that makes calendar exports unusable.
      lines.push(`UID:${esc(n.id)}@quietkeep`);
      lines.push(`DTSTAMP:${stamp}`);
      // All-day, so no VTIMEZONE is needed anywhere in this file: a DATE value
      // has no offset to get wrong.
      // Never dated in the past. Passed clocks genuinely reach here — a soft
      // clock that went by sits in `ready` (`days <= 0`), and a passed HARD date
      // now arrives via the `replan` group — and those are exactly the items this
      // feature exists to remind about, so sending one with an elapsed alarm
      // would reliably remind nobody about precisely the work that needs it.
      const day = dateValue(at, zone);
      const today = dateValue(nowIso, zone);
      lines.push(`DTSTART;VALUE=DATE:${day < today ? today : day}`);
      lines.push(`SUMMARY:${esc(n.title || '(untitled)')}`);
      lines.push(`DESCRIPTION:${esc(
        `From Quietkeep, as it stood on ${madeOn}. This is a snapshot — if you change ` +
        `this in Quietkeep, the calendar will not follow.`)}`);
      // A repeat becomes a real recurrence, so the calendar keeps asking on its
      // own rather than needing a fresh export every cycle.
      // 3.3.10 wants a positive INTEGER. `Math.round` alone yielded `INTERVAL=0`
      // for any cadence under half a day and exponential notation above 1e21 -
      // both malformed, and nothing validates intervalDays on the way in (audit).
      const iv = Math.round(Number(n.intervalDays));
      if (Number.isSafeInteger(iv) && iv > 0) {
        lines.push(`RRULE:FREQ=DAILY;INTERVAL=${iv}`);
      }
      lines.push('BEGIN:VALARM');
      lines.push('ACTION:DISPLAY');
      lines.push(`DESCRIPTION:${esc(n.title || '(untitled)')}`);
      // Relative to the start of an all-day event, which the calendar resolves
      // in the reader's own local time — so this is 9am where they are, without
      // this file having to name a zone at all.
      lines.push(`TRIGGER;RELATED=START:PT${hour}H`);
      lines.push('END:VALARM');
      lines.push('END:VEVENT');
    }
  }

  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** How many events the file will carry — so the surface can say plainly what it
 *  is about to hand over, rather than delivering a mystery. */
export function calendarCount(state: State, nowIso: string, zone: string): number {
  let n = 0;
  for (const group of heldGroups(state, nowIso, zone)) {
    if (!inCalendar(group.key)) continue;
    for (const item of group.items) if (soonestAt(item, zone, nowIso)) n++;
  }
  return n;
}
