// The reworked admit, held to the old one — event-for-event.
//
// The rework (1.3.0) replaced per-event whole-batch refolds with one running
// accumulator and a dirty-set silent check. Its correctness claim is exactly
// this: for ANY batch against ANY prior state, it returns what the old control
// flow returned — the same events, in the same order, cures included — or
// rejects where the old one rejected, for the same reason. The old flow lives
// verbatim in test/admit-reference.ts as the oracle.
//
// The generator is SEEDED (a plain LCG), so a failure prints its seed and
// replays exactly. No Math.random: a property test that cannot be replayed is
// a rumour, not a counterexample.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { admit, gateOptionsFor } from '../src/gate.ts';
import { admitReference } from './admit-reference.ts';
import { applyEvent, cloneShell, fold, emptyState, type State } from '../src/fold.ts';
import type { AppEvent, NodeId } from '../src/events.ts';

const OPTS = gateOptionsFor('America/Denver');
const AT = '2026-07-28T14:00:00.000Z';

let seq = 1000;
const ev = (kind: string, node: string | null, payload: unknown): AppEvent =>
  ({ id: `g${seq}`, vault: 'personal', at: AT, device: 'd0', seq: seq++, kind, node, payload } as AppEvent);

/** A deterministic, replayable PRNG. */
const lcg = (seed: number) => () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

/** A prior state with the shapes that matter: clocked containers, children
 *  covered only via ancestry, captures, Menu items, a merged pair, a person,
 *  and a pre-trashed node. Built through the ORACLE so it is gate-legal. */
function seedState(): State {
  const events: AppEvent[] = [];
  for (let i = 0; i < 6; i++) {
    events.push(ev('node.created', `P${i}`, { nodeKind: 'project', title: `proj ${i}` }));
    events.push(ev('clock.set', `P${i}`, { clockKind: 'review', at: '2026-08-05T12:00:00.000Z', source: 't' }));
    for (let c = 0; c < 3; c++) {
      events.push(ev('node.created', `P${i}C${c}`, { nodeKind: 'action', title: `child ${i}.${c}`, parent: `P${i}` }));
    }
  }
  for (let i = 0; i < 5; i++) {
    events.push(ev('capture.recorded', `X${i}`, { text: `capture ${i}`, source: 'quick', sourceTags: [] }));
  }
  events.push(ev('node.created', 'M0', { nodeKind: 'action', title: 'menu thing' }));
  events.push(ev('menu.item.added', 'M0', { category: 'read' }));
  events.push(ev('person.created', 'PER', { name: 'Ada' }));
  events.push(ev('node.created', 'MRG', { nodeKind: 'action', title: 'merged away' }));
  events.push(ev('clock.set', 'MRG', { clockKind: 'review', at: '2026-08-05T12:00:00.000Z', source: 't' }));
  events.push(ev('node.merged', 'MRG', { into: 'P0' }));
  events.push(ev('node.created', 'TR', { nodeKind: 'action', title: 'already gone' }));
  events.push(ev('node.trashed', 'TR', { reason: 't' }));
  return fold(admitReference(events, emptyState(), OPTS));
}

const IDS = (s: State): string[] => [...s.nodes.keys()];

/** One random event aimed at the state — including illegal shapes on purpose,
 *  because rejection parity is half the contract. */
function randomEvent(rnd: () => number, s: State, fresh: () => string): AppEvent {
  const ids = IDS(s);
  const pick = (): string => ids[Math.floor(rnd() * ids.length)]!;
  const roll = rnd();
  if (roll < 0.10) return ev('node.created', fresh(), { nodeKind: rnd() < 0.5 ? 'action' : 'project', title: 't' });
  if (roll < 0.18) return ev('node.created', fresh(), { nodeKind: 'action', title: 't', parent: pick() });
  if (roll < 0.26) return ev('capture.recorded', fresh(), { text: 't', source: 'quick', sourceTags: [] });
  if (roll < 0.36) return ev('node.trashed', pick(), { reason: 't' });
  if (roll < 0.44) return ev('node.parented', pick(), { parent: rnd() < 0.85 ? pick() : 'MISSING' });
  if (roll < 0.50) return ev('node.unparented', pick(), { priorParent: pick() });
  if (roll < 0.56) return ev('clock.cleared', pick(), { clockKind: 'review' });
  if (roll < 0.62) return ev('clock.set', pick(), { clockKind: 'due', at: '2026-08-09T12:00:00.000Z', source: 't' });
  if (roll < 0.68) return ev('done.marked', pick(), { at: AT });
  if (roll < 0.74) return ev('menu.item.added', pick(), { category: 'read' });
  if (roll < 0.79) return ev('menu.item.removed', pick(), { from: 'read' });
  if (roll < 0.85) return ev('node.merged', pick(), { into: rnd() < 0.85 ? pick() : 'MISSING' });
  if (roll < 0.90) return ev('node.kind.changed', pick(), { from: 'action', to: rnd() < 0.5 ? 'aspiration' : 'waiting-for' });
  if (roll < 0.95) return ev('node.untrashed', pick(), {});
  return ev('clarify.routed', pick(), { route: 'next-action' });
}

/**
 * The one KNOWN, DELIBERATE divergence from the old control flow: the old admit
 * emitted cures at merge-silenced nodes — junk events, because isSilent rides
 * the merge chain before it ever looks at clocks, so those cures cured nothing
 * (it then re-emitted one per subsequent silent-risk event, forever). The
 * rework skips them and lets the shared whole-batch belt own the case. So the
 * oracle's output is compared AFTER dropping exactly those cures: a `~cure~`
 * event whose target was merged at the moment of emission. Everything else is
 * required to match event-for-event.
 */
function stripJunkCures(oracleOut: readonly AppEvent[], prior: State): AppEvent[] {
  const s = cloneShell(prior);
  const touched = new Set<NodeId>();
  const kept: AppEvent[] = [];
  for (const e of oracleOut) {
    const target = e.node ? s.nodes.get(e.node) : undefined;
    if (e.id.includes('~cure~') && target?.mergedInto) continue;   // junk: skip, don't apply
    kept.push(e);
    applyEvent(s, e, touched);
  }
  return kept;
}

test('PROPERTY: reworked admit answers event-for-event what the old admit answered', () => {
  const prior = seedState();
  let checked = 0;
  let rejectionsSeen = 0;
  for (let seed = 1; seed <= 150; seed++) {
    const rnd = lcg(seed);
    let freshN = 0;
    const fresh = (): string => `F${seed}-${freshN++}`;
    const len = 1 + Math.floor(rnd() * 20);
    // Both sides must see IDENTICAL events — the generator runs once.
    seq = 5000 + seed * 100;
    const batch: AppEvent[] = [];
    for (let i = 0; i < len; i++) batch.push(randomEvent(rnd, prior, fresh));

    let oldOut: AppEvent[] | null = null; let oldErr: Error | null = null;
    let newOut: AppEvent[] | null = null; let newErr: Error | null = null;
    try { oldOut = admitReference(batch, prior, OPTS); } catch (e) { oldErr = e as Error; }
    try { newOut = admit(batch, prior, OPTS); } catch (e) { newErr = e as Error; }

    if (oldErr || newErr) {
      assert.ok(oldErr && newErr, `seed ${seed}: one rejected, the other did not (old: ${oldErr?.message ?? 'ok'}; new: ${newErr?.message ?? 'ok'})`);
      assert.equal(newErr.message, oldErr.message, `seed ${seed}: different rejection reasons`);
      rejectionsSeen++;
    } else {
      assert.deepEqual(newOut, stripJunkCures(oldOut!, prior), `seed ${seed}: outputs differ`);
      // And the folded outcomes agree — belt on the belt. (Node SETS, which the
      // junk cures never changed: they were clocks on nodes whose silence rode
      // the merge chain.)
      assert.deepEqual(
        [...fold(newOut!, prior).nodes.keys()],
        [...fold(oldOut!, prior).nodes.keys()],
        `seed ${seed}: folded node sets differ`);
    }
    checked++;
  }
  assert.equal(checked, 150);
  // A property run that never exercised a rejection proved half the contract.
  assert.ok(rejectionsSeen > 10, `only ${rejectionsSeen} rejection cases arose — generator too tame`);
});

test('multi-casualty trash: cures emit in the old order', () => {
  const prior = seedState();
  // Trashing a clocked parent orphans its three unclocked children — three
  // casualties from one event, the dirty-set's ordinary hard case. The oracle
  // defines the answer; the rework must match it exactly, order included.
  seq = 9000;
  const batch = [ev('node.trashed', 'P1', { reason: 't' })];
  const a = admitReference(batch, prior, OPTS);
  seq = 9000;
  const batch2 = [ev('node.trashed', 'P1', { reason: 't' })];
  const b = admit(batch2, prior, OPTS);
  assert.deepEqual(b, a);
  assert.equal(a.length, 4, 'one trash, three cures — the whole family found');
});

test('merge-borne silence: both reject, same belt, and the rework emits no junk cures', () => {
  const prior = seedState();
  // MRG is merged into P0. Trashing P0 silences MRG in a way NO clock can cure
  // (isSilent rides the merge chain before it looks at clocks). The old flow
  // sprayed an ineffective cure and then hit the whole-batch belt; the rework
  // skips the junk and lands on the SAME belt with the SAME words.
  seq = 9100;
  const batch = [ev('node.trashed', 'P0', { reason: 't' })];
  let oldMsg = ''; let newMsg = '';
  try { admitReference(batch, prior, OPTS); } catch (e) { oldMsg = (e as Error).message; }
  seq = 9100;
  const batch2 = [ev('node.trashed', 'P0', { reason: 't' })];
  try { admit(batch2, prior, OPTS); } catch (e) { newMsg = (e as Error).message; }
  assert.match(oldMsg, /MRG/, 'the oracle rejects at the belt');
  assert.equal(newMsg, oldMsg, 'the rework rejects with the identical belt message');
});

test('merge-borne transient silence: saved later in the batch, accepted with ZERO junk cures', () => {
  const prior = seedState();
  // Trash P0 (silencing MRG through the chain), then untrash it — the batch
  // introduces no lasting silence, so it is legal. The old flow accepted it
  // WITH a junk clock on the merged node; the rework accepts it clean.
  seq = 9200;
  const mk = () => [
    ev('node.trashed', 'P0', { reason: 't' }),
    ev('node.untrashed', 'P0', {}),
  ];
  const batch = mk();
  const out = admit(batch, prior, OPTS);
  assert.ok(!out.some(e => e.id.includes('~cure~') && e.node === 'MRG'),
    'no cure aimed at the merge-silenced node');
  // And the belt is satisfied: folding introduces no newly-silent node.
  const final = fold(out, prior);
  assert.equal(final.nodes.get('MRG')!.mergedInto, 'P0', 'the merge chain survived intact');
});

test('a rejected batch leaves the prior state untouched — copy-on-write holds', () => {
  const prior = seedState();
  const snapshot = JSON.stringify([...prior.nodes.entries()]);
  seq = 9500;
  const batch = [
    ev('node.trashed', 'P1', { reason: 't' }),
    ev('node.parented', 'P2C0', { parent: 'MISSING' }),   // rejected mid-batch
  ];
  assert.throws(() => admit(batch, prior, OPTS));
  assert.equal(JSON.stringify([...prior.nodes.entries()]), snapshot,
    'the accumulator mutated nothing the caller can see');
});
