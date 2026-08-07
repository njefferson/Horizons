// Coming back: the greeting, and the amnesty (product law 8).
//
// Every noun already exists in docs/event-vocabulary.md. Nothing here invents
// one, and the greeting's payload is the schema's own bound made concrete —
// `shown` has room for exactly Next-up, at most three triage items, and the
// gauge, and there is no shape it could take that shows the backlog.
//
// These build events; they never touch the store.

import type { AppEvent } from '../events.ts';
import type { State } from '../fold.ts';
import type { StampContext } from './session.ts';
import { REENTRY_TRIAGE_CAP } from '../reentry.ts';
import { replanAll } from '../replan.ts';
import { replanEvents } from './replan-intents.ts';
import { demandClocksOf } from './triage-intents.ts';

const base = (ctx: StampContext, kind: string, node: string | null, payload: unknown): AppEvent => ({
  id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
  kind, node, payload,
} as AppEvent);

/**
 * Record that someone came back, and what they were shown.
 *
 * `shown` is written from the CAP, not from what happened to be on screen — the
 * log's job here is to record the guarantee, and a number copied out of the DOM
 * would record whatever a rendering bug did instead.
 */
export function greetEvents(
  ctx: StampContext, absenceDays: number, triageShown: number,
): AppEvent[] {
  return [base(ctx, 'reentry.greeted', null, {
    absenceDays,
    shown: {
      nextUp: true,
      triage: Math.min(Math.max(0, triageShown), REENTRY_TRIAGE_CAP),
      gauge: true,
    },
  })];
}

/**
 * Offer the amnesty. Recorded separately from accepting it, because the offer
 * is the interesting half: it is evidence the app noticed a lapse and responded
 * to it, whether or not anything was taken up.
 */
export const offerAmnestyEvents = (ctx: StampContext, scope: string): AppEvent[] =>
  [base(ctx, 'amnesty.offered', null, { scope })];

/**
 * Take the amnesty.
 *
 * **Nothing is marked done and nothing is deleted.** Every passed date is
 * resolved forward with the choice the replan surface already offers for exactly
 * this — `to-menu`, which lands the item on the Menu, where by law 6 it carries
 * no clock and makes no demand. It is still there. You can bring any of it back.
 *
 * What this actually removes is not work; it is **twenty decisions standing
 * between you and any work at all**, which is the real cost of coming back. Each
 * item still goes through `replanEvents`, so every one of them is the same gated,
 * forward-facing resolution a person would have made by hand — one act instead
 * of twenty, not a different kind of act.
 *
 * A cap is deliberately NOT applied here. The cap governs what a surface may
 * SHOW (law 8); this is a thing the user has explicitly asked for, and doing
 * three of the twenty they asked about would be the app deciding it knew better.
 */
export function acceptAmnestyEvents(ctx: StampContext, state: State, nowIso: string, zone: string): AppEvent[] {
  const out: AppEvent[] = [base(ctx, 'amnesty.accepted', null, { scope: 'passed-dates' })];
  // BUILT FROM `replanAll`, which is what the replan surface itself reads, and
  // NOT from a second walk over held nodes asking a different question. The two
  // agreed only by coincidence, and the coincidence broke on the arguments.
  //
  // The defect this fixes: every item went through `replanEvents` with the
  // arguments DEFAULTED — `passedKinds` fell back to `['due']` and
  // `demandClocks` to `[]`. Both are wrong per node, and both wrong in a way
  // that fails at the gate rather than quietly:
  //
  //  - an item raised by a passed `suspense` had that clock left live, so the
  //    card came straight back and the amnesty had resolved nothing;
  //  - an item carrying ANY other demand clock reached the Menu still owing
  //    somebody an answer, which the Menu belt rightly refuses (1.3.1) — and
  //    because this is ONE batch, that refusal took the whole amnesty with it.
  //
  // So a single item with the wrong shape moved ZERO of a mixed batch, on the
  // one surface whose entire purpose is to remove twenty decisions at once, at
  // the one moment a person has the least patience for a button that does
  // nothing. Reproduced against the real gate: three clean items and one
  // carrying a suspense moved none of the four.
  const cards = replanAll(state, nowIso, zone)
    .sort((a, b) => (a.node.id < b.node.id ? -1 : 1));   // total order: same log every time
  for (const c of cards) {
    out.push(...replanEvents(
      ctx, c.node.id, 'to-menu',
      // EVERY passed clock, not the one the card's sentence happens to name.
      c.passedKinds,
      undefined,
      // The node's ACTUAL kind. INERT for `to-menu`, which is the only
      // resolution the amnesty uses — `fromKind` is read by the `hand-off`
      // branch alone — and passed anyway so this call stays correct if the
      // amnesty ever resolves some other way. Said plainly rather than tested:
      // a test over an argument nothing reads would pass whatever the code did,
      // and one of those is worse than none.
      c.node.kind,
      // And every demand clock it carries RIGHT NOW, so `to-menu` sheds them
      // all and the landing is legal.
      demandClocksOf(c.node),
    ));
  }
  return out;
}

/**
 * The lapse ritual ran.
 *
 * Named `lapse.migration.ran` and never `migration.*` bare — the user-facing
 * word for this ritual is "Migration", which collides with schema migration, and
 * the vocabulary resolves that collision deliberately rather than living with an
 * ambiguity in the most data-critical part of the system.
 */
export const lapseRanEvents = (
  ctx: StampContext, absenceDays: number, itemsTriaged: number,
): AppEvent[] => [base(ctx, 'lapse.migration.ran', null, { absenceDays, itemsTriaged })];
