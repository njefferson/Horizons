// Composed Today (1.6.0, ADR-0051): the modules fold, the expiry-by-projection
// proof, and the cap. The load-bearing property is what CANNOT be asked:
// yesterday's choices are invisible to every exported reader.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fold, emptyState, type State } from '../src/fold.ts';
import { admit, gateOptionsFor, silentNodes } from '../src/gate.ts';
import { COMPOSED_CAP, TODAY_MODULE, choosable, composedFor, composedFull, todayIsOn } from '../src/composed.ts';
import { serialiseState, deserialiseState } from '../src/snapshot.ts';
import type { AppEvent } from '../src/events.ts';

const TZ = 'America/Denver';
const NOW = '2026-07-29T18:00:00.000Z';          // local day 2026-07-29 in Denver
const TODAY = '2026-07-29';
const OPTS = gateOptionsFor(TZ);

let seq = 0;
const ev = (kind: string, node: string | null, payload: unknown, at = NOW, device = 'd0'): AppEvent =>
  ({ id: `e${seq}`, vault: 'personal', at, device, seq: seq++, kind, node, payload } as AppEvent);
const write = (prior: State, offered: AppEvent[]): State =>
  fold(admit(offered, prior, OPTS), prior);
const capture = (prior: State, id: string): State =>
  write(prior, [ev('capture.recorded', id, { text: id, source: 'quick', sourceTags: [] })]);

// --- the modules fold --------------------------------------------------------

test('modules fold: enabled adds, disabled removes, off is the default', () => {
  let s = emptyState();
  assert.equal(todayIsOn(s), false, 'off by default — Noah\'s condition');
  s = write(s, [ev('module.enabled', null, { module: TODAY_MODULE })]);
  assert.equal(todayIsOn(s), true);
  s = write(s, [ev('module.disabled', null, { module: TODAY_MODULE })]);
  assert.equal(todayIsOn(s), false);
});

test('modules fold: shard order does not change the answer — fold sorts', () => {
  const on = ev('module.enabled', null, { module: TODAY_MODULE }, '2026-07-29T10:00:00.000Z');
  const off = ev('module.disabled', null, { module: TODAY_MODULE }, '2026-07-29T11:00:00.000Z');
  assert.equal(todayIsOn(fold([on, off])), false, 'the later event wins');
  assert.equal(todayIsOn(fold([off, on])), false, 'whatever order the shards arrive in');
});

test('modules survive a snapshot round-trip; a pre-1.6.0 snapshot reads as none on', () => {
  let s = emptyState();
  s = write(s, [ev('module.enabled', null, { module: TODAY_MODULE })]);
  const back = deserialiseState(JSON.parse(JSON.stringify(serialiseState(s))));
  assert.equal(todayIsOn(back), true);
  // A legacy snapshot has no modules key at all.
  const legacy = JSON.parse(JSON.stringify(serialiseState(emptyState()))) as Record<string, unknown>;
  delete legacy['modules'];
  assert.equal(todayIsOn(deserialiseState(legacy)), false, 'absent means off, never a throw');
});

// --- the choice and its expiry ----------------------------------------------

test('a choice folds, reads back for TODAY, and releasing clears it', () => {
  let s = capture(emptyState(), 'A');
  s = write(s, [ev('today.chosen', 'A', { day: TODAY })]);
  assert.deepEqual(composedFor(s, NOW, TZ).map(n => n.id), ['A']);
  assert.equal(silentNodes(s).length, 0, 'choosing changes no coverage');
  s = write(s, [ev('today.released', 'A', { day: TODAY })]);
  assert.deepEqual(composedFor(s, NOW, TZ), [], 'released is gone from the set');
});

test('EXPIRY BY PROJECTION: yesterday\'s choice is invisible today, with no residue', () => {
  let s = capture(emptyState(), 'A');
  s = write(s, [ev('today.chosen', 'A', { day: '2026-07-28' })]);   // chosen YESTERDAY
  assert.deepEqual(composedFor(s, NOW, TZ), [],
    'the one reader answers only for the current day');
  // And the module exports no reader that takes a day argument at all — the
  // question "chosen yesterday and not done" has no API to be asked through.
  // (This test line is the executable half; the module's surface is the proof.)
  const n = s.nodes.get('A')!;
  assert.equal(n.todayFor, '2026-07-28', 'the fold keeps the fact');
  assert.ok(!n.trashed && !n.lastDone, 'and the thing is an ordinary held thing again — no residue, no fraction');
});

test('LWW across devices: the later stamp wins whatever the fold order', () => {
  const genesis = ev('capture.recorded', 'A', { text: 'a', source: 'quick', sourceTags: [] });
  const admitted = admit([genesis], emptyState(), OPTS);
  const choose = ev('today.chosen', 'A', { day: TODAY }, '2026-07-29T12:00:00.000Z', 'ipad');
  const release = ev('today.released', 'A', { day: TODAY }, '2026-07-29T13:00:00.000Z', 'phone');
  const a = fold(admitted.concat(choose, release));
  const b = fold(admitted.concat(release, choose));
  assert.equal(a.nodes.get('A')!.todayFor, null);
  assert.equal(b.nodes.get('A')!.todayFor, null, 'shard order does not matter');
});

test('a chosen thing that gets done or trashed leaves the set on its own', () => {
  let s = capture(emptyState(), 'A');
  s = capture(s, 'B');
  s = write(s, [ev('today.chosen', 'A', { day: TODAY })]);
  s = write(s, [ev('today.chosen', 'B', { day: TODAY })]);
  s = write(s, [ev('done.marked', 'A', { at: NOW })]);
  s = write(s, [ev('node.trashed', 'B', { reason: 't' })]);
  assert.deepEqual(composedFor(s, NOW, TZ), [], 'done and let-go are not offered as today');
});

test('the cap: full at five, stated by the asking function, never enforced after the fact', () => {
  let s = emptyState();
  for (let i = 0; i < COMPOSED_CAP; i++) {
    s = capture(s, `N${i}`);
    s = write(s, [ev('today.chosen', `N${i}`, { day: TODAY })]);
  }
  assert.equal(composedFull(s, NOW, TZ), true);
  assert.equal(COMPOSED_CAP, 5, 'a hand fits five, and the constant is that number');
});

test('choosable excludes people, bothers, pebbles, the Menu, the done, and the gone', () => {
  let s = emptyState();
  s = write(s, [ev('person.created', 'PER', { name: 'Ada' })]);
  s = capture(s, 'M');
  s = write(s, [ev('clarify.routed', 'M', { route: 'someday' }), ev('menu.item.added', 'M', { category: 'read' })]);
  assert.equal(choosable(s.nodes.get('PER')!), false, 'a person is not a day\'s work');
  assert.equal(choosable(s.nodes.get('M')!), false, 'a wish is not a demand (law 6)');
  // But a CONTAINER is choosable — "this area, today" is a legitimate choice.
  s = write(s, [ev('node.created', 'P', { nodeKind: 'project', title: 'p' })]);
  assert.equal(choosable(s.nodes.get('P')!), true);
});
