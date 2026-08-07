// Law 4's other half, and a park that has come round.
//
// Both were found by running the fold rather than by reading it, and both are
// the same shape: the app knew something was back and no surface a person looks
// at said so.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fold, emptyState, type State } from '../src/fold.ts';
import { admit, gateOptionsFor, coverageGauge } from '../src/gate.ts';
import { nextUpQueue } from '../src/nextup.ts';
import { heldGroups, heldStatus } from '../src/held.ts';
import type { AppEvent } from '../src/events.ts';

const TZ = 'America/Denver';
const AGO = '2026-07-01T15:00:00.000Z';
const NOW = '2026-08-07T15:00:00.000Z';

let seq = 1000;
const ev = (kind: string, node: string | null, payload: unknown): AppEvent =>
  ({ id: `e${seq}`, vault: 'personal', at: AGO, device: 'd0', seq: seq++, kind, node, payload } as AppEvent);
const write = (prior: State, offered: AppEvent[]): State =>
  fold(admit(offered, prior, gateOptionsFor(TZ)), prior);

/** An area whose review has passed, holding a project, holding an action. */
function horizonThatCameRound(): State {
  let s = write(emptyState(), [ev('node.created', 'AREA', { nodeKind: 'area', title: 'Home' })]);
  s = write(s, [ev('clock.set', 'AREA', { clockKind: 'review', at: '2026-08-05T05:59:59.000Z', source: 'me' })]);
  s = write(s, [ev('node.created', 'PROJ', { nodeKind: 'project', title: 'Kitchen', parent: 'AREA' })]);
  s = write(s, [ev('node.created', 'LEAF', { nodeKind: 'action', title: 'buy tap washers', parent: 'PROJ' })]);
  return s;
}

test('law 4 pushes DOWN: a horizon coming round offers the work beneath it', () => {
  const s = horizonThatCameRound();

  // The state that was wrong. Kept as the fixture's own assertion so the test
  // says what it is about: the area really does surface, and the leaf really is
  // covered — `silent` is 0 and honestly so. This was never law 1 failing.
  assert.equal(coverageGauge(s).silent, 0, 'fixture: nothing is silent, which was always true');
  assert.equal(heldStatus(s.nodes.get('AREA')!, NOW, TZ), 'ready now', 'fixture: the horizon has come round');

  // Before this change the queue was EMPTY here: the app answered "what now"
  // with silence while its own list said something was ready.
  const q = nextUpQueue(s, NOW, TZ);
  assert.equal(q.length, 1, 'a horizon came round and nothing was offered beneath it');
  assert.equal(q[0]!.node.id, 'LEAF', 'the thing offered must be actionable work, never the horizon (law 4)');
  assert.equal(q[0]!.reason, 'beneath');
  assert.match(q[0]!.words, /Home/, 'the offer must name the horizon that asked for it');
});

test('the push-down never offers the container itself', () => {
  const q = nextUpQueue(horizonThatCameRound(), NOW, TZ);
  for (const item of q) {
    assert.notEqual(item.node.kind, 'area', 'offering an area is the climbing law 4 forbids');
    assert.notEqual(item.node.kind, 'project', 'a project is a container, not a next action');
  }
});

test('the push-down STANDS DOWN the moment anything asks directly', () => {
  // The bound that keeps this from becoming the pile. An area with two hundred
  // descendants must not put two hundred things in the queue; the tier is a
  // fallback for an otherwise-empty offer, not a second source of demand.
  let s = horizonThatCameRound();
  s = write(s, [ev('capture.recorded', 'C', { text: 'a direct thing' })]);
  s = write(s, [ev('clarify.routed', 'C', { route: 'next-action' })]);

  const q = nextUpQueue(s, NOW, TZ);
  assert.ok(q.length > 0, 'fixture: something asks directly');
  assert.ok(!q.some(i => i.reason === 'beneath'),
    'the fallback fired while real demands were present — that is a second pile, not a push-down');
});

test('a horizon that has NOT come round pushes nothing down', () => {
  let s = write(emptyState(), [ev('node.created', 'AREA', { nodeKind: 'area', title: 'Home' })]);
  s = write(s, [ev('clock.set', 'AREA', { clockKind: 'review', at: '2026-12-01T05:59:59.000Z', source: 'me' })]);
  s = write(s, [ev('node.created', 'LEAF', { nodeKind: 'action', title: 'buy tap washers', parent: 'AREA' })]);
  assert.deepEqual(nextUpQueue(s, NOW, TZ), [],
    'a future horizon offered its contents — the date it carries is the whole point of it');
});

// --- a park that has come round ---------------------------------------------

function declinedAndParked(returnAt: string, id = 'P'): State {
  let s = write(emptyState(), [ev('node.created', id, { nodeKind: 'action', title: 'cover the rota' })]);
  s = write(s, [ev('request.declined', id, { person: null, what: 'a thing', reason: 'detail' })]);
  s = write(s, [ev('park.set', id, { returnAt, reason: 'not-now-ledger' })]);
  return s;
}

test('a park whose day has arrived stops being held away', () => {
  const s = declinedAndParked('2026-07-10T05:59:59.000Z');
  const groups = heldGroups(s, NOW, TZ);
  // It sat in "Later" — the group for things with nothing asking — reading
  // "back now", for a month, while ADR-0056 promised it would come back.
  assert.ok(groups.some(g => g.title === 'Ready now' && g.items.some(i => i.id === 'P')),
    'a returned park is still filed under nothing-is-asking');
  assert.ok(!groups.some(g => g.title === 'Later' && g.items.some(i => i.id === 'P')));
  assert.equal(heldStatus(s.nodes.get('P')!, NOW, TZ), 'back now',
    '"ready now" is an answer; this is the question being handed back');
});

test('QUIETLY — a returned park is never put on the work surface', () => {
  // The half that must not change. Putting a thing you declined at the top of
  // the offer is the app not believing you, which is the one failure the Not Now
  // ledger exists to prevent.
  assert.deepEqual(nextUpQueue(declinedAndParked('2026-07-10T05:59:59.000Z'), NOW, TZ), [],
    'a declined request was offered back as work');
});

test('a park still in the future stays held away, and says until when', () => {
  const s = declinedAndParked('2026-12-01T05:59:59.000Z', 'F');
  assert.ok(heldGroups(s, NOW, TZ).some(g => g.title === 'Later' && g.items.some(i => i.id === 'F')));
  assert.match(heldStatus(s.nodes.get('F')!, NOW, TZ), /^parked until /);
  assert.deepEqual(nextUpQueue(s, NOW, TZ), []);
});
