// Named ranges — the lawful shape of "act on more than you can see" (1.3.0).
//
// Law 8 caps what a surface may SHOW, and the recorded resolution (NOTES.md,
// "Selecting ranges") is the amnesty's: the cap governs display; a range the
// USER NAMED is legitimate to act on. So a range here is three things — a pure
// predicate over state, a sentence in the user's own words, and a live count —
// and never a rendered list. The picker shows sentences and counts; sort mode
// shows one card. That is the whole visibility a backlog gets.
//
// RANGE HYGIENE IS LOAD-BEARING. The clarify queue's own comment records why:
// an over-broad predicate offers routes that hard-fail on demand-free kinds,
// and a route on a Menu item would mint the Menu-plus-clock state no surface
// can render. `sortable` below is the one definition of what a sorting surface
// may hold: runway kinds only — no person, no bother, no container, no
// demand-free kind, nothing on the Menu, nothing finished, nothing trashed or
// merged away. A deliberate-failure test asserts that removing any clause
// lets an illegal kind through.
//
// PURE. `now` and `zone` are arguments, like every projection here.

import { compareOrdering, type NodeState, type State } from './fold.ts';
import { heldNodes } from './gate.ts';
import { isContainer } from './tree.ts';
import { isValidIso } from './time.ts';
import { searchHeld } from './search.ts';

/** The kinds a sorting card may legally act on — runway work, nothing else. */
const SORTABLE_KINDS: ReadonlySet<string> = new Set(['action', 'waiting-for', 'upkeep']);

/**
 * May a sorting surface hold this node? One predicate, used by every range,
 * so "what sort mode can reach" has exactly one answer.
 */
export const sortable = (n: NodeState): boolean =>
  !n.trashed && !n.mergedInto
  && SORTABLE_KINDS.has(n.kind)
  && n.onMenu === null
  && !n.lastDone;

/**
 * Oldest first, so a seven-year residue is met from the far end and the range
 * shrinks visibly where it is deepest.
 *
 * By the GENESIS STAMP — the (at, device, seq) ordering of the event that
 * titled the node — never by raw id. ULIDs sort by time only to the
 * millisecond: a 1,445-row import lands in ONE commit, so its ids share a
 * timestamp and their tail bits are random — id order within the batch is
 * shuffle order, which made "oldest first" a different lie each session
 * (found by the smoke walk routing a card the display never showed).
 */
const oldestFirst = (a: NodeState, b: NodeState): number => {
  const sa = a.stamps['title'], sb = b.stamps['title'];
  if (sa && sb) {
    const c = compareOrdering(sa, sb);
    if (c !== 0) return c;
  }
  return a.id < b.id ? -1 : 1;
};

/**
 * "Loose from the import" — brought in from another planner, never filed,
 * never sorted. `captured` is the discriminator: typed items enter via
 * `capture.recorded` (which latches it), imported ones via `node.created`
 * (which does not). Provenance cannot tell these apart — the importer and the
 * sample set both write `{for:'self'}` — and must not be built on.
 */
export const looseFromImport = (state: State): NodeState[] =>
  heldNodes(state)
    .filter(sortable)
    .filter(n => !n.captured && n.route === null && n.parent === null)
    .sort(oldestFirst);

/** "Everything under [container]" — live sortable descendants, transitively.
 *  Cycle-guarded like every tree walk here: a shard can deliver half a loop. */
export function underContainer(state: State, rootId: string): NodeState[] {
  const out: NodeState[] = [];
  const seen = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const n of state.nodes.values()) {
      if (n.parent !== cur || seen.has(n.id)) continue;
      seen.add(n.id);
      queue.push(n.id);
      if (sortable(n)) out.push(n);
    }
  }
  return out.sort(oldestFirst);
}

/**
 * "Parked and now back" — the park clock has passed. A park never demands
 * (deliberately — held away on purpose), and a passed one raises no replan
 * card, so WITHOUT this range a returned park is a status word in "Later" and
 * nothing more. This range is what makes parking honest rather than an
 * archive with a return date.
 */
export const parkedAndBack = (state: State, nowIso: string): NodeState[] =>
  heldNodes(state)
    .filter(sortable)
    .filter(n => {
      const p = n.clocks.park;
      return !!p && isValidIso(p.at) && Date.parse(p.at) <= Date.parse(nowIso);
    })
    .sort(oldestFirst);

/** "Matching [the user's own words]" — the search predicate, narrowed to what
 *  a sorting card may hold. */
export const matchingQuery = (state: State, query: string): NodeState[] =>
  searchHeld(state, query, Number.MAX_SAFE_INTEGER).items
    .filter(sortable)
    .sort(oldestFirst);

/** One choice in the picker: a sentence, a count, and the items behind them.
 *  The picker renders the first two and NEVER the third (law 8). */
export interface RangeChoice {
  key: string;
  words: string;
  count: number;
  items: () => NodeState[];
}

/**
 * What the picker offers, computed fresh: the fixed ranges that currently hold
 * anything, plus one entry per container with sortable descendants. Empty
 * ranges are not offered — a door to nowhere is noise.
 *
 * GETTERS, not values (audit, CRITICAL). The first version closed each
 * choice's `items` over the state object passed in — a frozen snapshot,
 * because `session.commit` replaces the state object on every write. The
 * conveyor kept offering items live state had disqualified: the detail sheet
 * is reachable mid-sort, so the very card on screen could be completed or
 * sent to the Menu and then still routed. Every `items()` call now re-reads.
 */
export function rangeChoices(getState: () => State, nowIso: () => string): RangeChoice[] {
  const state = getState();
  const out: RangeChoice[] = [];
  const loose = looseFromImport(state);
  if (loose.length > 0) {
    out.push({
      key: 'loose-import',
      words: 'Loose things brought in from another planner',
      count: loose.length,
      items: () => looseFromImport(getState()),
    });
  }
  const back = parkedAndBack(state, nowIso());
  if (back.length > 0) {
    out.push({
      key: 'parked-back',
      words: 'Parked, and now back',
      count: back.length,
      items: () => parkedAndBack(getState(), nowIso()),
    });
  }
  for (const c of heldNodes(state).filter(isContainer)
    .sort((a, b) => (a.title || '').localeCompare(b.title || ''))) {
    const under = underContainer(state, c.id);
    if (under.length === 0) continue;
    out.push({
      key: `under:${c.id}`,
      words: `Everything under ${c.title || '(untitled)'}`,
      count: under.length,
      items: () => underContainer(getState(), c.id),
    });
  }
  return out;
}
