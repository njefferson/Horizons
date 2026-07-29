// Next-up — the surface that makes the app worth opening in the morning
// (build-plan items 18–19).
//
// One thing to do, chosen for you, with a short capped list behind it. The
// ranking is a fixed precedence, not a score to tune:
//
//   1. HARD LANDSCAPE — a real date has arrived. An appointment does not
//      negotiate with a plant that wants watering, so nothing computed is ever
//      allowed to outrank it.
//   2. RESUME CARDS — the thread you were already pulling. Picking up where you
//      were is cheaper than starting something new, and for this audience the
//      cost of a cold start is the whole problem (Phase 4 creates these; ranking
//      already knows where they go, so they land in the right place the day they
//      exist rather than needing this file reopened).
//   3. PRESSURE — the decay primitive, highest first (ADR-0010).
//
// **"Not this" cycles freely and records nothing.** No event, no penalty, no
// memory. If declining a suggestion wrote anything down, the surface would be
// keeping score, and a person who has to justify skipping something will avoid
// opening the app at all. Cycling is just an index moving.
//
// PURE, and `now` is an argument.

import type { NodeState, State } from './fold.ts';
import { pressureOf } from './pressure.ts';
import { calendarDaysBetween } from './time.ts';

/** Why an item is being offered. Carried so the surface can SAY it — the text
 *  channel of B-01, and the honest answer to "why am I being shown this?". */
export type NextUpReason = 'hard-date' | 'resume' | 'pressure' | 'ready';

export interface NextUpItem {
  node: NodeState;
  reason: NextUpReason;
  /** Decay pressure where the item carries the primitive; null otherwise. */
  pressure: number | null;
  /** Plain words for the reason, already resolved against the reader's zone. */
  words: string;
}

/** Kinds that can never be "the next thing to do". A waiting-for is someone
 *  else's move; the demand-free kinds refuse clocks by law and must not be
 *  dressed up as demands here either; a person/anchor/journal is not an action. */
const NOT_ACTIONABLE = new Set(['waiting-for', 'aspiration', 'pebble', 'person', 'anchor', 'journal']);

/** Live, actionable, and not still sitting in the inbox. An unclarified capture
 *  belongs to triage — offering it here would be asking the same question twice,
 *  in a surface whose whole promise is that it has already decided for you. */
function isCandidate(n: NodeState): boolean {
  if (n.trashed || n.mergedInto) return false;
  if (NOT_ACTIONABLE.has(n.kind)) return false;
  // On the Menu is a surface, not a demand (law 1 clause c). Never volunteered.
  if (n.onMenu) return false;
  // Captured but not yet routed = triage's, not ours.
  if (n.captured && n.route === null) return false;
  // DONE AND NOT RECURRING = finished. The gate re-clocks a `done.marked` to
  // keep the node non-silent (law 1 does not exempt completed work), so without
  // this a finished one-off keeps its clock and is offered again for ever —
  // caught by the smoke walk. An UPKEEP is the opposite case: `lastDone` is the
  // decay primitive's input, and it becomes askable again on its own schedule,
  // which is exactly what pressure computes.
  const recurring = n.intervalDays != null && n.comfortWindowDays != null;
  if (n.lastDone != null && !recurring) return false;
  return true;
}

/** The soonest clock that represents a real demand. `park` is deliberately not
 *  here: a parked thing is being held away from you on purpose. */
const demandClock = (n: NodeState): { kind: string; at: string } | null => {
  const c = n.clocks.due ?? n.clocks.start ?? n.clocks.suspense ?? n.clocks.review ?? null;
  return c ? { kind: c.kind, at: c.at } : null;
};

/** A hard date is `due` or `suspense` — the immovable kinds. A `review` clock is
 *  the app's own "bring this back", which is soft by construction. */
const hasHardDate = (n: NodeState): boolean => Boolean(n.clocks.due ?? n.clocks.suspense);

/**
 * Everything that could legitimately be offered right now, best first.
 *
 * Sorted by the precedence above, then within a tier by how long it has been
 * asking — and finally by id, so the order is TOTAL and the same state always
 * produces the same list. A surface that reshuffles between renders is a surface
 * that cannot be trusted to have chosen.
 */
export function nextUpQueue(state: State, nowIso: string, zone: string): NextUpItem[] {
  const items: NextUpItem[] = [];

  for (const n of state.nodes.values()) {
    if (!isCandidate(n)) continue;

    const p = pressureOf(n, nowIso, zone);
    const clock = demandClock(n);
    const daysToClock = clock ? calendarDaysBetween(nowIso, clock.at, zone) : null;
    const arrived = daysToClock !== null && daysToClock <= 0;

    if (n.kind === 'resume-card') {
      items.push({ node: n, reason: 'resume', pressure: p, words: 'where you left off' });
      continue;
    }
    if (arrived && hasHardDate(n)) {
      items.push({ node: n, reason: 'hard-date', pressure: p, words: 'a real date, and it is here' });
      continue;
    }
    if (p !== null && p >= 0) {
      items.push({ node: n, reason: 'pressure', pressure: p, words: 'ready again' });
      continue;
    }
    if (arrived) {
      items.push({ node: n, reason: 'ready', pressure: p, words: 'back with you today' });
      continue;
    }
    // Not yet asking for anything. Correct outcome: it stays quiet.
  }

  const RANK: Record<NextUpReason, number> = { 'hard-date': 0, resume: 1, pressure: 2, ready: 3 };
  return items.sort((a, b) => {
    const r = RANK[a.reason] - RANK[b.reason];
    if (r !== 0) return r;
    // Within pressure, the most insistent first; elsewhere, oldest first by id.
    if (a.reason === 'pressure' && b.reason === 'pressure') {
      const d = (b.pressure ?? 0) - (a.pressure ?? 0);
      if (d !== 0) return d;
    }
    return a.node.id < b.node.id ? -1 : a.node.id > b.node.id ? 1 : 0;
  });
}

/** Build-plan item 19: a capped list behind the one suggestion. Five, because a
 *  longer list is the pile the app exists to stand between you and. */
export const BEHIND_CAP = 5;

export interface NextUp {
  /** The one thing offered, or null when nothing is asking. */
  head: NextUpItem | null;
  /** Up to five more, so choosing is possible without facing everything. */
  behind: NextUpItem[];
  /** How many are asking in total — stated plainly, never as a badge. */
  total: number;
}

/**
 * The surface's view. `cycle` is how many times "not this" has been tapped; it
 * rotates the head through the queue and is held in memory only — no event, no
 * persistence, nothing to come back and reproach anyone with.
 */
export function nextUp(state: State, nowIso: string, zone: string, cycle = 0): NextUp {
  const queue = nextUpQueue(state, nowIso, zone);
  if (queue.length === 0) return { head: null, behind: [], total: 0 };
  const start = ((cycle % queue.length) + queue.length) % queue.length;
  const rotated = [...queue.slice(start), ...queue.slice(0, start)];
  return {
    head: rotated[0] ?? null,
    behind: rotated.slice(1, 1 + BEHIND_CAP),
    total: queue.length,
  };
}

/** Build-plan item 20: Upkeep chips — the recurring things that have come round,
 *  most insistent first. Separate from Next-up because an Upkeep is a different
 *  promise: small, repeating, and never a failure to have not done yet. */
export function upkeepChips(state: State, nowIso: string, zone: string, minPressure = 0): NextUpItem[] {
  return [...state.nodes.values()]
    .filter(n => n.kind === 'upkeep' && !n.trashed && !n.mergedInto)
    .map(n => ({ node: n, pressure: pressureOf(n, nowIso, zone) }))
    .filter((x): x is { node: NodeState; pressure: number } =>
      x.pressure !== null && x.pressure >= minPressure)
    .sort((a, b) => b.pressure - a.pressure || (a.node.id < b.node.id ? -1 : 1))
    .map(x => ({ node: x.node, reason: 'pressure' as const, pressure: x.pressure, words: 'ready again' }));
}
