// Saying what is on you (1.15.0, ADR-0065).
//
// Three verbs, and none of them creates work:
//
//   `raisePebbleEvents`   — name a weight, and say how heavy.
//   `settlePebbleEvents`  — it is off you now.
//   `declareCapacityEvents` — how things are, in one of four words.
//
// A pebble is a NODE of kind `pebble`, which is in `DEMAND_FREE_KINDS`, so the
// write gate has refused to put a clock on one since Phase 0 — a year before
// anything could raise one. Nothing here needs a gate change, and that is the
// whole reason this was buildable in an afternoon: the design was finished, the
// schema was finished, and only the consumer was missing.
//
// **Settling does not trash the node.** The weight comes off; the record stays,
// exactly as a completed thing stays. Nothing in this app deletes what happened,
// and a pebble you carried for three weeks is a true thing about those weeks.
//
// These build events; they never touch the store.

import type { AppEvent, Capacity, Magnitude, NodeId } from '../events.ts';
import type { StampContext } from './session.ts';

const base = (ctx: StampContext, kind: string, node: string | null, payload: unknown): AppEvent => ({
  id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
  kind, node, payload,
} as AppEvent);

/**
 * Name a weight.
 *
 * `affects` may be empty and usually will be. Saying "there is a thing with the
 * roof and it is heavy" is complete on its own; requiring you to attach it to
 * work first would be the app insisting that load is only real when it maps
 * onto a task, which is the opposite of why pebbles exist.
 */
export const raisePebbleEvents = (
  ctx: StampContext, id: NodeId, title: string,
  magnitude: Magnitude, affects: readonly NodeId[] = [],
): AppEvent[] => [
  base(ctx, 'node.created', id, { nodeKind: 'pebble', title }),
  base(ctx, 'pebble.raised', id, { magnitude, affects: [...affects] }),
];

/**
 * It is off you.
 *
 * TWO events, and both are needed. `pebble.settled` records that the weight came
 * off — that is the fact worth keeping, and the log viewer can read it back for
 * ever. `node.trashed` takes the node out of what you are holding.
 *
 * The second is not tidiness. A settled pebble appears in NO list — it has left
 * the load entry by definition, and it was never in the todo list — so without
 * it the node is unreachable from every surface while still counting toward the
 * coverage gauge's "held". The number would climb for ever with nothing on any
 * screen to explain it, which is the one-node-two-stories defect this repo has
 * fixed before. The headless walk is what caught it.
 *
 * Nothing is lost. It goes to the trash view with everything else you have let
 * go (ADR-0050), where it can be taken back, and both events stay in the log.
 */
export const settlePebbleEvents = (ctx: StampContext, node: NodeId): AppEvent[] => [
  base(ctx, 'pebble.settled', node, {}),
  base(ctx, 'node.trashed', node, { reason: 'pebble:settled' }),
];

/**
 * How things are, in your own word.
 *
 * State-level, so it is not about any one piece of work. Nothing derives it and
 * nothing scores it — the app has no opinion about your capacity except the one
 * you handed it (law 7).
 */
export const declareCapacityEvents = (ctx: StampContext, level: Capacity): AppEvent[] =>
  [base(ctx, 'capacity.declared', null, { level })];
