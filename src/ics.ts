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

/** The groups that represent work that will come back. Completed items, Menu
 *  items (demand-free by law 6) and anything still in triage are deliberately
 *  absent — and this list is the ONLY place that is decided, so the calendar and
 *  the held list cannot come to disagree. */
const IN_CALENDAR = new Set(['ready', 'soon', 'later']);

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

/** The soonest demanding clock — the same question `held.ts` groups on. `park`
 *  is excluded: a parked thing is being held away from you on purpose. */
function soonestAt(n: NodeState): string | null {
  let best: string | null = null;
  for (const c of Object.values(n.clocks)) {
    if (!c || c.kind === 'park' || !isValidIso(c.at)) continue;
    if (best === null || c.at < best) best = c.at;
  }
  return best;
}

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
  const hour = opts.alarmHour ?? ALARM_AT_HOUR;
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
    'METHOD:PUBLISH',
  ];

  for (const group of heldGroups(state, nowIso, zone)) {
    if (!IN_CALENDAR.has(group.key)) continue;
    for (const n of group.items) {
      const at = soonestAt(n);
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
      lines.push(`DTSTART;VALUE=DATE:${dateValue(at, zone)}`);
      lines.push(`SUMMARY:${esc(n.title || '(untitled)')}`);
      lines.push(`DESCRIPTION:${esc(
        `From Quietkeep, as it stood on ${madeOn}. This is a snapshot — if you change ` +
        `this in Quietkeep, the calendar will not follow.`)}`);
      // A repeat becomes a real recurrence, so the calendar keeps asking on its
      // own rather than needing a fresh export every cycle.
      if (n.intervalDays != null && Number.isFinite(n.intervalDays) && n.intervalDays > 0) {
        lines.push(`RRULE:FREQ=DAILY;INTERVAL=${Math.round(n.intervalDays)}`);
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
    if (!IN_CALENDAR.has(group.key)) continue;
    for (const item of group.items) if (soonestAt(item)) n++;
  }
  return n;
}
