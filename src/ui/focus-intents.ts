// Starting, interrupting and stopping a focus session.
//
// These build events; they never touch the store. `app.ts` hands them to
// `session.commit`, which runs them through the gate. Every noun below already
// exists in docs/event-vocabulary.md — nothing here invents one.
//
// The load-bearing decision is in `interruptEvents`: an interruption writes the
// resume card **in the same transaction**. Not on `focus.ended`, because you do
// not get to press a button on your way out of the room, and a thread saved only
// by an orderly exit is a thread saved only when it was never at risk.

import type { AppEvent, NodeKind } from '../events.ts';
import type { State } from '../fold.ts';
import type { StampContext } from './session.ts';
import { cleanTitle } from './detail-intents.ts';
import { endOfLocalDay } from '../time.ts';
import { COMMS_FIELD, COMMS_INTERVAL_DAYS, COMMS_COMFORT_DAYS } from '../comms.ts';

const base = (ctx: StampContext, kind: string, node: string | null, payload: unknown): AppEvent => ({
  id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
  kind, node, payload,
} as AppEvent);

/** The five-word cue, cleaned the same way a title is — and **skippable**. An
 *  empty answer is a legal answer that is never nagged about, so it becomes
 *  `null` rather than an error or an empty string masquerading as one. */
export const cleanCue = (raw: string): string | null => cleanTitle(raw) || null;

/**
 * Start working on something.
 *
 * If a session is already running this ends it first, as `switched`, and leaves
 * a resume card behind for what is being put down. Swapping tasks is the most
 * ordinary thing anyone does and it must not be the case that silently loses a
 * thread.
 */
export function startFocusEvents(ctx: StampContext, state: State, node: string): AppEvent[] {
  const out: AppEvent[] = [];
  const running = state.focus;
  if (running && running.node === node) return [];      // already on it; a no-op is not a write
  if (running) {
    out.push(base(ctx, 'focus.ended', null, { reason: 'switched' }));
    if (!hasLiveCardFor(state, running.node)) {
      out.push(...resumeCardEvents(ctx, running.node, null));
    }
  }
  out.push(base(ctx, 'focus.started', node, { node }));
  return out;
}

/**
 * Stop.
 *
 * `completed` is the one reason that leaves no card: the thread does not need
 * picking up, because there is no thread. Everything else does, and the cue is
 * optional throughout.
 */
export function endFocusEvents(
  ctx: StampContext, state: State,
  reason: 'completed' | 'switched' | 'abandoned' | 'interrupted' = 'abandoned',
  cue: string | null = null,
): AppEvent[] {
  const running = state.focus;
  if (!running) return [];
  const out: AppEvent[] = [base(ctx, 'focus.ended', null, { reason })];
  if (reason === 'completed') {
    // Anything already waiting for this thread is spent — you finished it, so
    // being offered your way back in would be the app arguing with you.
    for (const c of liveCardsFor(state, running.node)) {
      out.push(base(ctx, 'resume.card.spent', c, {}));
    }
    return out;
  }
  const existing = liveCardsFor(state, running.node);
  if (existing.length === 0) {
    out.push(...resumeCardEvents(ctx, running.node, cue));
  } else if (cue) {
    // A card written at the moment of interruption has no cue — nobody stops to
    // type one while someone is standing in the doorway. If you offer one on the
    // way out, it belongs on the card that already exists rather than on a
    // second card competing with it.
    //
    // Re-stating `resume.card.created` and NOT `node.field.set`: the cue is a
    // first-class fact the surface reads, and a field.set would store a shadow
    // copy under `n.fields` that nothing looks at — the exact mistake ADR-0031
    // settled for titles. Per-field LWW makes the restatement land cleanly.
    out.push(base(ctx, 'resume.card.created', existing[0]!, { forNode: running.node, cue }));
  }
  return out;
}

/**
 * Something else came up.
 *
 * Two writes, one transaction: the interruption is held as an inbox item, and
 * the thread you are being pulled off is saved **immediately**. From here the
 * app can be closed, backgrounded or killed and coming back still says where
 * you were.
 *
 * The card carries no cue, deliberately. Asking for five words at the instant
 * of an interruption is asking for them at the one moment nobody can produce
 * them; it is offered later, on the way out, when there is time.
 */
export function interruptEvents(
  ctx: StampContext, state: State, newNode: string, text: string,
): AppEvent[] {
  const clean = cleanTitle(text);
  if (!clean) return [];
  const focused = state.focus?.node ?? null;
  const out: AppEvent[] = [
    base(ctx, 'interrupt.captured', newNode, { text: clean, duringFocus: focused }),
  ];
  if (focused && !hasLiveCardFor(state, focused)) {
    out.push(...resumeCardEvents(ctx, focused, null));
  }
  return out;
}

/** Pick a thread back up: spend the card, and start focus on the real work. */
export function resumeEvents(ctx: StampContext, state: State, card: string, target: string): AppEvent[] {
  return [
    base(ctx, 'resume.card.spent', card, {}),
    ...startFocusEvents(ctx, state, target),
  ];
}

/** Let a thread go without picking it up. Not a failure and not a deletion —
 *  the card is retired and the work itself is untouched, still on your list. */
export const dropResumeEvents = (ctx: StampContext, card: string): AppEvent[] =>
  [base(ctx, 'resume.card.expired', card, { toReviewQuestion: false })];

// --- the card itself --------------------------------------------------------

/**
 * A resume card is a real node, so it holds a clock like everything else and
 * law 1 has something to cure. It is titled for what it points at, because a
 * card reading "resume card" on a list of your work is a row that tells you
 * nothing.
 */
function resumeCardEvents(ctx: StampContext, forNode: string, cue: string | null): AppEvent[] {
  const id = ctx.id();
  return [
    base(ctx, 'node.created', id, { nodeKind: 'resume-card' as NodeKind, title: 'where you left off' }),
    base(ctx, 'resume.card.created', id, { forNode, cue }),
    // Its OWN clock, rather than leaning on the gate's cure.
    //
    // A resume card is the one node whose entire purpose is to be offered back, so
    // "come back to me today" is a statement of intent and belongs in the log as
    // one. It used to arrive with no clock at all and be cured like anything else —
    // and a cure for a bare `node.created` carries no intent about when, which is
    // exactly what a dateless import row also produces. The two were
    // indistinguishable, so suppressing one suppressed the other and an interrupted
    // thread stopped being offered back.
    //
    // Every other deliberate act here already declares its own clock (clarify,
    // replan, the detail sheet). This one was the exception, and being the
    // exception is what made it fragile.
    base(ctx, 'clock.set', id, {
      clockKind: 'review', at: endOfLocalDay(ctx.at, ctx.zone, 0), source: 'focus:resume',
    }),
  ];
}

const liveCardsFor = (state: State, nodeId: string): string[] =>
  [...state.nodes.values()]
    .filter(n => n.kind === 'resume-card' && n.resumeFor === nodeId)
    .filter(n => !n.resumeSpent && !n.trashed && !n.mergedInto)
    .map(n => n.id)
    .sort();

const hasLiveCardFor = (state: State, nodeId: string): boolean =>
  liveCardsFor(state, nodeId).length > 0;

/**
 * Turn something on: the comms sweep.
 *
 * Built from events that already exist. It is an ordinary upkeep node carrying
 * one marker field — a field and not a new kind, because it behaves exactly like
 * an upkeep in every respect that matters, and a new kind would mean teaching
 * every projection in the app about a thing they already know how to handle.
 *
 * Off until you ask for it. A planner that arrives having decided you should
 * check your messages twice a day has made a decision about your working life
 * that it was not asked to make.
 */
export function startCommsSweepEvents(ctx: StampContext, node: string): AppEvent[] {
  return [
    base(ctx, 'node.created', node, { nodeKind: 'upkeep' as NodeKind, title: 'a pass through your messages' }),
    base(ctx, 'node.field.set', node, { field: COMMS_FIELD, value: true }),
    base(ctx, 'upkeep.interval.set', node, {
      intervalDays: COMMS_INTERVAL_DAYS, comfortWindowDays: COMMS_COMFORT_DAYS,
    }),
    // Due when the interval says, not this evening. The gate would otherwise
    // cure the creation with a same-day clock — legal, and wrong.
    base(ctx, 'clock.set', node, {
      clockKind: 'review', at: endOfLocalDay(ctx.at, ctx.zone, COMMS_INTERVAL_DAYS), source: 'comms:start',
    }),
    // THE RHYTHM STARTS NOW, and this is not a cosmetic choice.
    //
    // `pressureOf` reads a never-completed upkeep as pressure 0 — ready — so
    // without this the sweep was due the instant you turned it on, while the
    // clock set directly above said tomorrow. Two facts about one node
    // disagreeing is the exact class of defect this codebase keeps finding, and
    // here it would mean the first thing the feature ever did was interrupt you
    // for saying yes to it.
    //
    // Recording it as just-swept is also simply true: you are at your desk
    // reading a settings panel, so you have almost certainly just looked.
    base(ctx, 'done.marked', node, { at: ctx.at }),
  ];
}

/** Stop offering it. `node.trashed` and not a deletion: it happened, the log
 *  says so, and turning something off is a decision worth being able to see. */
export const stopCommsSweepEvents = (ctx: StampContext, node: string): AppEvent[] =>
  [base(ctx, 'node.trashed', node, { reason: 'comms:stopped' })];
