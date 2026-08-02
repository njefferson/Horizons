// What "held" means (1.15.1, ADR-0066).
//
// The gauge says "N held". The list under it itemises that claim. The todo list
// is what you actually work from. Between 1.13.0 and 1.15.1 those were THREE
// different sets, because the exclusions were hand-written inside `heldGroups`
// and the gauge did not have them — so a journal entry, which has no title by
// design, was itemised in the coverage list as "(untitled) — held".
//
// These tests pin the equality, and they pin the thing that must NOT follow
// from it: `silent` still runs over every node, because a proof that skips a
// kind proves nothing.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { admit, coverageGauge, heldNodes, heldWork, silentNodes } from '../src/gate.ts';
import { heldGroups, undatedCount } from '../src/held.ts';
import { searchHeld } from '../src/search.ts';
import { fold, emptyState, type State } from '../src/fold.ts';
import type { AppEvent } from '../src/events.ts';

const TZ = 'America/Denver';
const NOW = '2026-08-02T18:00:00.000Z';

let n = 0;
const ev = (kind: string, node: string | null, payload: unknown, over: Partial<AppEvent> = {}): AppEvent => ({
  id: (over.id as string) ?? `h${n++}`, vault: 'personal',
  at: (over.at as string) ?? '2026-08-02T12:00:00.000Z',
  device: 'd0', seq: (over.seq as number) ?? n, kind, node, payload,
} as AppEvent);
const write = (prior: State, offered: AppEvent[]): State => fold(admit(offered, prior), prior);

/** One of each thing that is held and is not work, beside one thing that is. */
function mixed(): State {
  let s = write(emptyState(), [
    ev('node.created', 'W', { nodeKind: 'action', title: 'ring the plumber' }),
  ]);
  // A journal entry: demand-free, and deliberately titleless (ADR-0061).
  s = write(s, [ev('node.created', 'J', { nodeKind: 'journal', title: '' })]);
  s = write(s, [ev('journal.entry.written', 'J', { v: 1, iv: 'aa', ct: 'Q1lQSEVSVEVYVA' })]);
  // A pebble: weight, with a title, and never a task (ADR-0014/0065).
  s = write(s, [ev('node.created', 'P', { nodeKind: 'pebble', title: 'the thing with the roof' })]);
  s = write(s, [ev('pebble.raised', 'P', { magnitude: 'rock', affects: [] })]);
  return s;
}

test('held-means: the gauge, the list it itemises, and the todo list are ONE set', () => {
  const s = mixed();
  const gauge = coverageGauge(s);
  const itemised = heldWork(s);                                   // the coverage list's rows
  const grouped = heldGroups(s, NOW, TZ).flatMap(g => g.items);   // the todo list's rows

  assert.equal(gauge.total, itemised.length,
    'the number and the list it invites you to open are one claim');
  assert.equal(gauge.total, grouped.length,
    'and the list you work from is the same claim again');
  assert.deepEqual(
    [...grouped.map(x => x.id)].sort(),
    [...itemised.map(x => x.id)].sort(),
    'the same nodes, not merely the same count',
  );
  assert.deepEqual(itemised.map(x => x.id), ['W'], 'and it is the work');
});

test('held-means: a journal entry appears in none of the three', () => {
  const s = mixed();
  assert.ok(!heldWork(s).some(x => x.id === 'J'), 'not itemised by the coverage list');
  assert.ok(!heldGroups(s, NOW, TZ).flatMap(g => g.items).some(x => x.id === 'J'),
    'and not a row in the todo list');
  // The defect this release exists for: it has no title, so it rendered as
  // "(untitled) — held" in the one list the gauge invites you to open.
  assert.equal(s.nodes.get('J')!.title, '', 'it has no title, by design');
});

test('held-means: a pebble is held, is not work, and is not searchable', () => {
  const s = mixed();
  assert.ok(heldNodes(s).some(x => x.id === 'P'), 'still a node you are holding — nothing is hidden');
  assert.ok(!heldWork(s).some(x => x.id === 'P'), 'but not work');
  // Search excludes it for a reason of its own: a result row is a door to a
  // detail sheet built for work, every verb of which the gate must then refuse
  // on a demand-free kind. Offered-then-refused (the 1.9.2 audit's F-B).
  assert.equal(searchHeld(s, 'roof').total, 0, 'and search does not offer a door it cannot open');
  assert.equal(searchHeld(s, 'plumber').total, 1, 'while real work is still findable');
});

test('held-means: `silent` is NOT narrowed — the proof runs over every node', () => {
  const s = mixed();
  // Both kinds are demand-free, so they satisfy law 1 without a clock. The
  // point is that they were CHECKED, not that they were skipped: excluding a
  // kind from a proof is how law 1 gets defined away (the 1.3.1 merged-node
  // finding), and it is why `silentNodes` reads `state.nodes` directly.
  assert.equal(coverageGauge(s).silent, 0, 'nothing is silent');
  assert.equal(silentNodes(s).length, 0);
  assert.equal(heldNodes(s).length, 3, 'and all three are still held');
  assert.equal(coverageGauge(s).total, 1, 'while one of them is work');
});

test('held-means: "you have not decided about these yet" counts only work', () => {
  // A pebble has no date BY CONSTRUCTION — the gate refuses a clock on a
  // demand-free kind — so counting one here would say "undecided" about the one
  // kind in the app there is nothing to decide about.
  const s = mixed();
  assert.equal(undatedCount(s, NOW, TZ), 1, 'the plumber, and nothing else');
});

test('held-means: a spent resume card is not work, and this is where that lives now', () => {
  // Moved out of `heldGroups` in 1.15.1. It has been true since the tier
  // existed; it was true in one projection and false in the gauge.
  let s = write(emptyState(), [ev('node.created', 'R', { nodeKind: 'resume-card', title: 'where you left off' })]);
  assert.equal(coverageGauge(s).total, 1, 'an unspent card is a thread to pick back up');
  s = write(s, [ev('resume.card.spent', 'R', {})]);
  assert.equal(coverageGauge(s).total, 0, 'a spent one is residue');
  assert.equal(heldGroups(s, NOW, TZ).flatMap(g => g.items).length, 0, 'and the two agree');
});
