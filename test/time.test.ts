// Local calendar time (V-13).
//
// Every case here is pinned to a NON-UTC zone, because a test that only runs in
// UTC cannot see the bug this module was written to fix — end-of-UTC-day is
// end-of-local-day exactly and only in UTC. Denver is the reference platform's
// zone; Kiritimati (UTC+14) and Chatham (UTC+12:45) are the cases that break
// naive arithmetic hardest.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { endOfLocalDay, localDayKey, calendarDaysBetween, localParts, isValidIso } from '../src/time.ts';
import { admit } from '../src/gate.ts';
import { emptyState } from '../src/fold.ts';

const DENVER = 'America/Denver';

test('the V-13 bug itself: an evening capture ends its day tonight, not tomorrow', () => {
  // 20:30 on 28 July in Denver is 02:30 on the 29th in UTC. The old
  // setUTCHours(23,59,59) produced 2026-07-29T23:59:59Z — 17:59 local on the
  // 29th, nearly a full day after the user's "today" ended.
  const captured = '2026-07-29T02:30:00.000Z';
  assert.equal(localDayKey(captured, DENVER), '2026-07-28', 'it is still the 28th where the user is');
  const end = endOfLocalDay(captured, DENVER);
  assert.equal(end, '2026-07-29T05:59:59.000Z', 'end of the 28th in Denver = 05:59:59Z on the 29th');
  assert.equal(localDayKey(end, DENVER), '2026-07-28', 'and it is still the same local day');
  assert.notEqual(end, '2026-07-29T23:59:59.000Z', 'not the end of the UTC day (the old behaviour)');
});

test('end of local day lands at 23:59:59 wall time, in every zone tried', () => {
  for (const tz of [DENVER, 'UTC', 'Europe/London', 'Asia/Kolkata', 'Pacific/Kiritimati', 'Pacific/Chatham']) {
    const end = endOfLocalDay('2026-07-29T02:30:00.000Z', tz);
    const p = localParts(end, tz);
    assert.deepEqual([p.hour, p.minute, p.second], [23, 59, 59], `${tz} reads 23:59:59`);
  }
});

/** An INDEPENDENT oracle: bisect the epoch for the last instant whose local day
 *  key still matches. It shares no arithmetic with time.ts — no offsets, no
 *  formatters in common — so agreeing with it is evidence, not a tautology. */
const trueEndOfDay = (dayKey: string, tz: string): number => {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const [y, m, d] = dayKey.split('-').map(Number) as [number, number, number];
  let lo = Date.UTC(y, m - 1, d) - 36 * 3_600_000;
  let hi = Date.UTC(y, m - 1, d) + 36 * 3_600_000;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (fmt.format(new Date(mid)) <= dayKey) lo = mid; else hi = mid;
  }
  return lo;
};

test('end of local day is the LAST second of that day — including where 23:59:59 is ambiguous or absent', () => {
  // The earlier version of this suite asserted "reads 23:59:59 in every zone",
  // which is not the real contract and is FALSE in two zones: America/Nuuk and
  // America/Scoresbysund shift at local 23:00 -> 00:00, so on those days
  // 23:59:59 does not exist at all. Meanwhile Santiago and Nuuk fall back OVER
  // midnight, so 23:59:59 happens twice and picking the first ended the day an
  // hour early, once a year. The invariant that actually matters is: the instant
  // returned is inside the named local day, and within its final second.
  const zones = ['America/Santiago', 'America/Nuuk', 'America/Scoresbysund', 'America/Coyhaique',
    DENVER, 'Africa/Cairo', 'Australia/Lord_Howe', 'Pacific/Chatham', 'Pacific/Kiritimati',
    'Australia/Sydney', 'Asia/Tehran', 'Europe/London', 'UTC'];
  let checked = 0;
  for (const tz of zones) {
    for (let day = 0; day < 730; day++) {                   // all of 2026 and 2027
      const probe = new Date(Date.UTC(2026, 0, 1) + day * 86_400_000).toISOString();
      const key = localDayKey(probe, tz);
      const got = Date.parse(endOfLocalDay(probe, tz));
      assert.equal(localDayKey(new Date(got).toISOString(), tz), key, `${tz} ${key}: inside its own day`);
      const truth = trueEndOfDay(key, tz);
      assert.ok(got <= truth && truth - got < 1000,
        `${tz} ${key}: got ${new Date(got).toISOString()}, true end ${new Date(truth).toISOString()}`);
      checked++;
    }
  }
  assert.ok(checked > 9000, `swept ${checked} zone-days`);
});

test('the two named DST pathologies, called out by name', () => {
  // Fall back over midnight: 23:59:59 occurs twice; the day ends at the second.
  const santiago = endOfLocalDay('2026-04-04T12:00:00.000Z', 'America/Santiago');
  assert.equal(Date.parse(santiago), trueEndOfDay('2026-04-04', 'America/Santiago') - 999,
    'Santiago ends its day at the LATER of the two 23:59:59s');
  // Spring forward at 23:00: 23:59:59 never happens, and the day ends at 22:59:59.
  const nuuk = endOfLocalDay('2026-03-28T12:00:00.000Z', 'America/Nuuk');
  assert.equal(localDayKey(nuuk, 'America/Nuuk'), '2026-03-28', 'still inside the 28th');
  assert.ok(Date.parse(nuuk) <= trueEndOfDay('2026-03-28', 'America/Nuuk'),
    'and never past the end of it, though 23:59:59 does not exist that day');
});

test('plusDays counts calendar days across a DST changeover, not 86.4M ms', () => {
  // US DST ends 1 Nov 2026. Adding 86_400_000 ms across it lands an hour out;
  // calendar arithmetic does not.
  const before = '2026-10-31T18:00:00.000Z';           // 31 Oct, 12:00 Denver
  assert.equal(localDayKey(before, DENVER), '2026-10-31');
  const plus2 = endOfLocalDay(before, DENVER, 2);
  assert.equal(localDayKey(plus2, DENVER), '2026-11-02', 'two calendar days later, DST notwithstanding');
  const p = localParts(plus2, DENVER);
  assert.deepEqual([p.hour, p.minute, p.second], [23, 59, 59], 'still the last second of that day');
});

test('plusDays rolls over months, years and leap days', () => {
  const cases: [string, number, string][] = [
    ['2026-01-31T18:00:00.000Z', 1, '2026-02-01'],
    ['2026-12-31T18:00:00.000Z', 1, '2027-01-01'],
    ['2028-02-28T18:00:00.000Z', 1, '2028-02-29'],   // 2028 is a leap year
    ['2026-02-28T18:00:00.000Z', 1, '2026-03-01'],   // 2026 is not
  ];
  for (const [from, days, expected] of cases) {
    assert.equal(localDayKey(endOfLocalDay(from, DENVER, days), DENVER), expected, `${from} +${days}`);
  }
});

test('calendarDaysBetween counts days, not elapsed hours (the "tomorrow" bug)', () => {
  // 23:00 Denver, and a clock two hours later. Elapsed-hours arithmetic rounds
  // this to 0 and says "today"; it is plainly tomorrow.
  const late = '2026-07-30T05:00:00.000Z';     // 23:00 on the 29th, Denver
  const soon = '2026-07-30T07:00:00.000Z';     // 01:00 on the 30th, Denver
  assert.equal(Math.round((Date.parse(soon) - Date.parse(late)) / 86_400_000), 0,
    'the old elapsed-hours maths says "today" —');
  assert.equal(calendarDaysBetween(late, soon, DENVER), 1, '— but it is tomorrow');
});

test('calendarDaysBetween is 0 within a local day, and signed across days', () => {
  const morning = '2026-07-29T14:00:00.000Z';  // 08:00 Denver
  const evening = '2026-07-30T03:00:00.000Z';  // 21:00 Denver, SAME local day
  assert.equal(calendarDaysBetween(morning, evening, DENVER), 0, 'same local day');
  assert.equal(calendarDaysBetween(evening, morning, DENVER), 0, 'and symmetric');
  assert.equal(calendarDaysBetween(morning, '2026-08-05T14:00:00.000Z', DENVER), 7, 'a week ahead');
  assert.equal(calendarDaysBetween(morning, '2026-07-28T14:00:00.000Z', DENVER), -1, 'yesterday is negative');
});

test('a far-east zone: the local day can be ahead of the UTC day entirely', () => {
  // Kiritimati is UTC+14. 12:00Z on the 29th is already 02:00 on the 30th there.
  const iso = '2026-07-29T12:00:00.000Z';
  assert.equal(localDayKey(iso, 'Pacific/Kiritimati'), '2026-07-30', 'a day ahead of UTC');
  assert.equal(localDayKey(iso, DENVER), '2026-07-29', 'and Denver is on the 29th');
  // End of "today" there is BEFORE the current UTC day even ends.
  assert.equal(endOfLocalDay(iso, 'Pacific/Kiritimati'), '2026-07-30T09:59:59.000Z');
});

test('endOfLocalDay is idempotent — the end of a day is in that day', () => {
  for (const tz of [DENVER, 'Pacific/Kiritimati', 'Asia/Kolkata']) {
    const end = endOfLocalDay('2026-07-29T02:30:00.000Z', tz);
    assert.equal(endOfLocalDay(end, tz), end, `${tz}: applying it twice changes nothing`);
  }
});

test('bad input degrades or is refused — it never throws out of a projection (audit, severe)', () => {
  // One malformed stored date used to throw RangeError out of the render path,
  // which runs before capture's submit listener is attached — and a form with no
  // submit listener does a NATIVE GET NAVIGATION, clearing the input and
  // destroying the typed thought with no error at all. The data was intact and
  // permanently unreachable. Three locks now: isValidIso at the callers, the
  // gate refusing bad dates, and try/catch around every render.
  assert.equal(isValidIso('2026-08-32T00:00:00.000Z'), false, 'a 32nd of August is not an instant');
  assert.equal(isValidIso('whenever'), false);
  assert.equal(isValidIso(''), false);
  assert.equal(isValidIso(null), false);
  assert.equal(isValidIso(undefined), false);
  assert.equal(isValidIso(12345), false, 'a number is not an ISO string');
  assert.equal(isValidIso('2026-07-29T18:00:00.000Z'), true);
});

test('the gate refuses a date that is not a real instant, so it cannot land at all', () => {
  const bad = {
    id: 'x1', vault: 'personal', at: '2026-07-29T18:00:00.000Z', device: 'd0', seq: 0,
    kind: 'clock.set', node: 'N', payload: { clockKind: 'due', at: 'whenever', source: 'import' },
  } as unknown as Parameters<typeof admit>[0][number];
  assert.throws(() => admit([bad], emptyState()), /not a real instant/,
    'the door is shut on the whole class');

  const badEnvelope = { ...bad, at: 'nonsense', payload: { clockKind: 'due', at: '2026-07-29T18:00:00.000Z', source: 't' } } as typeof bad;
  assert.throws(() => admit([badEnvelope], emptyState()), /not a real instant/,
    'including the envelope’s own timestamp');
});
