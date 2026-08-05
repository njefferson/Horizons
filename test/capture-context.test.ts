// When a thing was written down (1.23.0).
//
// The words are the whole feature, and the failure mode is not a wrong date —
// it is a correct date phrased as an accusation. This line lands on the surface
// where somebody is working through a backlog, so every assertion below is
// about what it must never be able to say.
//
// Assertions hold RULES rather than sentences (hub LESSONS §59): a test pinned
// to "Written Tuesday evening" goes red on a reword that was never wrong, and
// stays green on "Written Tuesday evening — 3 weeks ago", which is the actual
// defect.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { captureContextWords } from '../src/capture-context.ts';
import { MemoryLogStore } from '../src/log-store.ts';
import type { AppEvent } from '../src/events.ts';

const TZ = 'America/Denver';
// 14:20 local on Wednesday 2026-08-05.
const NOW = '2026-08-05T20:20:00.000Z';

/** Local wall time on a given August day, as an instant. Denver is UTC-6 in
 *  August, and the offset is applied through Date rather than by padding a
 *  string — the first draft did the latter and produced "T26:30" for anything
 *  after 18:00 local, which parses as nothing and made the module look broken
 *  when the test was. */
const at = (day: number, hour: number): string =>
  new Date(Date.UTC(2026, 7, day, hour + 6, 30, 0)).toISOString();

// --- the thing it must never do ----------------------------------------------

test('IT NEVER STATES AN AGE, in any form, at any distance', () => {
  // "3 weeks old" and "you wrote this in June" are the same fact wearing an
  // accusation. The line appears on a surface where somebody already feels
  // behind, and entry 15 is that a machine's neutral reminder is read with the
  // same raw nerve — so it is given nothing to read.
  const instants = [
    at(5, 9), at(4, 20), at(3, 7), at(1, 14),
    '2026-07-14T18:00:00.000Z', '2026-02-02T18:00:00.000Z', '2024-11-30T18:00:00.000Z',
  ];
  for (const iso of instants) {
    const w = captureContextWords(iso, TZ, NOW);
    assert.ok(w, `${iso} should say something`);
    for (const bad of [
      'ago', 'old', 'still', 'already', 'yet', 'since', 'been', 'waiting',
      'sitting', 'untouched', 'ignored', 'overdue', 'you have',
    ]) {
      assert.doesNotMatch(w!, new RegExp(`\\b${bad}\\b`, 'i'), `"${w}" says "${bad}"`);
    }
  }
});

test('and it never counts — no elapsed number reaches the card', () => {
  // A date carries digits legitimately ("14 Jul"). What may never appear is a
  // COUNT: "3 weeks", "21 days". The rule is that any number is part of a date,
  // never followed by a unit of elapsed time.
  for (const iso of [at(4, 20), '2026-07-14T18:00:00.000Z', '2024-11-30T18:00:00.000Z']) {
    const w = captureContextWords(iso, TZ, NOW)!;
    assert.doesNotMatch(w, /\d+\s*(day|week|month|year|hour|minute)s?\b/i, `"${w}" counts`);
  }
});

// --- what it actually says ----------------------------------------------------

test('today and yesterday are named as themselves', () => {
  // "Written Wednesday morning" on a Wednesday afternoon is correct and reads
  // as a puzzle.
  const today = captureContextWords(at(5, 9), TZ, NOW)!;
  assert.match(today, /\bthis morning\b/i);
  assert.doesNotMatch(today, /\bwednesday\b/i, 'today is not named by its weekday');

  const yesterday = captureContextWords(at(4, 20), TZ, NOW)!;
  assert.match(yesterday, /\byesterday\b/i);
  assert.match(yesterday, /\bevening\b/i, 'the part of day is the cue that helps');
});

test('inside the week it is a weekday and a part of day — a moment to stand in', () => {
  // Monday 2026-08-03, 07:30 local.
  const w = captureContextWords(at(3, 7), TZ, NOW)!;
  assert.match(w, /\bmonday\b/i);
  assert.match(w, /\bmorning\b/i);
});

test('past a week the weekday stops locating anything, so it becomes a date', () => {
  const w = captureContextWords('2026-07-14T18:00:00.000Z', TZ, NOW)!;
  assert.match(w, /\b14\b/);
  assert.doesNotMatch(w, /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  // No part of day either: nobody remembers the afternoon of a Tuesday in July,
  // and offering it implies a precision the cue does not have.
  assert.doesNotMatch(w, /\b(morning|afternoon|evening|night)\b/i);
});

test('the year appears only when its absence would mislead', () => {
  assert.doesNotMatch(captureContextWords('2026-07-14T18:00:00.000Z', TZ, NOW)!, /2026/);
  assert.match(captureContextWords('2024-11-30T18:00:00.000Z', TZ, NOW)!, /2024/);
});

test('the local day is the ZONE’s, not UTC’s', () => {
  // 23:00 local on the 4th is 05:00Z on the 5th. Measured in UTC this is
  // "today"; it is plainly yesterday to the person who wrote it, and every
  // date-facing bug in this app has had this shape.
  const w = captureContextWords('2026-08-05T05:00:00.000Z', TZ, NOW)!;
  assert.match(w, /\byesterday\b/i);
});

// --- the cases that would cost somebody their card ----------------------------

test('an instant nothing can parse costs the LINE, never the card', () => {
  // Real: an imported file, or a shard from a device with a broken clock. This
  // runs on the triage surface, where a throw would take away the item somebody
  // was in the middle of deciding about.
  assert.equal(captureContextWords('not-a-date', TZ, NOW), null);
  assert.equal(captureContextWords('', TZ, NOW), null);
});

test('an instant in the future says nothing rather than something absurd', () => {
  // A device with a wrong clock, or a shard from one. "Written tomorrow
  // morning" is the sentence that makes somebody stop believing the surface.
  assert.equal(captureContextWords('2026-08-09T18:00:00.000Z', TZ, NOW), null);
});

// --- where the instant comes from ---------------------------------------------

test('genesis is the EARLIEST event, not the first row appended', () => {
  // A shard folded in from another device delivers events that are older than
  // ones already stored. Insertion order and time order are then different
  // things, and `firstEventFor` has to mean the second one — otherwise a card
  // reports the moment somebody's OTHER device synced as the moment they wrote
  // it down. The Dexie implementation sorts for exactly this reason; the
  // in-memory one is asserted here because it is what the suite runs on.
  const store = new MemoryLogStore();
  const ev = (id: string, at: string): AppEvent =>
    ({ id, vault: 'personal', at, device: id, seq: 0, kind: 'node.created', node: 'N',
       payload: { nodeKind: 'action', title: 'x' } } as AppEvent);

  return (async () => {
    // Appended newest-first, which is what a shard union can produce.
    await store.append([ev('b', '2026-08-04T18:00:00.000Z')]);
    await store.append([ev('a', '2026-07-14T18:00:00.000Z')]);
    const first = await store.firstEventFor('N');
    assert.equal(first?.id, 'a', 'the earliest instant, whatever order it arrived in');
    assert.equal(await store.firstEventFor('nothing-here'), null);
  })();
});
