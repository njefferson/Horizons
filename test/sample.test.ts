// The sample set (a roadmap requirement: test data that can be imported).
//
// The load-bearing test is that **every event passes the real `admit`**. Sample
// data that bypassed the write boundary could violate law 1, which would make the
// app's own demonstration a lie about what the app permits — and it is exactly the
// kind of privileged path that gets added "just for the fixture" and then quietly
// becomes the way the feature works.
//
// The second is that it is **relative-dated**: generated a year apart it must
// describe the same relative situation, because every temporal surface in this app
// would otherwise be exercised in the wrong state.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sampleEvents, sampleSummary, sampleWords, type SampleContext } from '../src/sample.ts';
import { admit, gateOptionsFor, silentNodes, heldNodes } from '../src/gate.ts';
import { fold } from '../src/fold.ts';
import { heldGroups } from '../src/held.ts';
import { nextUp } from '../src/nextup.ts';
import { waitingOnAnyone } from '../src/people.ts';
import { menuGroups } from '../src/menu.ts';
import { replanAll } from '../src/replan.ts';
import { localDayKey } from '../src/time.ts';

const DENVER = 'America/Denver';
const KIRITIMATI = 'Pacific/Kiritimati';
const NOW = '2026-07-29T18:00:00.000Z';          // midday on the 29th, Denver

function ctxFor(at: string, zone = DENVER): SampleContext {
  let n = 0;
  let s = 0;
  return { at, device: 'sample-device', vault: 'personal', zone, seq: () => s++, id: () => `s${n++}` };
}

/** Through the REAL pipeline: generate, then `admit`, then fold what admit
 *  returned. The first version of this folded the generator's output directly and
 *  so tested a path the app does not have — and it hid the fact that the set was
 *  relying on the gate's cures to become lawful. */
const built = (at = NOW, zone = DENVER) => {
  const events = sampleEvents(ctxFor(at, zone), at);
  const admitted = admit(events, fold([]), gateOptionsFor(zone));
  return { events, admitted, state: fold(admitted) };
};

// --- THE ONE THAT MATTERS ---------------------------------------------------

test('THE ONE THAT MATTERS: every sample event passes the real write boundary', () => {
  // Not a fixture-shaped approximation of the gate — `admit` itself, with the
  // zone-aware options the app uses. A demonstration that needed a privileged
  // path would be demonstrating something the app does not permit.
  const events = sampleEvents(ctxFor(NOW), NOW);
  const admitted = admit(events, fold([]), gateOptionsFor(DENVER));
  for (const e of events) {
    assert.ok(admitted.some(a => a.id === e.id), `${e.kind} was not admitted`);
  }
  // Nothing was REFUSED, which is the property that matters. An earlier version
  // of this asserted that nothing was CURED either, on the reasoning that a set
  // the gate has to correct describes events the app does not permit. That
  // reasoning was wrong: `admit` folds incrementally, so a node created without a
  // clocked parent is silent at the instant it is created and is cured there and
  // then. That is the app's designed capture-then-sort path, not a correction of
  // malformed input — every keystroke in the app takes it too.
  assert.equal(admitted.every(a => a.vault === 'personal'), true);
});

test('and it leaves nothing silent, which is the invariant it could most easily break', () => {
  const { state } = built();
  assert.deepEqual(silentNodes(state).map(n => n.title), [],
    'a sample set with a silent node teaches that silent nodes are normal');
});

test('the set is not empty, so the assertions above are about something', () => {
  const { events, state } = built();
  const s = sampleSummary(events);
  assert.ok(s.events > 15, `only ${s.events} events`);
  assert.ok(s.nodes >= 10, `only ${s.nodes} things`);
  assert.ok(heldNodes(state).length >= 5);
});

// --- relative dating --------------------------------------------------------

test('generated a year apart it describes the same relative situation', () => {
  // A fixture with a literal date in it is wrong tomorrow and absurd next year,
  // and this app's whole surface is temporal — so a stale fixture does not merely
  // look odd, it exercises the wrong code paths.
  const a = built('2026-07-29T18:00:00.000Z');
  const b = built('2027-11-14T18:00:00.000Z');

  const shape = (x: ReturnType<typeof built>, at: string) => ({
    passed: replanAll(x.state, at, DENVER).length,
    ready: (heldGroups(x.state, at, DENVER).find(g => g.key === 'ready')?.items ?? []).length,
    waiting: waitingOnAnyone(x.state, at, DENVER).length,
    menu: menuGroups(x.state).reduce((n, g) => n + g.items.length, 0),
    head: nextUp(x.state, at, DENVER).head !== null,
  });
  assert.deepEqual(shape(a, '2026-07-29T18:00:00.000Z'), shape(b, '2027-11-14T18:00:00.000Z'));
});

test('no literal date survives into the events — every instant is computed', () => {
  const { events } = built('2026-07-29T18:00:00.000Z');
  const text = JSON.stringify(events.map(e => e.payload));
  // The generator's own `at` is legitimately present. What must NOT appear is a
  // date that was typed rather than derived.
  for (const typed of ['2026-01-01', '2025-', '2024-', '1999-']) {
    assert.equal(text.includes(typed), false, `a literal ${typed} is in the payloads`);
  }
});

test('it works on the other side of the world too', () => {
  // UTC+14. A generator that only holds in one hemisphere is a generator that
  // will be wrong for somebody, and clocks here are end-of-LOCAL-day instants.
  const { state, events } = built(NOW, KIRITIMATI);
  assert.deepEqual(silentNodes(state).map(n => n.title), []);
  const admitted = admit(events, fold([]), gateOptionsFor(KIRITIMATI));
  assert.equal(admitted.length >= events.length, true);
});

// --- it must show the awkward states, not only the tidy ones -----------------

test('it includes a date that has gone by, because there is no past bucket', () => {
  // Law 3's surface is the most characteristic thing in the app and the one most
  // worth seeing before trusting it with anything.
  const { state } = built();
  assert.equal(replanAll(state, NOW, DENVER).length >= 1, true);
});

test('it includes something with another person in it', () => {
  const { state } = built();
  const owed = waitingOnAnyone(state, NOW, DENVER);
  assert.equal(owed.length >= 1, true);
});

test('it includes something genuinely unpressured on the Menu', () => {
  // Demand-free kinds carry no clocks (law 6). Without one, the demonstration
  // teaches that everything in this app asks something of you.
  const { state } = built();
  const items = menuGroups(state).flatMap(g => g.items);
  assert.equal(items.length >= 2, true);
  for (const i of items) {
    assert.equal(Object.keys(i.clocks).length, 0, `${i.title} carries a clock`);
  }
});

test('it includes real containment — children under a parent, not a flat list', () => {
  // The shape a flat to-do list cannot express, and the first thing a
  // demonstration of this app needs.
  //
  // This originally asserted a container with NO clock of its own, "held up only
  // by its children". That state is unreachable here and the assertion was
  // testing a misreading of law 1 twice over: containment satisfies the CHILD, so
  // a parent whose children are clocked is still silent — and the gate therefore
  // cures every container at creation. What is real about containment is the
  // parent link, so that is what is checked.
  const { state } = built();
  const parents = heldNodes(state).filter(n => n.kind === 'project' || n.kind === 'area');
  assert.equal(parents.length >= 2, true);
  const ids = new Set(parents.map(p => p.id));
  const children = heldNodes(state).filter(n => n.parent !== null && ids.has(n.parent));
  assert.ok(children.length >= 3, `only ${children.length} things sit under a parent`);
  assert.equal(new Set(children.map(c => c.parent)).size >= 2, true,
    'more than one container has something in it');
});

test('it offers exactly one thing as next, like any other day', () => {
  const { state } = built();
  const up = nextUp(state, NOW, DENVER);
  assert.notEqual(up.head, null);
  assert.equal(typeof up.total, 'number');
});

test('something is left unsorted, because an empty inbox teaches nothing', () => {
  const { events } = built();
  assert.equal(events.filter(e => e.kind === 'capture.recorded').length >= 2, true);
});

test('a sample capture says it came from the sample, not from a keystroke', () => {
  // A small lie in the one place the app keeps its history is still a lie in the
  // history. `sample` is a named source for exactly this reason.
  const { events } = built();
  for (const e of events.filter(x => x.kind === 'capture.recorded')) {
    assert.equal((e.payload as { source: string }).source, 'sample');
  }
});

// --- the ready item is ready TODAY, in the reader's own day ------------------

test('the thing it offers first is dated today in the local day, not in UTC', () => {
  const { state } = built();
  const up = nextUp(state, NOW, DENVER);
  const clock = up.head?.node.clocks.due ?? up.head?.node.clocks.start;
  assert.ok(clock);
  assert.equal(localDayKey(clock.at, DENVER), localDayKey(NOW, DENVER));
});

// --- words ------------------------------------------------------------------

test('what it says before loading is honest about it being indistinguishable after', () => {
  const { events } = built();
  const w = sampleWords(sampleSummary(events));
  assert.match(w, /beside anything you already have/);
  assert.match(w, /\d+ sample things/);
  for (const bad of ['demo', 'fake', 'dummy', 'test data', 'reset', 'wipe', 'delete']) {
    assert.doesNotMatch(w, new RegExp(bad, 'i'), `"${w}" says "${bad}"`);
  }
});

test('nothing in the content is trigger-list material or a personality', () => {
  // The published trigger lists are copyrighted, and this app's voice is civilian
  // and adult — never childlike, never diagnosis-flavoured.
  const { events } = built();
  const text = JSON.stringify(events).toLowerCase();
  for (const bad of [
    'getting things done', 'gtd', 'next actions list', 'tickler',
    'anxious', 'overwhelm', 'adhd', 'executive function', 'streak', 'reward',
    'mission', 'deploy', 'target', 'campaign',
  ]) {
    assert.equal(text.includes(bad), false, `the sample content contains "${bad}"`);
  }
});
