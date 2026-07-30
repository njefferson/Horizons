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
//      cost of a cold start is the whole problem. Phase 4 creates these; ranking
//      and retirement (spent/expired) are handled, but the cue and the pairing
//      are not built yet, so this is not a finished feature — only a place kept
//      honestly.
//   3. PRESSURE — the decay primitive, highest first (ADR-0010).
//
// **"Not this" cycles freely and records nothing.** No event, no penalty, no
// memory. If declining a suggestion wrote anything down, the surface would be
// keeping score, and a person who has to justify skipping something will avoid
// opening the app at all. Cycling is just an index moving.
//
// PURE, and `now` is an argument.

import { isAppClock, type NodeState, type State } from './fold.ts';
import { pressureOf } from './pressure.ts';
import { replanIds } from './replan.ts';
import { calendarDaysBetween, isValidIso } from './time.ts';

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
const NOT_ACTIONABLE = new Set([
  'waiting-for', 'aspiration', 'pebble', 'person', 'anchor', 'journal',
  // Altitude nodes. Product law 4: "levels push down; the user never climbs —
  // the runway is the only workspace", and ADR-0013 makes altitude views
  // inspection modes, not destinations. Offering an AREA called "Health" as the
  // single next thing to do, with a Done button that writes `done.marked` on it,
  // is the climbing task law 4 forbids — and a goal or an area cannot be "done"
  // at all. They shape the ranking of the runway; they do not enter the queue.
  'goal', 'area', 'outcome', 'project',
]);

/** Live, actionable, and not still sitting in the inbox. An unclarified capture
 *  belongs to triage — offering it here would be asking the same question twice,
 *  in a surface whose whole promise is that it has already decided for you. */
function isCandidate(n: NodeState, nowIso: string, zone: string): boolean {
  if (n.trashed || n.mergedInto) return false;
  if (NOT_ACTIONABLE.has(n.kind)) return false;
  // On the Menu is a surface, not a demand (law 1 clause c). Never volunteered.
  if (n.onMenu) return false;
  // Captured but not yet routed = triage's, not ours.
  if (n.captured && n.route === null) return false;
  // A spent or expired resume card is a thread already picked up, or one that
  // went cold. Either way it is not still waiting for you.
  if (n.resumeSpent) return false;
  // DONE AND NOT RECURRING = finished. The gate re-clocks a `done.marked` to
  // keep the node non-silent (law 1 does not exempt completed work), so without
  // this a finished one-off keeps its clock and is offered again for ever.
  //
  // "Recurring" is asked of the SAME predicate that computes pressure. Two
  // different guards (`!= null` here, `<= 0` there) disagreed about an interval
  // of 0: it counted as recurring, so the finished-check let it through, but its
  // pressure was null, so it rode a stale cure clock in the `ready` tier for
  // ever and marking it done did nothing. An item that can be neither completed
  // nor dismissed is the exact failure this app exists to prevent.
  const recurring = pressureOf(n, nowIso, zone) !== null;
  if (n.lastDone != null && !recurring) return false;
  return true;
}

/**
 * Has ANY demanding clock come round? `park` is deliberately excluded: a parked
 * thing is being held away from you on purpose.
 *
 * This asks about every clock, not a favourite one. The first version read
 * `due ?? start ?? suspense ?? review` — a precedence by KIND, not by time —
 * while claiming to be "the soonest clock". So an item created today (gate-
 * clocked for review today) that was then given a due date next month showed
 * only its `due`, read as "not arrived", and **vanished from the work surface
 * entirely** while the coverage gauge still read 0 silent. Work disappearing is
 * the worst thing this app can do, so the question is now asked of all of them.
 */
const arrivedClock = (n: NodeState, nowIso: string, zone: string): boolean =>
  Object.values(n.clocks).some(c =>
    c != null && c.kind !== 'park' && isValidIso(c.at) &&
    // A GATE CURE IS NOT A DEMAND. The comment two tiers below already knew cure
    // clocks "never move"; what it did not say is that treating one as arrived
    // means every dateless thing reads as waiting for you today. Noah imported
    // 1,429 items and this surface reported 1,012 ready — a number that was
    // arithmetically correct and meant nothing. A cure exists so a node is not
    // silent; the reader never asked for anything by today.
    !isAppClock(c) &&
    calendarDaysBetween(nowIso, c.at, zone) <= 0);

/**
 * Is any ancestor a project someone else is executing?
 *
 * Bounded by a seen set, like every other ancestor walk in this codebase: the
 * gate keeps the parent graph acyclic, and a shard can still deliver two halves
 * of a loop neither device wrote whole (ADR-0035/0038).
 */
function underTrackedProject(state: State, n: NodeState): boolean {
  const seen = new Set<string>([n.id]);
  let cur = n.parent;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const p = state.nodes.get(cur);
    if (!p || p.trashed || p.mergedInto) return false;
    if (p.role === 'track') return true;
    cur = p.parent;
  }
  return false;
}

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
    if (!isCandidate(n, nowIso, zone)) continue;
    // Work under a TRACKED project is not yours to do. The vocabulary has said
    // so since the first draft — "a `track` project emits no next actions, only
    // Waiting-Fors and Upkeep check-ins" — and nothing enforced it, because
    // nothing folded the role. Offering a next action on something you are only
    // carrying is the app telling you to do somebody else's job, which is the
    // fastest way to stop trusting a surface whose whole promise is that it has
    // already decided.
    //
    // A waiting-for and an upkeep still come through: chasing IS the work when
    // you are the one carrying it.
    if (n.kind !== 'waiting-for' && n.kind !== 'upkeep' && underTrackedProject(state, n)) continue;

    const p = pressureOf(n, nowIso, zone);
    const arrived = arrivedClock(n, nowIso, zone);

    // A hard date outranks everything, INCLUDING a resume card — the tier test
    // comes first for every kind. A resume card carrying an arrived due date was
    // previously misfiled as tier 2 purely because its branch ran first.
    if (arrived && hasHardDate(n)) {
      items.push({ node: n, reason: 'hard-date', pressure: p, words: 'a real date, and it is here' });
      continue;
    }
    if (n.kind === 'resume-card') {
      // A resume card still has to be DUE. Without this a card parked until
      // Christmas led the list in July, above everything — and one with no clock
      // at all was offered for ever. `demandClock`'s own comment said a parked
      // thing is held away from you on purpose; the resume branch used to skip
      // that check entirely.
      //
      // And it must point at something. A card is written the instant an
      // interruption is recorded, so the session that made it may STILL BE
      // RUNNING — that thread is not lost yet, and offering it back while you
      // are sitting in it is the app interrupting you about being interrupted.
      // A card whose target is gone is dropped for the same reason: a way back
      // into work you have already let go is not a way back.
      if (!arrived) continue;
      if (!n.resumeFor || n.resumeFor === state.focus?.node) continue;
      const target = state.nodes.get(n.resumeFor);
      if (!target || target.trashed || target.mergedInto || target.lastDone) continue;
      items.push({
        node: n, reason: 'resume', pressure: p,
        // YOUR five words when there are five words. Nothing this app composes
        // beats what you wrote at the moment you put it down.
        words: n.resumeCue ? `you were about to: ${n.resumeCue}` : 'where you left off',
      });
      continue;
    }
    if (p !== null && p >= 0) {
      items.push({ node: n, reason: 'pressure', pressure: p, words: 'ready again' });
      continue;
    }
    if (arrived) {
      // "Back with you today" was a falsehood for any clock older than today —
      // and gate cure clocks never move, so that was the NORMAL case, not an
      // edge one (Doctrine §5: no copy the data does not support).
      items.push({ node: n, reason: 'ready', pressure: p, words: 'this one is waiting' });
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

/**
 * Build-plan item 20: Upkeep chips — the recurring things that have come round,
 * most insistent first. Separate from Next-up because an Upkeep is a different
 * promise: small, repeating, and never a failure to have not done yet.
 *
 * Separate PROJECTION, but the same eligibility. The first version filtered only
 * on kind and trashed, so it volunteered an upkeep sitting on the Menu — which
 * Next-up correctly refuses, because the Menu is a surface and not a demand
 * (law 1 clause c) — and an unclarified inbox upkeep that still belonged to
 * triage. A surface that is exempt from the exclusions is not a second view of
 * the data; it is a hole in them.
 */
export function upkeepChips(state: State, nowIso: string, zone: string, minPressure = 0): NextUpItem[] {
  return [...state.nodes.values()]
    .filter(n => n.kind === 'upkeep' && isCandidate(n, nowIso, zone))
    .map(n => ({ node: n, pressure: pressureOf(n, nowIso, zone) }))
    .filter((x): x is { node: NodeState; pressure: number } =>
      x.pressure !== null && Number.isFinite(x.pressure) && x.pressure >= minPressure)
    .sort((a, b) => b.pressure - a.pressure || (a.node.id < b.node.id ? -1 : 1))
    .map(x => ({ node: x.node, reason: 'pressure' as const, pressure: x.pressure, words: 'ready again' }));
}

/**
 * What the work surface should actually render: Next-up with the chip items and
 * the replan items REMOVED from it.
 *
 * A ready upkeep qualifies for both projections, and the first version rendered
 * both sections from the same state with no dedup — so the same title appeared
 * twice on one screen, with the same words and two separate Done buttons writing
 * to the same node. For a COGA-informed surface whose entire promise is "one
 * thing", showing the one thing twice is a defect, not a redundancy.
 *
 * REPLAN ITEMS ARE REMOVED FOR A DIFFERENT REASON, and it is the sharper one.
 * An item whose hard date went by qualifies here as `hard-date` — "a real date,
 * and it is here" — while the replan surface above is asking "should this still
 * happen, and by when?". Those are not two views of one item; they are two
 * different questions, and answering the easy one ("do it now") is exactly the
 * move that produced the passed date. Law 3 says the passed date becomes a
 * decision, so the decision is the only thing offered.
 *
 * The exclusion is UNCAPPED while the replan surface shows at most three. The
 * remainder are not lost: `heldGroups` is the complete inventory and still
 * carries them, and the replan surface states the true total, so the cap is
 * bounded re-entry (law 8) rather than a hiding place.
 */
export function workSurface(state: State, nowIso: string, zone: string, cycle = 0): {
  up: NextUp; chips: NextUpItem[];
} {
  const replanning = replanIds(state, nowIso, zone);
  const chips = upkeepChips(state, nowIso, zone).filter(c => !replanning.has(c.node.id));
  const chipIds = new Set(chips.map(c => c.node.id));
  const queue = nextUpQueue(state, nowIso, zone)
    .filter(i => !chipIds.has(i.node.id) && !replanning.has(i.node.id));
  if (queue.length === 0) return { up: { head: null, behind: [], total: 0 }, chips };
  const start = ((cycle % queue.length) + queue.length) % queue.length;
  const rotated = [...queue.slice(start), ...queue.slice(0, start)];
  return {
    up: { head: rotated[0] ?? null, behind: rotated.slice(1, 1 + BEHIND_CAP), total: queue.length },
    chips,
  };
}
