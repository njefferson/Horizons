// The comms sweep (v1 Must, build-plan item 22).
//
// Deferred out of Phase 3 with a reason recorded at the time — *"needs focus
// ramps, which are Phase 4"*. Focus ramps shipped in 0.14.0, so the reason is
// spent and this is the thing it was waiting for.
//
// The problem it solves is not "check your email". It is that messages arrive
// continuously and attention does not divide. Left to itself, the habit becomes
// a check every few minutes — each one cheap, all of them together the whole
// day — and for this audience the cost of resuming after each interruption is
// the part nobody budgets for.
//
// So the sweep is ONE bounded pass, offered at the moment you are already
// surfacing: **coming out of a focus session.** You have just put something
// down; that is when looking costs least. Never mid-focus, and never as a
// notification, because a chip that arrives while you are working is the exact
// interruption it exists to consolidate.
//
// It runs on the ordinary decay primitive — `(last_done, comfort_window, rising
// pressure)` — because a sweep is upkeep, and upkeep is what this app already
// knows how to hold without nagging. There is no separate timer, no streak, and
// **not sweeping is not a failure**.
//
// PURE. `now` and `zone` are arguments.

import type { NodeState, State } from './fold.ts';
import { heldNodes } from './gate.ts';
import { pressureOf } from './pressure.ts';
import { calendarDaysBetween, isValidIso } from './time.ts';
import { isHeld } from './fold.ts';

/** The field that marks a node as the comms sweep. A field and not a kind: it
 *  IS an upkeep in every respect that matters — it decays, it can be completed,
 *  it appears as a chip — and inventing a kind for it would mean teaching every
 *  projection in the app about a thing that behaves exactly like one they know. */
export const COMMS_FIELD = 'comms-sweep';

/** How long between sweeps by default, and how much slack before pressure
 *  starts rising. Twice a day, relaxed by half a day: often enough that nothing
 *  waits long, loose enough that it is never a schedule you are late for. */
export const COMMS_INTERVAL_DAYS = 1;
export const COMMS_COMFORT_DAYS = 1;

export const isCommsSweep = (n: NodeState): boolean =>
  isHeld(n) && Object.hasOwn(n.fields, COMMS_FIELD);

/** The sweep node, if one has been made. Null is the ordinary state for someone
 *  who has never used it, and it must stay usable — nothing here is set up. */
export function commsNode(state: State): NodeState | null {
  for (const n of heldNodes(state)) if (isCommsSweep(n)) return n;
  return null;
}

export interface CommsChip {
  node: NodeState;
  /** Rising pressure from the one decay primitive. Null when it cannot be
   *  computed, which is silence rather than a zero. */
  pressure: number | null;
  /** Whole days since the last sweep, or null if there has never been one. */
  days: number | null;
  words: string;
}

/**
 * Should the chip be offered right now?
 *
 * Two conditions, and BOTH are required:
 *
 *   1. `surfacing` — you are coming out of a focus session. This is the ramp,
 *      and it is the entire point of the feature. A chip that can appear at any
 *      moment is a notification wearing different clothes.
 *   2. the sweep has actually come round, by the same decay primitive every
 *      other repeating thing in this app uses.
 *
 * Returns null when it should not be offered, which is most of the time.
 */
export function commsChip(
  state: State, nowIso: string, zone: string, surfacing: boolean,
): CommsChip | null {
  if (!surfacing) return null;
  const n = commsNode(state);
  if (!n) return null;
  const p = pressureOf(n, nowIso, zone);
  if (p === null || !Number.isFinite(p) || p < 0) return null;
  const days = sweptDaysAgo(n, nowIso, zone);
  return { node: n, pressure: p, days, words: commsWords(days) };
}

/** Whole days since the last sweep. Null when there has never been one — which
 *  is a fact, not a lapse, and the words say so. */
export function sweptDaysAgo(n: NodeState, nowIso: string, zone: string): number | null {
  const at = n.lastDone;
  if (!at || !isValidIso(at)) return null;
  return calendarDaysBetween(at, nowIso, zone);
}

/**
 * What the chip says.
 *
 * A duration and an offer. Never a count of unread anything — this app cannot
 * see your inbox and would not report a number if it could, because an unread
 * count is the single most effective piece of shame-by-arithmetic in software.
 * And never "you haven't checked since Tuesday", which is the same sentence
 * with a finger pointed.
 */
export function commsWords(days: number | null): string {
  if (days === null) return 'Take one pass through your messages?';
  if (days === 0) return 'Another pass through your messages?';
  if (days === 1) return 'Last pass through your messages was yesterday.';
  return `Last pass through your messages was ${days} days ago.`;
}
