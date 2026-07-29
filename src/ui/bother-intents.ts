// Naming a worry, deciding whose it is, and letting the flow end.
//
// Every noun exists in docs/event-vocabulary.md, and the gate already carries
// cures for all three — *"bother must terminate in a route or a park"*. Nothing
// here invents anything; it was all waiting for a way in.
//
// Each branch below TERMINATES ON ITS OWN, the same principle as the clarify
// routes (ADR-0029) and the replan choices: the answer knows where the thing
// belongs, and a generic cure does not. The gate guarantees coverage while it
// gets there; it does not decide the destination.
//
// These build events; they never touch the store.

import type { AppEvent, NodeKind, Ownership } from '../events.ts';
import type { StampContext } from './session.ts';
import { endOfLocalDay } from '../time.ts';
import { cleanTitle } from './detail-intents.ts';

const base = (ctx: StampContext, kind: string, node: string, payload: unknown): AppEvent => ({
  id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
  kind, node, payload,
} as AppEvent);

/**
 * Put a worry down as a worry.
 *
 * NOT as a task. The whole point is that you can enter "the thing with the roof"
 * without first inventing a next action for it — an invented next action is a lie
 * you then have to live beside on a list you are meant to trust.
 *
 * Silent-risk and gated, so it is clocked in the same transaction: a worry you
 * wrote down and never saw again would be worse than not writing it down, because
 * you would have stopped carrying it on the strength of a promise the app broke.
 */
export function botherEvents(ctx: StampContext, node: string, text: string): AppEvent[] {
  const clean = cleanTitle(text);
  if (!clean) return [];
  return [base(ctx, 'bother.received', node, { text: clean })];
}

/**
 * Whose is it?
 *
 * One event, and it is deliberately separate from what happens next — the
 * ordering is the design. Asking "what will you do about it" first is what makes
 * people invent an answer.
 */
export const ownBotherEvents = (
  ctx: StampContext, node: string, ownership: Ownership,
): AppEvent[] => [base(ctx, 'bother.owned', node, { ownership })];

/**
 * End the flow. Exactly one of these happens, and one of them always does.
 *
 * - **mine-to-solve** — it becomes an ordinary capture, in the inbox, sorted like
 *   anything else. It stops being a worry and starts being work, which is the
 *   only honest way for a worry to become a task: by you saying so.
 * - **mine-to-track** — parked with a return in a week. Nothing to do, and it
 *   comes back once so it is not being carried in your head in the meantime.
 * - **not-mine-to-carry** — let go, with the reason recorded. **No return clock.**
 *   Bringing it back "just to check" would undo the entire point: the relief IS
 *   the feature, and an app that quietly re-raises what you released is an app
 *   that did not believe you.
 */
export function routeBotherEvents(
  ctx: StampContext, node: string, ownership: Ownership,
): AppEvent[] {
  const out: AppEvent[] = [];
  if (ownership === 'mine-to-solve') {
    out.push(base(ctx, 'bother.routed', node, { route: 'inbox' }));
    // It becomes an ordinary action and enters triage like any capture. The kind
    // change is what takes it out of the bother flow and into the one surface
    // that already knows how to ask "what is the actual next step".
    out.push(base(ctx, 'node.kind.changed', node, { from: 'bother' as NodeKind, to: 'action' as NodeKind }));
    out.push(base(ctx, 'clock.set', node, {
      clockKind: 'review', at: endOfLocalDay(ctx.at, ctx.zone, 0), source: 'bother:mine-to-solve',
    }));
    return out;
  }
  if (ownership === 'mine-to-track') {
    out.push(base(ctx, 'bother.routed', node, { park: true }));
    out.push(base(ctx, 'park.set', node, {
      returnAt: endOfLocalDay(ctx.at, ctx.zone, 7), reason: 'bother:mine-to-track',
    }));
    return out;
  }
  // not-mine-to-carry. An explicit end is a decision, not a silence (law 1), so
  // this needs no clock and gets none.
  out.push(base(ctx, 'bother.routed', node, { route: 'let-go' }));
  out.push(base(ctx, 'node.trashed', node, { reason: 'bother:not-mine-to-carry' }));
  return out;
}

/** The two halves in one transaction, which is how the surface commits it: you
 *  answer once and the thing is resolved once. Two round trips would leave a
 *  window in which a worry had an owner and no destination. */
export const answerBotherEvents = (
  ctx: StampContext, node: string, ownership: Ownership,
): AppEvent[] => [
  ...ownBotherEvents(ctx, node, ownership),
  ...routeBotherEvents(ctx, node, ownership),
];
