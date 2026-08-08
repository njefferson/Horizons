// The equivalence property's event generator, extracted from
// admit-equivalence.test.ts in 1.9.2 so a second test can assert its COVERAGE.
//
// The extraction is the point. The generator emitted only 1.3.x-era kinds, so
// every gate branch added since — most importantly `node.unmerged`, the one
// change the gate has had since the oracle was frozen — was never exercised by
// the 150-seed property. The gate's strongest test had a blind spot exactly
// where the gate last changed, and nothing could see it because the list of
// what the generator produced was not written down anywhere.
//
// `GENERATED_KINDS` is that list, and `oracle-nouns:` in
// audit-regressions.test.ts pins SILENT_RISK_KINDS as a subset of it.

import { gateOptionsFor } from '../src/gate.ts';
import { admitReference } from './admit-reference.ts';
import { fold, emptyState, type State } from '../src/fold.ts';
import type { AppEvent } from '../src/events.ts';

export const OPTS = gateOptionsFor('America/Denver');
export const AT = '2026-07-28T14:00:00.000Z';

export let seq = 1000;
export const resetSeq = (v: number): void => { seq = v; };
export const nextSeq = (): number => seq++;
export const ev = (kind: string, node: string | null, payload: unknown): AppEvent =>
  ({ id: `g${seq}`, vault: 'personal', at: AT, device: 'd0', seq: seq++, kind, node, payload } as AppEvent);

/** A deterministic, replayable PRNG. */
export const lcg = (seed: number) => () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

/** A prior state with the shapes that matter: clocked containers, children
 *  covered only via ancestry, captures, Menu items, a merged pair, a person,
 *  and a pre-trashed node. Built through the ORACLE so it is gate-legal. */
export function seedState(): State {
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

  // 1.9.2: state for the kinds the generator never produced. Without a node
  // that is actually merged, `node.unmerged` picked uniformly would hit one
  // roughly 3% of the time — which is how the gate's one change since the
  // oracle was frozen went 150 seeds x many batches without being exercised.
  events.push(ev('node.created', 'MRG2', { nodeKind: 'action', title: 'also merged' }));
  events.push(ev('clock.set', 'MRG2', { clockKind: 'review', at: '2026-08-05T12:00:00.000Z', source: 't' }));
    // P3/P4, deliberately: the hand-written tests below trash P0 and P1, and a
  // fixture that changes what those trashes orphan would rewrite their meaning.
  events.push(ev('node.merged', 'MRG2', { into: 'P3' }));
  // A node that has ALREADY been split back out, so unmerge-then-remerge is
  // reachable from the base rather than only within one batch.
  events.push(ev('node.created', 'SPLIT', { nodeKind: 'action', title: 'split back out' }));
  events.push(ev('clock.set', 'SPLIT', { clockKind: 'review', at: '2026-08-05T12:00:00.000Z', source: 't' }));
  events.push(ev('node.merged', 'SPLIT', { into: 'P4' }));
  events.push(ev('node.unmerged', 'SPLIT', {}));
  // A standing decline with its park, a second Menu category, a decision, a
  // stakeholder, a chosen-for-today, an enabled module and a request slot.
  events.push(ev('node.created', 'DEC', { nodeKind: 'action', title: 'someone asked' }));
  events.push(ev('request.declined', 'DEC', { person: 'PER', what: 'someone asked', reason: 'detail' }));
  events.push(ev('park.set', 'DEC', { returnAt: '2026-08-09T12:00:00.000Z', reason: 'not-now-ledger' }));
  events.push(ev('node.created', 'M1', { nodeKind: 'action', title: 'second wish' }));
  events.push(ev('menu.item.added', 'M1', { category: 'watch' }));
  events.push(ev('node.created', 'TOD', { nodeKind: 'action', title: 'chosen today' }));
  events.push(ev('clock.set', 'TOD', { clockKind: 'due', at: '2026-08-05T12:00:00.000Z', source: 't' }));
  events.push(ev('today.chosen', 'TOD', { day: '2026-07-28' }));
  events.push(ev('decision.logged', 'P0', { text: 'a decision', at: AT }));
  events.push(ev('stakeholder.added', 'P5', { person: 'PER' }));
  events.push(ev('module.enabled', null, { module: 'today' }));
  events.push(ev('request.slot.set', null, { recurrence: 'weekly:thu' }));
  return fold(admitReference(events, emptyState(), OPTS));
}

const IDS = (s: State): string[] => [...s.nodes.keys()];

/** One random event aimed at the state — including illegal shapes on purpose,
 *  because rejection parity is half the contract. */
export function randomEvent(rnd: () => number, s: State, fresh: () => string): AppEvent {
  const ids = IDS(s);
  const pick = (): string => ids[Math.floor(rnd() * ids.length)]!;
  // The 1.3.x-era shapes keep their RELATIVE weights and their original
  // thresholds; one draw decides whether this event comes from that era at all
  // (70%) or from the post-1.3 nouns below (30%). Re-normalising into 0..1
  // rather than scaling the thresholds keeps every original branch reachable —
  // scaling the ROLL instead made the whole post-1.3 block dead code, which the
  // coverage belt in `oracle-nouns:` caught immediately. That is the test
  // earning its keep on the very first run.
  const draw = rnd();
  const roll = draw < 0.7 ? draw / 0.7 : 2;
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
  if (roll < 0.89) return ev('node.kind.changed', pick(), { from: 'action', to: rnd() < 0.5 ? 'aspiration' : 'waiting-for' });
  if (roll < 0.92) return ev('node.untrashed', pick(), {});
  if (roll < 0.94) return ev('clarify.routed', pick(), { route: 'next-action' });
  // Ghost-minting shapes (1.3.1): ensureNode creates on first touch whatever
  // the kind, so each of these can mint an UNCOVERED node the silent check has
  // to find — via a non-silent-risk kind, via a silent-risk kind whose own cure
  // adopts it, and via a payload reference rather than the event's node.
  if (roll < 0.96) return ev('heat.set', fresh(), { heat: rnd() < 0.5 ? 'hot' : 'cold' });
  if (roll < 0.98) return ev('clarify.routed', fresh(), { route: rnd() < 0.5 ? 'next-action' : 'someday' });
  if (roll <= 1) return ev('person.linked', pick(), { node: fresh(), person: 'PER', relation: 'helper' });

  // ── Everything the gate learned after the oracle was frozen (1.9.2). Each
  // one exercises a branch the 150-seed property had never reached.
  const post = rnd();
  // The ONE gate change since the oracle: the node.unmerged cure. Its subject
  // is drawn from nodes that are ACTUALLY merged — picking uniformly over ~40
  // ids would reach one a few percent of the time, which is not coverage.
  if (post < 0.14) {
    const merged = [...s.nodes.values()].filter(n => n.mergedInto).map(n => n.id);
    return ev('node.unmerged', merged.length > 0 ? merged[Math.floor(rnd() * merged.length)]! : pick(), {});
  }
  // The only silent-risk kind whose cure is NOT a clock.set — the gate answers
  // it with park.set{reason:'not-now-ledger'}, and it had never been generated.
  if (post < 0.26) return ev('request.declined', pick(), { person: rnd() < 0.5 ? 'PER' : null, what: 'a favour', reason: 'detail' });
  if (post < 0.36) return ev('park.set', pick(), { returnAt: '2026-08-09T12:00:00.000Z', reason: 'not-now-ledger' });
  if (post < 0.45) return ev('suspense.set', pick(), { at: '2026-08-09T12:00:00.000Z' });
  if (post < 0.54) return ev('menu.item.promoted', pick(), { toKind: 'action' });
  if (post < 0.62) return ev('decision.logged', rnd() < 0.7 ? pick() : fresh(), { text: 'a decision', at: AT });
  if (post < 0.70) return ev('stakeholder.added', pick(), { node: pick(), person: rnd() < 0.8 ? 'PER' : fresh() });
  // Refused-not-guessed: a remove carrying no person is a no-op, never a
  // remove-all, and the two admits must agree about that.
  if (post < 0.76) return ev('stakeholder.removed', pick(), { person: rnd() < 0.8 ? 'PER' : undefined });
  if (post < 0.82) return ev('today.chosen', pick(), { day: '2026-07-28' });
  if (post < 0.86) return ev('today.released', pick(), { day: '2026-07-28' });
  // `node: null` events — the accumulator's null-node path, which nothing in
  // the 1.3.x generator ever took.
  if (post < 0.90) return ev('module.enabled', null, { module: 'today' });
  if (post < 0.94) return ev('module.disabled', null, { module: 'today' });
  if (post < 0.965) return ev('request.slot.set', null, { recurrence: rnd() < 0.8 ? 'weekly:thu' : 'weekly:xxx' });

  // ── The remaining SILENT-RISK kinds. The coverage pin found eight more the
  // generator had never produced, which makes F-F wider than "one missing
  // noun": these are kinds the GATE has an opinion about, compared against the
  // oracle exactly never.
  const risk = rnd();
  if (risk < 0.13) return ev('replan.resolved', pick(), { choice: 'new-date' });
  if (risk < 0.26) return ev('clarify.reopened', pick(), { from: 'next-action' });
  if (risk < 0.39) return ev('bother.received', rnd() < 0.6 ? pick() : fresh(), { text: 'a worry' });
  if (risk < 0.52) return ev('bother.owned', pick(), { ownership: 'mine-to-solve' });
  if (risk < 0.64) return ev('interrupt.captured', fresh(), { text: 'an interruption', duringFocus: rnd() < 0.5 ? pick() : null });
  if (risk < 0.76) return ev('waiting.closed', pick(), { outcome: 'arrived' });
  if (risk < 0.80) return ev('dependency.released', pick(), { feeds: pick() });
  // The 1.30.0 anchor, both halves. Drawn against `pick()` on both sides on
  // purpose: most draws are refusals — already done, demand-free, a loop, the
  // node itself — and the two admits must agree on WHICH refusal, not merely
  // that something was refused.
  if (risk < 0.83) return ev('after.set', pick(), { after: rnd() < 0.9 ? pick() : 'MISSING' });
  if (risk < 0.86) return ev('after.cleared', pick(), {});
  // Putting a thing down (1.32.0). Drawn against `pick()` on both sides: the
  // interesting case is a PARENT being put down, which strips its children's
  // coverage at a distance — the same shape as trashing one, and the reason
  // this is a silent-risk kind at all.
  if (risk < 0.89) return ev('node.released', pick(), { at: AT });
  if (risk < 0.92) return ev('node.reclaimed', pick(), {});
  if (risk < 0.90) return ev('project.role.set', pick(), { role: rnd() < 0.5 ? 'execute' : 'track' });
  // A SHAPE rejection rather than a missing-reference one: every rejection the
  // property saw before came from a `MISSING` id, so the two admits' shape
  // branches were only ever compared where they happened to agree.
  return ev('node.field.set', pick(), rnd() < 0.5
    ? { field: 'note', value: 't' }
    : { field: '__proto__', value: {} });
}

/**
 * Every kind `randomEvent` can produce. Pinned against the gate's own
 * SILENT_RISK_KINDS so the generator can never silently fall behind the gate
 * again — which is the actual defect, not any one missing noun.
 */
export const GENERATED_KINDS: readonly string[] = [
  'node.created', 'capture.recorded', 'node.trashed', 'node.parented', 'node.unparented',
  'clock.cleared', 'clock.set', 'done.marked', 'menu.item.added', 'menu.item.removed',
  'node.merged', 'node.kind.changed', 'node.untrashed', 'clarify.routed', 'heat.set',
  'person.linked',
  'node.unmerged', 'request.declined', 'park.set', 'suspense.set', 'menu.item.promoted',
  'decision.logged', 'stakeholder.added', 'stakeholder.removed', 'today.chosen',
  'today.released', 'module.enabled', 'module.disabled', 'request.slot.set',
  'replan.resolved', 'clarify.reopened', 'bother.received', 'bother.owned',
  'interrupt.captured', 'waiting.closed', 'dependency.released', 'project.role.set',
  'node.field.set',
  'after.set', 'after.cleared',
  'node.released', 'node.reclaimed',
];

