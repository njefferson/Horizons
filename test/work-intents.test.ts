// A smaller bite (1.24.0).
//
// docs/nd-collisions.md entry 1 — task initiation cost. The design rests
// entirely on one property of the write gate, so that property is what these
// tests are about: a node parented to something under a clock is not silent
// (clause (d)), so the bite needs no clock of its own and never becomes a date
// nobody chose.
//
// Everything below goes through `admit`, not `fold`. The whole question is what
// the GATE does with these events; folding them directly would assert the
// author's intention rather than the boundary's behaviour.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fold, type State } from '../src/fold.ts';
import { admit, isSilent } from '../src/gate.ts';
import { biteEvents } from '../src/ui/work-intents.ts';
import type { AppEvent } from '../src/events.ts';

const TZ = 'America/Denver';
const NOW = '2026-08-05T20:20:00.000Z';

let seq = 0;
const ev = (kind: string, node: string | null, payload: unknown, at = NOW): AppEvent =>
  ({ id: `e${seq}`, vault: 'personal', at, device: 'd0', seq: seq++, kind, node, payload } as AppEvent);
const ctx = { id: () => `b${seq}`, vault: 'personal', at: NOW, device: 'd0', seq: () => seq++, zone: TZ };
const apply = (state: State, events: AppEvent[]): State =>
  events.length === 0 ? state : fold(admit(events, state), state);

/** A parent that is under a clock — which is what every offered item is, since
 *  an arrived clock is why it was offered at all. */
const withClockedParent = (): State => apply(fold([]), [
  ev('node.created', 'P', { nodeKind: 'action', title: 'draft the brief' }),
  ev('clock.set', 'P', { clockKind: 'due', at: NOW, source: 'test' }),
]);

test('THE WHOLE DESIGN: a bite is covered by its parent and takes NO clock', () => {
  // Entry 8 is demand avoidance, and it binds self-imposed demands hardest. A
  // first step that quietly acquired a due date would be a demand somebody made
  // of themselves while trying to get unstuck — and law 3 would bring it back
  // as a replan card whether or not it was ever the right step.
  const s = apply(withClockedParent(), biteEvents(ctx, 'B', 'P', 'open the file'));
  const b = s.nodes.get('B');
  assert.ok(b, 'the bite exists');
  assert.equal(b!.parent, 'P', 'and it is under the thing it belongs to');
  assert.deepEqual(Object.keys(b!.clocks), [], 'and carries no clock of its own');
  assert.equal(isSilent(b!, s), false, 'covered by clause (d), so law 1 holds');
});

test('ONE EVENT, because two would let the gate cure it in between', () => {
  // The trap `fileUnderEvents` records: the gate cures anything a silent-risk
  // event leaves silent, and `node.created` is one. A bare create followed by a
  // separate parenting is evaluated in the gap — where the node is on no
  // surface, under no clock and under no parent — and arrives carrying a
  // same-day review clock. `node.created` takes a parent, so there is no gap.
  const events = biteEvents(ctx, 'B', 'P', 'open the file');
  assert.equal(events.length, 1, 'one event, not two');
  assert.equal(events[0]!.kind, 'node.created');
  assert.equal((events[0]!.payload as { parent?: string }).parent, 'P',
    'the parent rides the creation itself');

  // And the proof of what the split version would have done, through the gate
  // rather than by assertion: create it bare, and a cure clock appears.
  const bare = apply(withClockedParent(), [ev('node.created', 'C', { nodeKind: 'action', title: 'bare' })]);
  assert.notDeepEqual(Object.keys(bare.nodes.get('C')!.clocks), [],
    'a bare create IS cured with a clock — which is exactly what the bite must avoid');
});

test('it is an ordinary action, so every projection already knows how to hold it', () => {
  // No new kind and no new noun. It completes, decays, renders and can be let
  // go like anything else — the reasoning ADR-0042 and ADR-0074 both used.
  const s = apply(withClockedParent(), biteEvents(ctx, 'B', 'P', 'open the file'));
  assert.equal(s.nodes.get('B')!.kind, 'action');

  const done = apply(s, [ev('done.marked', 'B', { at: NOW })]);
  assert.ok(done.nodes.get('B')!.lastDone, 'and it completes');
});

test('empty in, nothing out — a blank name never mints a node', () => {
  for (const bad of ['', '   ', '\n\t ']) {
    assert.deepEqual(biteEvents(ctx, 'B', 'P', bad), [], `"${bad}" writes nothing`);
  }
  // And the degenerate shapes, which would produce a node parented to itself or
  // to nothing — both of which the gate would then have to rescue.
  assert.deepEqual(biteEvents(ctx, 'B', '', 'open the file'), []);
  assert.deepEqual(biteEvents(ctx, 'B', 'B', 'open the file'), []);
});

test('the title is taken as written, minus the whitespace around it', () => {
  const [e] = biteEvents(ctx, 'B', 'P', '  open the file  ');
  assert.equal((e!.payload as { title: string }).title, 'open the file');
});

test('a parent with NO clock cannot cover a bite — the gate says so', () => {
  // The honest limit of clause (d). This cannot arise from the offer, because
  // an item with no arrived clock is never offered — but a parent can lose its
  // clock later, and the gate is what keeps law 1 true when it does.
  const loose = apply(fold([]), [
    ev('node.created', 'Q', { nodeKind: 'action', title: 'no clock' }),
    ev('clock.set', 'Q', { clockKind: 'due', at: NOW, source: 'test' }),
  ]);
  const s = apply(loose, biteEvents(ctx, 'B', 'Q', 'open the file'));
  assert.equal(isSilent(s.nodes.get('B')!, s), false, 'covered while the parent is clocked');

  // Take the parent's clock away and the gate must not leave the child silent.
  const cleared = apply(s, [ev('clock.cleared', 'Q', { clockKind: 'due' })]);
  assert.equal(isSilent(cleared.nodes.get('B')!, cleared), false,
    'law 1 still holds after the cover is removed — the gate cures rather than orphans');
});
