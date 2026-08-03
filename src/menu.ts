// The Menu, and the save-for gauges (v1.5).
//
// `menu.item.added` carries a category from a closed list — read, try, go, make,
// research, save-for — and nothing in the app has ever read it. Every Menu item
// went into one undifferentiated bucket on the held list, so the category was
// collected and discarded, and "the Menu" was a heading rather than a place.
//
// `save-for.updated { target, saved }` was never folded at all, so the one
// category that carries a number could not carry one.
//
// **The Menu is demand-free by construction (law 6) and this surface must not
// undo that.** Nothing here has a clock, nothing accrues, nothing turns a colour
// as time passes. A save-for gauge is the sharpest test of that: a progress bar
// is a machine for implying you are behind, and the only honest version states
// two numbers and their difference and stops.
//
// PURE.

import type { NodeState, State } from './fold.ts';
import { heldNodes } from './gate.ts';
import type { MenuCategory } from './events.ts';

/** The closed list, in the order the surface shows them. */
export const MENU_CATEGORIES: readonly MenuCategory[] = [
  'read', 'try', 'go', 'make', 'research', 'save-for',
];

/** What each one is called where a person can see it. */
export const MENU_WORDS: Record<MenuCategory, string> = {
  read: 'Read', try: 'Try', go: 'Go', make: 'Make',
  research: 'Look into', 'save-for': 'Save for',
};

export interface MenuGroup {
  category: MenuCategory;
  title: string;
  items: NodeState[];
}

export interface SaveFor {
  node: NodeState;
  /** What it costs, and what is put by. Either may be null — a save-for with no
   *  target is a perfectly ordinary wish, and demanding a number before you may
   *  want something would be this app deciding what counts as a real plan. */
  target: number | null;
  saved: number | null;
}

/**
 * The Menu, by category, empty categories omitted.
 *
 * An empty category is not shown, because a heading with nothing under it reads
 * as a gap to fill — and an empty "Go" is not a gap, it is simply a thing you
 * have not wished for. The Menu is where wishes live, and a wish list that
 * prompts you is a demand list.
 */
export function menuGroups(state: State): MenuGroup[] {
  const by = new Map<MenuCategory, NodeState[]>();
  for (const n of heldNodes(state)) {
    if (!n.onMenu) continue;
    const c = n.onMenu;
    if (!by.has(c)) by.set(c, []);
    by.get(c)!.push(n);
  }
  return MENU_CATEGORIES
    .filter(c => (by.get(c)?.length ?? 0) > 0)
    .map(c => ({
      category: c,
      title: MENU_WORDS[c],
      // By id: a TOTAL order, so the Menu is in the same order every time you
      // open it. A list of wishes that reshuffles is one you have to re-read.
      items: (by.get(c) ?? []).sort((a, b) => (a.id < b.id ? -1 : 1)),
    }));
}

/** How many are on the Menu altogether — the SUM OF THE GROUPS, one
 *  definition (1.17.4). This counted ANY truthy `onMenu` while `menuGroups`
 *  renders only the six closed-list categories, so a category from outside
 *  the list — an import from a newer edition, a hand-edited shard — was
 *  counted by the Menu's own line while rendering nowhere. The count is now
 *  derived from the groups, so the number and the rows cannot disagree. */
export const menuCount = (state: State): number =>
  menuGroups(state).reduce((t, g) => t + g.items.length, 0);

/** The save-for items, with their numbers. */
export function saveFors(state: State): SaveFor[] {
  return heldNodes(state)
    .filter(n => n.onMenu === 'save-for')
    .map(n => ({ node: n, target: n.saveTarget, saved: n.saveSaved }))
    .sort((a, b) => (a.node.id < b.node.id ? -1 : 1));
}

/**
 * What a save-for says.
 *
 * **Two numbers and the difference, and nothing else.** No percentage, no bar,
 * no "you're nearly there", no projected date. A percentage is a score, a bar is
 * a machine for implying you are behind, and a projected date turns a wish into
 * a commitment you never made — on the one surface in this app that is
 * structurally incapable of nagging (law 6).
 *
 * Silence when a term is missing. A target with nothing saved says the target
 * and stops; neither says nothing at all, and that is an ordinary state rather
 * than an incomplete one.
 */
export function saveForWords(s: SaveFor, currency = '£'): string | null {
  const money = (v: number): string =>
    `${currency}${v % 1 === 0 ? v.toFixed(0) : v.toFixed(2)}`;
  const { target, saved } = s;
  if (target === null && saved === null) return null;
  if (target === null) return `${money(saved!)} put by.`;
  if (saved === null) return `${money(target)}.`;
  if (saved >= target) return `${money(saved)} put by — that is enough.`;
  return `${money(saved)} put by of ${money(target)}. ${money(target - saved)} to go.`;
}

/** The Menu's own line. A count, and an explicit statement that none of it is
 *  asking — which is the entire point of the Menu and the thing most likely to
 *  be forgotten by whoever next changes this surface. */
export function menuWords(n: number): string {
  if (n === 0) return '';
  if (n === 1) return 'One thing, whenever you want it. Nothing here is asking.';
  return `${n} things, whenever you want them. Nothing here is asking.`;
}
