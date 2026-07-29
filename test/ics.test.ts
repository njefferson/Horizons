// T1 — the calendar file that actually reminds you (build-plan item 30).
//
// Every case is pinned to a NON-UTC zone, which build-plan item 30 requires in
// so many words: headless browsers run in UTC, and that has produced timezone
// bugs in a sibling app that only appeared in real use.
//
// The load-bearing properties: the file is well-formed RFC 5545 even when the
// user's own text is hostile; an all-day date lands on the day the reader would
// call it; a VALARM is present on every event, because an event without one is a
// diary entry and not a reminder; and what goes in agrees exactly with what the
// held list shows.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fold as foldEvents, type State } from '../src/fold.ts';
import { toCalendar, calendarCount } from '../src/ics.ts';
import { heldGroups } from '../src/held.ts';
import { localDayKey } from '../src/time.ts';
import type { AppEvent } from '../src/events.ts';

const DENVER = 'America/Denver';
const KIRITIMATI = 'Pacific/Kiritimati';          // UTC+14
const NOW = '2026-07-29T18:00:00.000Z';           // 12:00 on the 29th, Denver

let seq = 0;
const ev = (kind: string, node: string, payload: unknown, at = '2026-07-01T12:00:00.000Z'): AppEvent =>
  ({ id: `e${seq}`, vault: 'personal', at, device: 'd0', seq: seq++, kind, node, payload } as AppEvent);
const st = (...events: AppEvent[]): State => foldEvents(events);

const clockAt = (id: string, days: number, kind = 'review'): AppEvent =>
  ev('clock.set', id, { clockKind: kind, at: new Date(Date.parse(NOW) + days * 86_400_000).toISOString(), source: 't' });

const item = (id: string, title: string, days = 0): AppEvent[] =>
  [ev('node.created', id, { nodeKind: 'action', title }), clockAt(id, days)];

/** Unfold continuation lines, the way any real parser must, then split. */
const unfold = (ics: string): string[] =>
  ics.replace(/\r\n[ \t]/g, '').split('\r\n').filter(Boolean);

/**
 * A VALIDATOR, not a splitter.
 *
 * The audit's sharpest point: `unfold()` above can never reject anything, so a
 * suite built on it validates nothing — every defect the audit found had sailed
 * through 133 green tests because no test ever CHECKED a line, only split one.
 * This walks the octets and returns the RFC violations it finds.
 */
function violations(ics: string): string[] {
  const errs: string[] = [];
  const enc = new TextEncoder();
  if (!ics.endsWith('\r\n')) errs.push('file does not end with CRLF');
  if (/(?<!\r)\n/.test(ics)) errs.push('bare LF somewhere in the file');
  for (const line of ics.split('\r\n')) {
    if (line === '') continue;
    // §3.1: no physical line over 75 octets, excluding the CRLF.
    const n = enc.encode(line).length;
    if (n > 75) errs.push(`line of ${n} octets: ${line.slice(0, 24)}…`);
  }
  // §3.1 VALUE-CHAR = WSP / %x21-7E / NON-US-ASCII. Everything else is illegal
  // ANYWHERE in a content line — this is the check that would have caught a form
  // feed pasted out of a PDF reaching the file raw.
  for (const [i, ch] of [...ics].entries()) {
    const c = ch.codePointAt(0)!;
    if (ch === '\r' || ch === '\n' || ch === '\t') continue;
    if (c < 0x20 || c === 0x7f) errs.push(`illegal control U+${c.toString(16).padStart(4, '0')} at ${i}`);
  }
  const stack: string[] = [];
  for (const l of unfold(ics)) {
    if (l.startsWith('BEGIN:')) stack.push(l.slice(6));
    else if (l.startsWith('END:') && stack.pop() !== l.slice(4)) errs.push(`unmatched END:${l.slice(4)}`);
  }
  if (stack.length) errs.push(`unclosed: ${stack.join(', ')}`);
  return errs;
}

/** Is there a REAL TZID parameter, as opposed to the letters appearing in a
 *  user's own text? The old check was `ics.includes('TZID')`, which an item
 *  titled "renew TZID certificate" makes false while the file is perfectly
 *  conformant — a substring test that can only fail spuriously (audit). */
const hasTzidParam = (ics: string): boolean =>
  unfold(ics).some(l => /^[A-Za-z0-9-]+(;[^:]*)?;TZID=/.test(l) || /^[A-Za-z0-9-]+;TZID=/.test(l));

// --- shape -----------------------------------------------------------------

test('the file is one well-formed VCALENDAR with matched BEGIN/END pairs', () => {
  const ics = toCalendar(st(...item('A', 'ring the dentist'), ...item('B', 'water plant', 3)), NOW, DENVER);
  const lines = unfold(ics);
  assert.equal(lines[0], 'BEGIN:VCALENDAR');
  assert.equal(lines[lines.length - 1], 'END:VCALENDAR');
  assert.ok(ics.endsWith('\r\n'), 'ends with CRLF, as the spec requires');
  assert.ok(!/(?<!\r)\n/.test(ics), 'every line break is CRLF, never a bare LF');

  const stack: string[] = [];
  for (const l of lines) {
    if (l.startsWith('BEGIN:')) stack.push(l.slice(6));
    if (l.startsWith('END:')) assert.equal(stack.pop(), l.slice(4), `END:${l.slice(4)} matches its BEGIN`);
  }
  assert.equal(stack.length, 0, 'nothing left unclosed');
  assert.equal(lines.filter(l => l === 'BEGIN:VEVENT').length, 2, 'two events');
});

test('every event carries a VALARM — an event without one is a diary entry', () => {
  const ics = toCalendar(st(...item('A', 'a'), ...item('B', 'b', 2), ...item('C', 'c', 40)), NOW, DENVER);
  const lines = unfold(ics);
  const events = lines.filter(l => l === 'BEGIN:VEVENT').length;
  const alarms = lines.filter(l => l === 'BEGIN:VALARM').length;
  assert.equal(events, 3);
  assert.equal(alarms, events, 'one alarm per event, always');
  assert.ok(lines.includes('TRIGGER;RELATED=START:PT9H'), 'fires at 9am local, not at 23:59');
});

test('a stable UID per node, so re-importing updates rather than duplicates', () => {
  const s = st(...item('NODE-1', 'a thing'));
  const first = unfold(toCalendar(s, NOW, DENVER)).find(l => l.startsWith('UID:'));
  const second = unfold(toCalendar(s, '2026-08-02T18:00:00.000Z', DENVER)).find(l => l.startsWith('UID:'));
  assert.equal(first, 'UID:NODE-1@quietkeep');
  assert.equal(first, second, 'the same item keeps its identity across exports');
});

// --- timezones, which is what build-plan item 30 insists on ----------------

test('the all-day date is the day the READER would call it, in their own zone', () => {
  // 02:30Z on the 30th is still the evening of the 29th in Denver, and already
  // the 30th in Kiritimati (UTC+14).
  const at = '2026-07-30T02:30:00.000Z';
  const s = st(ev('node.created', 'N', { nodeKind: 'action', title: 'x' }),
    ev('clock.set', 'N', { clockKind: 'review', at, source: 't' }));

  const dDenver = unfold(toCalendar(s, NOW, DENVER)).find(l => l.startsWith('DTSTART'));
  assert.equal(dDenver, `DTSTART;VALUE=DATE:${localDayKey(at, DENVER).replace(/-/g, '')}`);
  assert.equal(dDenver, 'DTSTART;VALUE=DATE:20260729', 'still the 29th in Denver');

  const dKiri = unfold(toCalendar(s, NOW, KIRITIMATI)).find(l => l.startsWith('DTSTART'));
  assert.equal(dKiri, 'DTSTART;VALUE=DATE:20260730', 'already the 30th at UTC+14');
});

test('no VTIMEZONE is needed anywhere, because every event is all-day', () => {
  const ics = toCalendar(st(...item('A', 'a'), ...item('B', 'renew TZID certificate', 2)), NOW, KIRITIMATI);
  assert.equal(unfold(ics).some(l => l === 'BEGIN:VTIMEZONE'), false, 'no timezone block to get wrong');
  assert.equal(hasTzidParam(ics), false, 'and no TZID PARAMETER — checked structurally, not as a substring');
  assert.ok(ics.includes('TZID'), 'even though a user title legitimately contains those letters');
});

// --- the user's own text, which can be anything ----------------------------

test('hostile text cannot corrupt the file (escaping, RFC 5545 §3.3.11)', () => {
  // A share-target capture composes title/text/url with NEWLINES. A bare newline
  // in a property value terminates the property and corrupts everything after it.
  const nasty = 'a;b,c\\d\nSUMMARY:INJECTED\nEND:VEVENT';
  const ics = toCalendar(st(...item('N', nasty)), NOW, DENVER);
  const lines = unfold(ics);
  assert.equal(lines.filter(l => l === 'BEGIN:VEVENT').length, 1, 'still exactly one event');
  assert.equal(lines.filter(l => l === 'END:VEVENT').length, 1, 'and one end');
  assert.equal(lines.filter(l => l.startsWith('SUMMARY:')).length, 1, 'the injection did not become a property');
  const summary = lines.find(l => l.startsWith('SUMMARY:'))!;
  assert.ok(summary.includes('\\;') && summary.includes('\\,') && summary.includes('\\\\'),
    'semicolon, comma and backslash are escaped');
  assert.ok(summary.includes('\\n'), 'and the newline is an escaped literal, not a line break');
});

test('long lines fold at 75 octets and never split a character in half', () => {
  // Emoji are 4 bytes each: folding by character count would cut one apart and
  // produce invalid UTF-8 rather than merely a long line.
  const title = '🌱'.repeat(60);
  const ics = toCalendar(st(...item('N', title)), NOW, DENVER);
  const enc = new TextEncoder();
  for (const line of ics.split('\r\n')) {
    assert.ok(enc.encode(line).length <= 75, `line is ${enc.encode(line).length} octets: ${line.slice(0, 30)}…`);
  }
  // Unfolding must give the title back exactly — proof nothing was lost or split.
  const summary = unfold(ics).find(l => l.startsWith('SUMMARY:'))!;
  assert.equal(summary.slice('SUMMARY:'.length), title, 'the text survives folding intact');
  assert.ok(!ics.includes('�'), 'no replacement characters anywhere');
});

test('continuation lines begin with exactly one space', () => {
  const ics = toCalendar(st(...item('N', 'x'.repeat(300))), NOW, DENVER);
  const raw = ics.split('\r\n');
  const continuations = raw.filter(l => l.startsWith(' '));
  assert.ok(continuations.length > 0, 'it did fold');
  // NOT "never two spaces": only the FIRST WSP is the fold marker, so a fold
  // landing on a space produces a legal line beginning "  " whose second space
  // is content. The old assertion was a wrong invariant that passed only because
  // its fixture had no spaces in it (audit).
  const spacey = toCalendar(st(...item('N', 'a '.repeat(120))), NOW, DENVER);
  assert.deepEqual(violations(spacey), [], 'a title full of spaces still folds legally');
  const back = unfold(spacey).find(l => l.startsWith('SUMMARY:'))!;
  assert.equal(back.slice('SUMMARY:'.length), 'a '.repeat(120), 'and unfolds back exactly');
});

// --- what goes in, and what must not ---------------------------------------

test('the calendar carries exactly what the held list says it should', () => {
  const s = st(
    ev('capture.recorded', 'INBOX', { text: 'unrouted', source: 'quick', sourceTags: [] }),
    ...item('READY', 'ready', 0),
    ...item('SOON', 'soon', 3),
    ...item('LATER', 'later', 40),
    ...item('MENU', 'menu', 1), ev('menu.item.added', 'MENU', { category: 'read' }),
    ...item('DONE', 'done', 0), ev('done.marked', 'DONE', { at: NOW }),
    ...item('GONE', 'trashed', 0), ev('node.trashed', 'GONE', {}),
  );
  const uids = unfold(toCalendar(s, NOW, DENVER))
    .filter(l => l.startsWith('UID:')).map(l => l.slice(4).replace('@quietkeep', ''));
  assert.deepEqual(uids.sort(), ['LATER', 'READY', 'SOON'], 'work that will come back, and nothing else');

  // And that set is DERIVED from heldGroups, not maintained separately.
  const fromGroups = heldGroups(s, NOW, DENVER)
    .filter(g => ['ready', 'soon', 'later'].includes(g.key))
    .flatMap(g => g.items.map(n => n.id));
  assert.deepEqual(uids.sort(), fromGroups.sort(), 'the calendar and the list cannot disagree');
  assert.equal(calendarCount(s, NOW, DENVER), 3, 'and the count told the truth beforehand');
});

test('a repeat becomes a real recurrence', () => {
  const s = st(
    ev('node.created', 'U', { nodeKind: 'upkeep', title: 'water the plant' }),
    ev('upkeep.interval.set', 'U', { intervalDays: 10, comfortWindowDays: 3 }),
    clockAt('U', 0),
  );
  const lines = unfold(toCalendar(s, NOW, DENVER));
  assert.ok(lines.includes('RRULE:FREQ=DAILY;INTERVAL=10'), 'the calendar keeps asking on its own');
});

test('a nonsense cadence never reaches the file as an RRULE', () => {
  for (const bad of [{ intervalDays: 0, comfortWindowDays: 1 }, { intervalDays: NaN, comfortWindowDays: 1 }]) {
    const s = st(
      ev('node.created', 'U', { nodeKind: 'upkeep', title: 'u' }),
      ev('upkeep.interval.set', 'U', bad),
      clockAt('U', 0),
    );
    const ics = toCalendar(s, NOW, DENVER);
    assert.ok(!ics.includes('RRULE'), `${JSON.stringify(bad)} produces no recurrence rule`);
  }
});

// --- resilience and honesty -------------------------------------------------

test('a malformed stored date is skipped, never thrown (the audit crash class)', () => {
  const s = st(
    ev('node.created', 'BAD', { nodeKind: 'action', title: 'corrupt' }),
    ev('clock.set', 'BAD', { clockKind: 'due', at: '2026-08-32T00:00:00.000Z', source: 'import' }),
    ...item('GOOD', 'fine', 0),
  );
  let ics = '';
  assert.doesNotThrow(() => { ics = toCalendar(s, NOW, DENVER); });
  const uids = unfold(ics).filter(l => l.startsWith('UID:'));
  assert.equal(uids.length, 1, 'the good one is exported');
  assert.ok(uids[0]!.includes('GOOD'), 'and the corrupt one is simply absent');
});

test('the file says when it was made, because it is a snapshot (ADR-0007)', () => {
  const ics = toCalendar(st(...item('A', 'a')), NOW, DENVER);
  const lines = unfold(ics);
  const name = lines.find(l => l.startsWith('X-WR-CALNAME:'))!;
  assert.ok(name.includes('2026-07-29'), `the calendar names its own date (${name})`);
  const desc = lines.find(l => l.startsWith('DESCRIPTION:'))!;
  assert.ok(/snapshot/i.test(desc), 'and each event says it will not follow later changes');
});

test('an empty store produces a valid, empty calendar rather than nothing', () => {
  const ics = toCalendar(st(), NOW, DENVER);
  const lines = unfold(ics);
  assert.equal(lines[0], 'BEGIN:VCALENDAR');
  assert.equal(lines[lines.length - 1], 'END:VCALENDAR');
  assert.equal(lines.filter(l => l === 'BEGIN:VEVENT').length, 0);
  assert.equal(calendarCount(st(), NOW, DENVER), 0);
});

test('an untitled item still gets a usable summary', () => {
  const s = st(ev('node.created', 'N', { nodeKind: 'action', title: '' }), clockAt('N', 0));
  const lines = unfold(toCalendar(s, NOW, DENVER));
  assert.ok(lines.includes('SUMMARY:(untitled)'), 'never a blank calendar entry');
});

// --- audit fixes (T1 adversarial pass) -------------------------------------

test('every case in this file also passes a real RFC validator, not just a splitter', () => {
  const s = st(
    ...item('A', 'plain'), ...item('B', 'with, commas; and \\ backslashes', 2),
    ...item('C', '\u{1F331}'.repeat(40), 5), ...item('D', 'a '.repeat(90), 40),
  );
  for (const zone of [DENVER, KIRITIMATI, 'Pacific/Midway', 'Pacific/Chatham']) {
    assert.deepEqual(violations(toCalendar(s, NOW, zone)), [], `${zone} produces a conformant file`);
  }
});

test('control characters from an ordinary capture never reach the file (audit, high)', () => {
  // A form feed pasted out of a PDF is enough. `cleanTitle` guards the RENAME
  // path, but capture assigns the raw text straight to the title, so the calendar
  // generator is the only thing standing between a paste and a broken file.
  const FF = String.fromCharCode(12);      // form feed
  const ESC = String.fromCharCode(27);     // an ANSI escape, as pasted from a terminal
  const NUL = String.fromCharCode(0);
  const nasty = `call the clinic${FF}about the referral${ESC}[0m${NUL}`;
  const s = st(ev('capture.recorded', 'N', { text: nasty, source: 'quick', sourceTags: [] }),
    ev('clarify.routed', 'N', { route: 'next-action' }), clockAt('N', 1));
  const ics = toCalendar(s, NOW, DENVER);
  assert.deepEqual(violations(ics), [], 'the file is conformant despite the paste');
  const summary = unfold(ics).find(l => l.startsWith('SUMMARY:'))!;
  assert.ok(summary.includes('call the clinic') && summary.includes('referral'),
    'and the readable text survives');
});

test('newlines still become the one escape RFC 5545 provides', () => {
  const s = st(...item('N', 'line one\nline two\r\nline three'));
  const summary = unfold(toCalendar(s, NOW, DENVER)).find(l => l.startsWith('SUMMARY:'))!;
  assert.equal(summary, 'SUMMARY:line one\\nline two\\nline three',
    'CR, CRLF and LF all collapse to one escape — the spec provides no \\r');
});

test('no METHOD, because this is a publication and not an iTIP message (audit)', () => {
  const ics = toCalendar(st(...item('A', 'a')), NOW, DENVER);
  assert.equal(unfold(ics).some(l => l.startsWith('METHOD:')), false,
    'METHOD:PUBLISH would require an ORGANIZER on every VEVENT (RFC 5546 3.2.1)');
  assert.equal(unfold(ics).some(l => l.startsWith('ORGANIZER')), false,
    'and a personal, serverless export has no organiser to name');
});

test('INTERVAL is always a positive integer, or absent (audit)', () => {
  for (const iv of [0.4, 0.6, 1e21, -3, Infinity, NaN, 2.5]) {
    const s = st(
      ev('node.created', 'U', { nodeKind: 'upkeep', title: 'u' }),
      ev('upkeep.interval.set', 'U', { intervalDays: iv, comfortWindowDays: 1 }),
      clockAt('U', 0),
    );
    const rule = unfold(toCalendar(s, NOW, DENVER)).find(l => l.startsWith('RRULE:'));
    if (rule) {
      const n = Number(rule.split('INTERVAL=')[1]);
      assert.ok(Number.isSafeInteger(n) && n > 0, `intervalDays ${iv} gave INTERVAL=${n}`);
      assert.ok(!/e[+-]/i.test(rule), `and never exponential notation (${rule})`);
    }
  }
});

test('a reminder is never dated in the past — it could not fire (audit)', () => {
  // `ready` is days <= 0, so it INCLUDES clocks that already passed, and that is
  // exactly the group this feature exists to remind about.
  const s = st(...item('OLD', 'a week ago', -7), ...item('TODAY', 'today', 0));
  const dates = unfold(toCalendar(s, NOW, DENVER))
    .filter(l => l.startsWith('DTSTART')).map(l => l.split(':')[1]!);
  const today = localDayKey(NOW, DENVER).replace(/-/g, '');
  assert.equal(dates.length, 2);
  for (const d of dates) assert.ok(d >= today, `${d} is not before today (${today})`);
});

test('a parked item is in the calendar, because a park IS a return date (audit)', () => {
  // The held list shows it as "parked until ..."; the calendar used to drop it,
  // so the app contradicted itself about something the user could plainly see.
  const s = st(ev('node.created', 'P', { nodeKind: 'action', title: 'parked thing' }),
    clockAt('P', 5, 'park'));
  const groups = heldGroups(s, NOW, DENVER);
  assert.ok(groups.some(g => g.items.some(n => n.id === 'P')), 'the list holds it');
  const uids = unfold(toCalendar(s, NOW, DENVER)).filter(l => l.startsWith('UID:'));
  assert.equal(uids.length, 1, 'and so does the calendar');
  assert.equal(calendarCount(s, NOW, DENVER), 1, 'and the count agrees');
});

test('clocks are compared as INSTANTS, never as strings (audit)', () => {
  // An offset-form timestamp sorts differently as text than as a moment. The old
  // local copy compared `c.at` lexicographically, so the card and the calendar
  // named different days for the same node.
  const s = st(
    ev('node.created', 'N', { nodeKind: 'action', title: 'x' }),
    ev('clock.set', 'N', { clockKind: 'due', at: '2026-08-05T00:00:00.000Z', source: 't' }),
    ev('clock.set', 'N', { clockKind: 'review', at: '2026-08-04T20:00:00.000-12:00', source: 't' }),
  );
  assert.ok('2026-08-04T20:00:00.000-12:00' < '2026-08-05T00:00:00.000Z', 'text order is the trap');
  assert.ok(Date.parse('2026-08-04T20:00:00.000-12:00') > Date.parse('2026-08-05T00:00:00.000Z'),
    'instant order is the truth');
  const d = unfold(toCalendar(s, NOW, DENVER)).find(l => l.startsWith('DTSTART'))!;
  assert.equal(d, 'DTSTART;VALUE=DATE:20260804', 'the soonest INSTANT is what the calendar names');
});

test('an out-of-range alarm hour falls back rather than emitting a malformed DURATION', () => {
  for (const h of [-1, 24, 9.5, NaN]) {
    const ics = toCalendar(st(...item('A', 'a')), NOW, DENVER, { alarmHour: h });
    assert.deepEqual(violations(ics), [], `alarmHour ${h} still produces a conformant file`);
    const trig = unfold(ics).find(l => l.startsWith('TRIGGER'))!;
    assert.match(trig, /^TRIGGER;RELATED=START:PT\d+H$/, `and a well-formed duration (${trig})`);
  }
});
