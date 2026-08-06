// The six clarify routes and the heat pass, as event batches.
//
// Each route emits `clarify.routed` PLUS its own terminal event, in one commit,
// so the gate sees the finished intent — the node lands where the route says, not
// wherever the generic cure would put it. A route knows things the generic cure
// cannot: waiting-for is a KIND change, next-action is tomorrow's clock, trash is
// gone.
//
// What makes a forgotten terminal event safe is NOT the gate's clarify.routed cure
// (which is unreachable on the real write paths — a captured node is always
// already covered by the time routeEvents runs, and clarify.routed removes no
// coverage; see ADR-0029 and test/triage.test.ts). It is that a captured node is
// covered from capture onward, so a bare route leaves it under its capture clock,
// never silent. (The cure IS reachable in the abstract — a bare clarify.routed at
// a never-created node id mints a silent node the cure then clocks — which is why
// it is kept; it just never fires for a route built here.)
//
// These build events; they never touch the store. `app.ts` hands them to
// `session.commit`, which runs them through the gate.

import type { AppEvent, ClarifyRoute, ClockKind, Heat, MenuCategory, NodeKind } from '../events.ts';
import type { NodeState } from '../fold.ts';
import type { StampContext } from './session.ts';
import { calendarDaysBetween, endOfLocalDay, isValidIso } from '../time.ts';
import { createParentEvents, endOfDayKey } from './detail-intents.ts';
import { isAppClock } from '../fold.ts';

const base = (ctx: StampContext, kind: string, node: string, payload: unknown): AppEvent => ({
  id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
  kind, node, payload,
} as AppEvent);

const routed = (ctx: StampContext, node: string, route: ClarifyRoute): AppEvent =>
  base(ctx, 'clarify.routed', node, { route });

// A route's clock is "back with you before this day is out", so it lands on the
// last second of a LOCAL calendar day — the user's day, not UTC's (V-13) — and
// counts calendar days, so a DST changeover in between does not move it an hour.
const clockInDays = (ctx: StampContext, node: string, days: number, source: string): AppEvent =>
  base(ctx, 'clock.set', node, {
    clockKind: 'review', at: endOfLocalDay(ctx.at, ctx.zone, days), source,
  });

const menu = (ctx: StampContext, node: string): AppEvent =>
  base(ctx, 'menu.item.added', node, { category: 'read' });

/** The heat pass: one event, no routing. */
export const heatEvents = (ctx: StampContext, node: string, heat: Heat): AppEvent[] =>
  [base(ctx, 'heat.set', node, { heat })];

/** The clock kinds that are DEMANDS — dates somebody chose or owes. A `review`
 *  clock is the app's own resurfacing marker and is never in this list. */
const DEMAND_KINDS: readonly ClockKind[] = ['due', 'start', 'suspense', 'park'];

/**
 * The demand clocks a node currently carries — what a Menu landing must clear.
 * Exported so callers hand `routeEvents` the truth about THIS node rather than
 * the route guessing (an unconditional clear would write claims about changes
 * that did not happen).
 */
export const demandClocksOf = (n: NodeState | undefined): ClockKind[] =>
  n ? DEMAND_KINDS.filter(k => Boolean(n.clocks[k])) : [];

/** EVERY clock a node carries, `review` included. Filing needs this and not
 *  `demandClocksOf`: the capture cure sets a review clock, which is not a demand
 *  kind, so a filed item would otherwise keep its own same-day return on top of
 *  the place's. */
export const clocksOf = (n: NodeState | undefined): ClockKind[] =>
  n ? (Object.keys(n.clocks) as ClockKind[]) : [];

/**
 * A route's full batch. Every branch terminates legally on its own — and even a
 * bare `clarify.routed` cannot silence the node, because it enters clarify already
 * covered by its capture clock (see the header note).
 *
 * `demandClocks` (1.3.1): the demand clocks the node carries RIGHT NOW, from
 * `demandClocksOf`. The someday/reference branches clear every one of them in
 * the same batch — the audit's most severe finding was a due-dated item routed
 * to Someday keeping its date invisibly for ever: the Menu group wins every
 * surface, `raisesReplanCard` returns false for Menu items, the sheet hides
 * temporal controls, and sort mode's hygiene excludes it — a hard date
 * swallowed whole, which is law 3 violated in the app's own mainline. A wish
 * carries no demands; landing on the Menu must shed them, visibly, in the log.
 */
export function routeEvents(
  ctx: StampContext, node: string, route: ClarifyRoute, fromKind: NodeKind,
  demandClocks: readonly ClockKind[] = [],
): AppEvent[] {
  const r = routed(ctx, node, route);
  switch (route) {
    case 'do-now':
      // A same-day clock; the 2-minute timer is a UI affordance, recorded
      // separately as do-now.timed when it ends.
      return [r, clockInDays(ctx, node, 0, 'clarify:do-now')];
    case 'next-action':
      return [r, clockInDays(ctx, node, 1, 'clarify:next-action')];
    case 'waiting-for':
      return [
        r,
        base(ctx, 'node.kind.changed', node, { from: fromKind, to: 'waiting-for' as NodeKind }),
        clockInDays(ctx, node, 3, 'clarify:waiting-for'),
      ];
    case 'someday':
    case 'reference':
      // Menu FIRST, then the clears: once the node is on the Menu it is covered
      // by clause (c), so stripping its clocks needs no cure — the other order
      // would make the gate write a junk same-day clock between the two.
      return [
        r,
        menu(ctx, node),
        ...demandClocks.map(k => base(ctx, 'clock.cleared', node, { clockKind: k })),
      ];
    case 'trash':
      return [r, base(ctx, 'node.trashed', node, { reason: 'clarify:trash' })];
    default:
      return [r];
  }
}

/**
 * Put a just-routed card back in the inbox — the exact reverse of `routeEvents`.
 *
 * The complaint this answers: a route is one tap and the card is gone, and
 * "gone" felt like "lost". Undo is the way back. Append-only means it is NOT a
 * deletion — it is the honest inverse events, so the log reads "sent here, then
 * taken back", which is what actually happened.
 *
 * Each route's effects are reversed with the events built to reverse them:
 * `clarify.reopened` un-sets the route (the item returns to triage), and then
 * the route's OTHER effect is undone — a kind change put back, the review clock
 * cleared, the Menu placement removed, or the trashing undone. In every case the
 * node lands back exactly where it started: `captured`, unrouted, and cured by
 * the same same-day clock a fresh capture gets, so it is never silent for an
 * instant.
 *
 * `fromKind` is the kind the node had BEFORE the route touched it — captured by
 * the surface at route time, because `waiting-for` is the one route that changes
 * the kind and the log does not otherwise remember what it was.
 */
export function undoRouteEvents(
  ctx: StampContext, node: string, route: ClarifyRoute, fromKind: NodeKind,
): AppEvent[] {
  const reopen = base(ctx, 'clarify.reopened', node, { from: route });
  // Built LAZILY, in emission position. The first version constructed this
  // before the switch, so the waiting-for branch emitted [reopen, kind.changed,
  // cleared] with the cleared event carrying an EARLIER seq than the kind
  // change — a stamp-disordered batch the old gate tolerated silently and the
  // 1.3.1 order refusal caught on its first run. Stamps follow emission order
  // or the batch is lying about its own history.
  const clearReview = (): AppEvent => base(ctx, 'clock.cleared', node, { clockKind: 'review' });
  switch (route) {
    case 'do-now':
    case 'next-action':
      // The route replaced the capture clock with its own review clock; clearing
      // it lets the gate re-cure to a same-day clock, so the item is restored to
      // the exact state a fresh capture is in.
      return [reopen, clearReview()];
    case 'waiting-for':
      return [
        reopen,
        base(ctx, 'node.kind.changed', node, { from: 'waiting-for' as NodeKind, to: fromKind }),
        clearReview(),
      ];
    case 'someday':
    case 'reference':
      // someday/reference land on the Menu with category 'read' (see `menu`
      // above); take it back off, which the gate cures with a same-day clock.
      return [reopen, base(ctx, 'menu.item.removed', node, { from: 'read' as MenuCategory })];
    case 'trash':
      return [reopen, base(ctx, 'node.untrashed', node, {})];
    case 'filed':
      // Taking back a FILE has to undo the parenting too. Without this the item
      // returns to the inbox still sitting in the place it was just taken out
      // of — "Undo" that leaves the thing where it was is a lie. Unparenting
      // removes coverage (d), which the gate cures with a clock, exactly as the
      // other reopens do.
      return [reopen, base(ctx, 'node.unparented', node, {})];
    default:
      return [reopen];
  }
}

/**
 * Put it in a PLACE — the answer to "where", which triage has never had.
 *
 * What actually ends a working day, reported 2026-08-04: a huge backlog
 * imported to work through and file in the right places, and the places kept
 * turning out not to exist yet. A thing would leave the surface with no way to
 * tell where, or whether, it had gone.
 *
 * Every route above answers WHEN — a clock, or the Menu, or gone. None of them
 * answers WHERE, and `routeEvents` takes no parent at all. So an imported
 * backlog could be sorted by urgency and never filed, and the confirmation could
 * only ever say "Sent to Next action", which is a category rather than somewhere
 * a person can go and look.
 *
 * **The place is made HERE when it does not exist**, which is law 4: levels push
 * down and the user never climbs. Making him leave triage to create a project
 * and come back is the climb the law forbids, and across 1,173 imported items it
 * is the whole difficulty.
 *
 * LAW 1 holds without special pleading. A brand-new place has no clock, so it is
 * newly silent and the gate CURES it with one (`cureFor`) in the same
 * transaction — the same mechanism the detail sheet's inline create has always
 * relied on. The item is then covered by clause (d), riding its parent's clock,
 * which is the honest arrangement: **the place comes back, and its contents come
 * back with it.** That is what makes a filed thing findable again rather than
 * merely gone.
 *
 * No clock is set on the ITEM. Filing is not scheduling, and inventing a date
 * here would be the app deciding something the reader did not say.
 */
export function fileUnderEvents(
  ctx: StampContext, node: string, parent: string,
  clocksToClear: readonly ClockKind[] = [], priorParent?: string | null,
): AppEvent[] {
  if (!parent || parent === node) return [];
  return [
    base(ctx, 'clarify.routed', node, { route: 'filed' as ClarifyRoute }),
    // Parent FIRST, then clear — once the item is under a clocked place it is
    // covered by clause (d), so stripping its own clocks needs no cure. The
    // other order would make the gate write a junk same-day clock between the
    // two, which is the trap the someday/reference branch documents above.
    base(ctx, 'node.parented', node, { parent, ...(priorParent ? { priorParent } : {}) }),
    // A FILED thing must stop asking on its own — EVERY clock, not just the
    // demand ones. The capture cure sets a `review` clock, which `demandClocksOf`
    // deliberately excludes, so clearing only demand kinds left the item riding
    // BOTH its own same-day review and the place's: filed, and still pestering
    // you tomorrow. Filing says where; the place's clock says when. One answer
    // each, and `clocksOf` is what the callers pass.
    ...clocksToClear.map(k => base(ctx, 'clock.cleared', node, { clockKind: k })),
  ];
}

/**
 * File it under a place that DOES NOT EXIST YET — the case that was missing.
 *
 * This is the whole point of the feature and it is one commit, not two: the
 * place is created, the item is parented to it, and the item leaves the inbox,
 * all in the same transaction the gate sees. Making the place in one step and
 * filing in another would leave a window where a brand-new empty place is
 * sitting there unexplained, and would give the reader two undos for one
 * decision.
 *
 * `createParentEvents` is reused rather than reimplemented — it is the same
 * lawful create the detail sheet has always used, and a second copy of "how a
 * place is born" is how two of them drift.
 */
export function fileUnderNewEvents(
  ctx: StampContext, node: string, title: string,
  clocksToClear: readonly ClockKind[] = [], priorParent?: string | null,
): AppEvent[] {
  const made = createParentEvents(ctx, node, title, priorParent);
  if (made.length === 0) return [];
  return [
    ...made,
    base(ctx, 'clarify.routed', node, { route: 'filed' as ClarifyRoute }),
    ...clocksToClear.map(k => base(ctx, 'clock.cleared', node, { clockKind: k })),
  ];
}

/**
 * WHEN SHOULD THIS PLACE COME BACK TO YOU (V2 stage 3).
 *
 * The write that closes the hollow return. A place minted at file time carries
 * only a `gate:node.created` cure, and `isAppClock` excludes that from
 * `soonestDemand` and `arrivedClock` — so it sits in "Later" for ever, holding
 * everything filed into it. Nothing is lost and nothing returns, which is the
 * exact complaint filing was built to end, one layer down.
 *
 * **A REVIEW CLOCK, NOT A DUE.** The detail sheet's date control has always
 * been reachable on a container and writes `due` — and a place is not DUE. You
 * do not finish Errands; you look in it again. The noun matters beyond taste:
 * `due` is a hard clock, and the only reason a passed one does not raise a
 * replan card on a place is that every container sits in `NO_REPLAN_CARD`. That
 * is an accident of kind, not a decision about places, and it is not a thing to
 * lean on. `review` is what the app already calls "bring this back to you", and
 * it is what `heldGroups` reads to move a place from Later, to Coming up, to
 * Ready now — verified against the fold rather than assumed.
 *
 * Nothing else changes. No new event kind, no fold field, no migration: the
 * whole return mechanism already existed and nothing wrote the clock.
 *
 * `source` names the surface, as every other writer does, so the log can say
 * where a date came from and `isAppClock` can keep telling a human clock from a
 * cure.
 */
export const datePlaceEvents = (
  ctx: StampContext, place: string, dayKey: string,
): AppEvent[] => {
  if (!place || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return [];
  return [base(ctx, 'clock.set', place, {
    clockKind: 'review', at: endOfDayKey(dayKey, ctx.zone), source: 'triage:place-return',
  })];
};

/**
 * When does this place come round — by the reader's own clocks, never the
 * gate's. `null` is the honest answer for a place nobody has dated, and V2
 * stage 1 SAYS it rather than papering over it: the hollow-return finding
 * (NOTES, 2026-08-04) is that a place minted at file time carries only a
 * `gate:node.created` cure, which no return path reads — so until stage 3
 * gives dating a control, "no return date yet" is the true state of every
 * filed-made place, and the receipt is where the one person who can fix that
 * finds out.
 */
export function placeReturnDays(
  place: NodeState | null | undefined, nowIso: string, zone: string,
): number | null {
  if (!place) return null;
  let best: number | null = null;
  for (const c of Object.values(place.clocks)) {
    if (!c || c.kind === 'park' || isAppClock(c) || !isValidIso(c.at)) continue;
    const d = calendarDaysBetween(nowIso, c.at, zone);
    if (best === null || d < best) best = d;
  }
  return best;
}

/**
 * The filed receipt — the sentence that ends "I'd see the task leave and not
 * know where/if it went." It always names the place, and it always answers
 * the second half honestly: WHEN the place comes round, or that no one has
 * said yet. Factual both ways; neither branch may ever grow a reproach
 * ("still", "you haven't") — the no-date branch is information for the one
 * person who can date the place, not a nag (V2 decision 3 owns its fate).
 */
export function fileReceiptWords(name: string, returnDays: number | null): string {
  if (returnDays === null) return `Filed under ${name} — no return date yet.`;
  if (returnDays <= 0) return `Filed under ${name} — it comes round today.`;
  if (returnDays === 1) return `Filed under ${name} — it comes round tomorrow.`;
  return `Filed under ${name} — it comes round in ${returnDays} days.`;
}
