// Folding a duplicate (1.7.0, ADR-0053): the carry rules, the way back, the
// twins range, and the legality of targets. The load-bearing property: a fold
// never swallows a date, a note, a person, or a child.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fold, emptyState, noteOf, type State } from '../src/fold.ts';
import { admit, gateOptionsFor, silentNodes, heldNodes } from '../src/gate.ts';
import { legalMergeTargets, mergeEvents, unmergeEvents, foldedInto } from '../src/ui/merge-intents.ts';
import { sharingAName, rangeChoices } from '../src/range.ts';
import { noteEvents } from '../src/ui/detail-intents.ts';
import type { AppEvent } from '../src/events.ts';
import type { StampContext } from '../src/ui/session.ts';

const TZ = 'America/Denver';
const NOW = '2026-07-29T18:00:00.000Z';
const OPTS = gateOptionsFor(TZ);

let seq = 0;
const ev = (kind: string, node: string | null, payload: unknown): AppEvent =>
  ({ id: `e${seq}`, vault: 'personal', at: NOW, device: 'd0', seq: seq++, kind, node, payload } as AppEvent);
const ctx = (): StampContext => ({
  at: NOW, device: 'd0', vault: 'personal', zone: TZ,
  seq: () => seq++, id: () => `i${seq}`,
});
const write = (prior: State, offered: AppEvent[]): State =>
  fold(admit(offered, prior, OPTS), prior);
const imported = (prior: State, id: string, title: string, parent?: string): State =>
  write(prior, [ev('node.created', id, {
    nodeKind: 'action', title, provenance: { for: 'self' }, ...(parent ? { parent } : {}),
  })]);

// The name of this test used to be "…— nothing swallowed", and it asserted
// exactly the four things the 1.7.0 carry list carried, because in 1.7.0 those
// four WERE everything. It therefore shared its blind spot precisely with the
// code it guarded: `notNow`, `decisions`, `feeds` and `leadDays` all arrived
// later and none of them made this test go red. A test that NAMES its coverage
// can only ever guard what somebody remembered to name. The promise now lives
// in `merge-carry: every NodeState field is named in the fold's disposition`
// (test/audit-regressions.test.ts), which cannot go stale — so this one keeps
// its assertions and gives up the claim (1.9.2, F-H).
test('a fold carries the date, the note, the people, and the children', () => {
  let s = emptyState();
  s = imported(s, 'DUP', 'call the dentist');
  s = imported(s, 'KEEP', 'call the dentist');
  s = write(s, [ev('clock.set', 'DUP', { clockKind: 'due', at: '2026-08-09T12:00:00.000Z', source: 't' })]);
  s = write(s, noteEvents(ctx(), 'DUP', 'ask about the crown'));
  s = write(s, [ev('person.created', 'ADA', { name: 'Ada' })]);
  s = write(s, [ev('person.linked', 'DUP', { node: 'DUP', person: 'ADA', relation: 'waiting-on' })]);
  s = imported(s, 'CHILD', 'a sub-step', 'DUP');

  const batch = mergeEvents(ctx(), s, s.nodes.get('DUP')!, s.nodes.get('KEEP')!);
  s = write(s, batch);

  const keep = s.nodes.get('KEEP')!;
  assert.equal(keep.clocks.due?.at, '2026-08-09T12:00:00.000Z', 'the hard date survived (law 3)');
  assert.equal(noteOf(keep), 'ask about the crown', 'the note survived');
  assert.ok(keep.people.some(p => p.person === 'ADA' && p.relation === 'waiting-on'), 'the person survived');
  assert.equal(s.nodes.get('CHILD')!.parent, 'KEEP', 'the child re-homed to the survivor');
  assert.equal(s.nodes.get('DUP')!.mergedInto, 'KEEP', 'and the duplicate folded');
  assert.equal(silentNodes(s).length, 0, 'the gate held throughout');
  // The bare-merge defects this batch exists to prevent:
  assert.ok(!heldNodes(s).some(n => n.id === 'DUP'), 'the duplicate is off every surface');
  assert.deepEqual(foldedInto(s, 'KEEP').map(n => n.id), ['DUP'], 'and the survivor lists it');
});

test('a fold defers to the survivor: its own date and note are never overwritten, notes join', () => {
  let s = emptyState();
  s = imported(s, 'DUP', 'twin');
  s = imported(s, 'KEEP', 'twin');
  s = write(s, [ev('clock.set', 'DUP', { clockKind: 'due', at: '2026-08-20T12:00:00.000Z', source: 't' })]);
  s = write(s, [ev('clock.set', 'KEEP', { clockKind: 'due', at: '2026-08-09T12:00:00.000Z', source: 't' })]);
  s = write(s, noteEvents(ctx(), 'DUP', 'the twin’s words'));
  s = write(s, noteEvents(ctx(), 'KEEP', 'the survivor’s words'));
  s = write(s, mergeEvents(ctx(), s, s.nodes.get('DUP')!, s.nodes.get('KEEP')!));
  const keep = s.nodes.get('KEEP')!;
  assert.equal(keep.clocks.due?.at, '2026-08-09T12:00:00.000Z', 'the survivor’s date stands');
  assert.equal(noteOf(keep), 'the survivor’s words\n\nthe twin’s words',
    'both notes speak — the merge decides for neither');
});

test('UNMERGE: split back out, covered again, and the survivor stops listing it', () => {
  let s = emptyState();
  s = imported(s, 'DUP', 'twin');
  s = imported(s, 'KEEP', 'twin');
  s = write(s, mergeEvents(ctx(), s, s.nodes.get('DUP')!, s.nodes.get('KEEP')!));
  s = write(s, unmergeEvents(ctx(), 'DUP'));
  const dup = s.nodes.get('DUP')!;
  assert.equal(dup.mergedInto, null, 'its own thing again');
  assert.ok(Object.keys(dup.clocks).length > 0, 'and covered — the gate cured the split');
  assert.equal(silentNodes(s).length, 0);
  assert.deepEqual(foldedInto(s, 'KEEP'), [], 'the survivor’s list is empty again');
});

test('unmerge LWW converges across devices on the later decision', () => {
  let s = emptyState();
  s = imported(s, 'A', 'a');
  s = imported(s, 'B', 'b');
  const merge = admit(mergeEvents(ctx(), s, s.nodes.get('A')!, s.nodes.get('B')!), s, OPTS);
  const split = { ...ev('node.unmerged', 'A', {}), at: '2026-07-29T19:00:00.000Z', device: 'ipad' } as AppEvent;
  const remerge = { ...ev('node.merged', 'A', { into: 'B' }), at: '2026-07-29T20:00:00.000Z', device: 'phone' } as AppEvent;
  const one = fold([...genesis(), ...merge, split, remerge]);
  const two = fold([...genesis(), ...merge, remerge, split]);
  assert.equal(one.nodes.get('A')!.mergedInto, 'B', 'the later merge wins');
  assert.equal(two.nodes.get('A')!.mergedInto, 'B', 'whatever order the shards arrive in');

  function genesis(): AppEvent[] {
    // The two imports and their gate cures, as fold-level fixtures.
    return [
      { id: 'g1', vault: 'personal', at: NOW, device: 'd0', seq: 9000,
        kind: 'node.created', node: 'A', payload: { nodeKind: 'action', title: 'a', provenance: { for: 'self' } } } as AppEvent,
      { id: 'g1~cure~A', vault: 'personal', at: NOW, device: 'd0', seq: 9000,
        kind: 'clock.set', node: 'A', payload: { clockKind: 'review', at: '2026-07-30T05:59:59.000Z', source: 'gate:node.created' } } as AppEvent,
      { id: 'g2', vault: 'personal', at: NOW, device: 'd0', seq: 9001,
        kind: 'node.created', node: 'B', payload: { nodeKind: 'action', title: 'b', provenance: { for: 'self' } } } as AppEvent,
      { id: 'g2~cure~B', vault: 'personal', at: NOW, device: 'd0', seq: 9001,
        kind: 'clock.set', node: 'B', payload: { clockKind: 'review', at: '2026-07-30T05:59:59.000Z', source: 'gate:node.created' } } as AppEvent,
    ];
  }
});

test('LEGALITY: never itself, never its own descendant, people only with people', () => {
  let s = emptyState();
  s = write(s, [ev('node.created', 'P', { nodeKind: 'project', title: 'p' })]);
  s = imported(s, 'A', 'under p', 'P');
  s = write(s, [ev('person.created', 'ADA', { name: 'Ada' })]);
  s = write(s, [ev('person.created', 'BEA', { name: 'Bea' })]);
  const forP = legalMergeTargets(s, s.nodes.get('P')!).map(n => n.id);
  assert.ok(!forP.includes('P'), 'never itself');
  assert.ok(!forP.includes('A'), 'never its own descendant — a thing is not the same as a part of itself');
  assert.ok(!forP.includes('ADA'), 'work never folds into a person');
  const forAda = legalMergeTargets(s, s.nodes.get('ADA')!).map(n => n.id);
  assert.deepEqual(forAda, ['BEA'], 'a person folds only into a person');
});

test('THE TWINS RANGE: exact normalized name-sharing, in the picker, never fuzzy', () => {
  let s = emptyState();
  s = imported(s, 'A', 'Call the dentist');
  s = imported(s, 'B', 'call the  Dentist');   // case and spacing fold together
  s = imported(s, 'C', 'call the doctor');     // merely similar — NOT a twin
  const twins = sharingAName(s).map(n => n.id).sort();
  assert.deepEqual(twins, ['A', 'B'], 'exact normalized equality only');
  const choice = rangeChoices(() => s, () => NOW).find(c => c.key === 'twins');
  assert.ok(choice, 'the picker offers it');
  assert.equal(choice!.count, 2);
  assert.equal(choice!.family, 'runway', 'twins take the six routes and the sheet’s fold verb');
});
