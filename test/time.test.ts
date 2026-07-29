// Local calendar time (V-13).
//
// Every case here is pinned to a NON-UTC zone, because a test that only runs in
// UTC cannot see the bug this module was written to fix — end-of-UTC-day is
// end-of-local-day exactly and only in UTC. Denver is the reference platform's
// zone; Kiritimati (UTC+14) and Chatham (UTC+12:45) are the cases that break
// naive arithmetic hardest.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { endOfLocalDay, localDayKey, calendarDaysBetween, localParts } from '../src/time.ts';

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
