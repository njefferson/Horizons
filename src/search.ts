// Finding something you are holding (read-only).
//
// The other half of the answer to "it moved and I do not know where it went":
// type a word and everything you hold that matches is there. This is a
// PROJECTION — a pure function of state, computed and never stored. Searching
// writes nothing: there is no query log, no recent-searches list, no event that
// could carry one, by design (law 7's spirit — the app keeps no record of your
// looking).
//
// PURE. No clock, no I/O, testable at any moment.

import type { NodeState, State } from './fold.ts';
import { heldNodes, releasedNodes } from './gate.ts';

/**
 * The comparable form of a title: decomposed, diacritics stripped, lowercased,
 * whitespace collapsed. Matching is on this, so "cafe" finds "Café", case never
 * matters, and a stray double space does not hide a result. NFD + stripping the
 * combining marks is what makes it accent-insensitive without a lookup table.
 */
/** Exported since 1.3.0: the parent picker's type-to-narrow and the matching
 *  range reuse the same folding, so "does this match" has one answer app-wide. */
export const normalize = (s: string): string =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Capped like every other list in this app — a two-letter query must not be
 *  able to paint a thousand rows, which is the pile the whole product stands
 *  between you and. The true total is returned so the cap is never a silent lie. */
export const SEARCH_CAP = 25;

export interface SearchResult {
  /** The matches, newest first, at most `cap` of them. */
  items: NodeState[];
  /** How many matched in total, so the surface can say what it is holding back. */
  total: number;
  /** The normalized query actually run — empty when the input was blank or only
   *  whitespace, which is the "show nothing" case. */
  query: string;
}

/**
 * Everything you are holding whose title contains the query.
 *
 * "Held" is `heldNodes` — not trashed, not merged away. A thing you decided was
 * not a thing is gone by decision, not lost, so the trash is deliberately not
 * searched; the ways back from a mistaken trashing are the undo bar in the
 * moment and "Things you let go" behind the (i) after it (1.5.0, ADR-0050) —
 * never search, which must only ever answer about what you are holding.
 *
 * **Not `heldWork`, and the difference is deliberate.** Search answers "where
 * did that go", and a person, a Menu wish and a container are all findable
 * because they all exist and can be opened. Only PEBBLES are excluded, for a
 * reason that is not about the set: a pebble's row is a door to a detail sheet
 * built for work — routes, clocks, "put it in today" — every one of which the
 * gate must then refuse on a demand-free kind. That is the offered-then-refused
 * shape of the 1.9.2 audit's F-B. The load entry is a pebble's surface and it
 * is the only one. (A journal entry cannot match anyway: it has no title, and
 * `''.includes(q)` is false for any real query.)
 */
export function searchHeld(state: State, query: string, cap = SEARCH_CAP): SearchResult {
  const q = normalize(query);
  if (!q) return { items: [], total: 0, query: '' };
  const matches = heldNodes(state)
    .filter(n => n.kind !== 'pebble')
    .filter(n => normalize(n.title).includes(q))
    // Newest first — ULIDs sort by time, the only order the held surfaces claim.
    .sort((a, b) => (a.id < b.id ? 1 : -1));
  return { items: matches.slice(0, cap), total: matches.length, query: q };
}

/**
 * The same query, over things you have PUT DOWN (1.32.0).
 *
 * **This is the only way to reach one, and that is the design.** A put-down
 * thing has no surface, no count and no collection to browse — a place to look
 * at everything you have stopped carrying is another pile, and the regret such a
 * list accumulates is exactly what made discarding feel expensive.
 *
 * But it must not be gone either, or putting a thing down is deletion with a
 * softer word, and this audience will not use it. So: it answers a query you
 * TYPED, about a thing you REMEMBERED, and never volunteers. That reversibility
 * is what makes putting something down cheap enough to actually do, which is the
 * whole mechanism.
 *
 * Separate from `searchHeld` rather than a flag on it, because every caller of
 * that function means "what am I holding" and none of them should silently start
 * meaning something else.
 */
export function searchReleased(state: State, query: string, cap = SEARCH_CAP): SearchResult {
  const q = normalize(query);
  if (!q) return { items: [], total: 0, query: '' };
  const matches = releasedNodes(state)
    .filter(n => n.kind !== 'pebble')
    .filter(n => normalize(n.title).includes(q))
    .sort((a, b) => (a.id < b.id ? 1 : -1));
  return { items: matches.slice(0, cap), total: matches.length, query: q };
}
