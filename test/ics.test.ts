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
  const ics = toCalendar(st(...item('A', 'a')), NOW, KIRITIMATI);
  assert.ok(!ics.includes('VTIMEZONE'), 'no timezone block to get wrong');
  assert.ok(!ics.includes('TZID'), 'and no TZID references');
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
  for (const c of continuations) assert.ok(!c.startsWith('  '), 'one space, not two');
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
