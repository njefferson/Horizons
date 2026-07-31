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
import { heldNodes } from './gate.ts';

/**
 * The comparable form of a title: decomposed, diacritics stripped, lowercased,
 * whitespace collapsed. Matching is on this, so "cafe" finds "Café", case never
 * matters, and a stray double space does not hide a result. NFD + stripping the
 * combining marks is what makes it accent-insensitive without a lookup table.
 */
const normalize = (s: string): string =>
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
 * "Held" is `heldNodes` — not trashed, not merged away — which is the SAME set
 * the coverage gauge counts, so search and the gauge can never disagree about
 * what exists. A thing you decided was not a thing is gone by decision, not
 * lost, so the trash is deliberately not searched; undo is the way back from a
 * mistaken trashing, not search.
 */
export function searchHeld(state: State, query: string, cap = SEARCH_CAP): SearchResult {
  const q = normalize(query);
  if (!q) return { items: [], total: 0, query: '' };
  const matches = heldNodes(state)
    .filter(n => normalize(n.title).includes(q))
    // Newest first — ULIDs sort by time, the only order the held surfaces claim.
    .sort((a, b) => (a.id < b.id ? 1 : -1));
  return { items: matches.slice(0, cap), total: matches.length, query: q };
}
