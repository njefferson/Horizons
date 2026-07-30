// Which devices have written here, and what "removing" one can honestly mean.
//
// The hard part of this feature is not counting. It is refusing to imply a
// capability nobody has: replacing a key revokes what happens NEXT, and cannot
// recall what another machine already holds. The words are tested as carefully
// as the arithmetic, because the words are where the lie would live.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  deviceRecords, deviceLine, devicesWords, shortDevice,
  REPLACE_KEY_WORDS, REPLACED_KEY_WORDS,
} from '../src/devices.ts';
import type { AppEvent } from '../src/events.ts';

const NOW = '2026-07-30T12:00:00.000Z';
const ev = (device: string, seq: number, at: string): AppEvent =>
  ({ id: `${device}-${seq}`, vault: 'personal', at, device, seq,
     kind: 'capture.recorded', node: `n-${device}-${seq}`,
     payload: { text: 'x', source: 'quick' } } as AppEvent);

test('every device that wrote is counted, from the events themselves', async () => {
  const log = [
    ev('phone', 0, '2026-07-28T09:00:00.000Z'),
    ev('phone', 1, '2026-07-30T11:00:00.000Z'),
    ev('ipad', 0, '2026-07-29T09:00:00.000Z'),
  ];
  const rs = deviceRecords(log, 'phone');

  assert.equal(rs.length, 2);
  assert.equal(rs[0]!.device, 'phone');
  assert.equal(rs[0]!.isThisOne, true, 'this device comes first — somebody is looking for themselves');
  assert.equal(rs[0]!.events, 2);
  assert.equal(rs[0]!.firstWrote, '2026-07-28T09:00:00.000Z');
  assert.equal(rs[0]!.lastWrote, '2026-07-30T11:00:00.000Z');
  assert.equal(rs[1]!.isThisOne, false);
});

test('a device nobody remembers still shows up, which is the point', async () => {
  // The reason to show this at all: an extra device in the pair is invisible
  // until something lists them. Counting from the LOG rather than from any
  // stored list means a forgotten device cannot be missing from the count.
  const log = [ev('phone', 0, NOW), ev('an-old-laptop', 0, '2026-01-02T09:00:00.000Z')];
  const rs = deviceRecords(log, 'phone');
  assert.equal(rs.length, 2);
  assert.ok(rs.some(r => r.device === 'an-old-laptop'));
});

test('others are ordered by who wrote most recently', async () => {
  const log = [
    ev('me', 0, NOW),
    ev('stale', 0, '2026-01-01T00:00:00.000Z'),
    ev('recent', 0, '2026-07-29T00:00:00.000Z'),
  ];
  assert.deepEqual(deviceRecords(log, 'me').map(r => r.device), ['me', 'recent', 'stale']);
});

test('one device on its own is said plainly, not reported as a count', async () => {
  // "1 device" reads as a fault to somebody who expected two. It is the ordinary
  // state of anyone who has not paired yet.
  const alone = deviceRecords([ev('me', 0, NOW)], 'me');
  assert.match(devicesWords(alone), /Only this device/);
  assert.doesNotMatch(devicesWords(alone), /\b1 device\b/);

  const two = deviceRecords([ev('me', 0, NOW), ev('other', 0, NOW)], 'me');
  assert.match(devicesWords(two), /one other/);

  const three = deviceRecords([ev('me', 0, NOW), ev('a', 0, NOW), ev('b', 0, NOW)], 'me');
  assert.match(devicesWords(three), /2 others/);
});

test('an empty log says nothing has been written, not that there are no devices', async () => {
  assert.match(devicesWords(deviceRecords([], 'me')), /Nothing has been written/);
});

test('each line says which device, how much, and how long ago', async () => {
  const rs = deviceRecords([
    ev('me', 0, '2026-07-30T11:30:00.000Z'),
    ev('other-device-id-here', 0, '2026-07-29T12:00:00.000Z'),
  ], 'me');

  const mine = deviceLine(rs[0]!, NOW);
  assert.match(mine, /This device/);
  assert.match(mine, /30 minutes ago/);

  const theirs = deviceLine(rs[1]!, NOW);
  assert.match(theirs, /Another device/);
  assert.match(theirs, /other-de/, 'shortened to eight, because the whole id is noise');
  assert.doesNotMatch(theirs, /other-device-id-here/, 'and never the whole thing');
  assert.match(theirs, /yesterday/);
});

test('relative time stays plain at every scale', async () => {
  const at = (iso: string): string =>
    deviceLine(deviceRecords([ev('d', 0, iso)], 'me')[0]!, NOW);

  assert.match(at('2026-07-30T11:59:59.000Z'), /just now/);
  assert.match(at('2026-07-30T09:00:00.000Z'), /3 hours ago/);
  assert.match(at('2026-07-25T12:00:00.000Z'), /5 days ago/);
  assert.match(at('2026-05-30T12:00:00.000Z'), /about 2 months ago/);
  // A clock that disagrees must not produce "NaN minutes ago" on somebody's
  // screen — the shape of error this audience least needs to decode.
  assert.match(at('not a date'), /unknown time/);
});

test('the id is shown short enough to compare and never in full', async () => {
  assert.equal(shortDevice('01KYSEANEG0RT08A110SMNEHHX'), '01KYSEAN');
  assert.equal(shortDevice('abc'), 'abc', 'a short id is not padded or truncated oddly');
});

// --- the words, which are where a lie would live -----------------------------

test('replacing the key promises revocation and refuses to promise recall', async () => {
  // The clauses that matter, in the order somebody needs them.
  assert.match(REPLACE_KEY_WORDS, /new key/i, 'what it does');
  assert.match(REPLACE_KEY_WORDS, /receives nothing new from this one/i,
    'FUTURE writes are genuinely cut off');
  // Revocation now DELETES the old mailbox — so the backlog is emptied when
  // online, and the copy must say both that and the honest offline fallback.
  assert.match(REPLACE_KEY_WORDS, /empties the old handover point/i,
    'the backlog is actively cleared, not left to leak');
  assert.match(REPLACE_KEY_WORDS, /offline right now, that backlog clears itself within a month/i,
    'and the offline case is stated, not hidden');
  // The one thing that stays impossible: recalling what the dropped device
  // already pulled onto itself.
  assert.match(REPLACE_KEY_WORDS, /already collected onto itself, it keeps/i,
    'and what nothing can do is said, not implied');
  assert.match(REPLACE_KEY_WORDS, /no software anywhere can take that back/i);

  // The words that would be a lie. No app can reach into another machine and
  // remove a copy, and claiming to is worst at the moment somebody is relying
  // on it — which is exactly when they would read this.
  for (const lie of [/\bwipe\b/i, /\berase (it|them|that device)/i, /\bremove.*from (that|the other) device/i,
    /\brevoke.*access to (what|everything)/i, /\bdelete.*their copy/i]) {
    assert.doesNotMatch(REPLACE_KEY_WORDS, lie, `must not imply ${lie}`);
  }

  // And it must not frighten: the person's own writing is safe, and saying so is
  // the difference between a control people use and one they avoid.
  assert.match(REPLACE_KEY_WORDS, /Your own writing is untouched/i);
});

test('afterwards it says what the person must now do', async () => {
  // Replacing the key orphans the other device silently — it keeps trying a
  // mailbox nothing arrives at. Unsaid, that is indistinguishable from sync
  // breaking.
  assert.match(REPLACED_KEY_WORDS, /pair them again/i);
  assert.match(REPLACED_KEY_WORDS, /will not sync/i);
});
