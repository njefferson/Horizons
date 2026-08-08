// The search surface (read-only).
//
// One input, results that only exist once you have typed, each opening straight
// to its detail sheet. It commits NOTHING — no event, no draft, no history — so
// nothing about searching is ever kept. Everything the reader sees is set with
// textContent; every result is a real <button> at full target size; the count is
// announced in a live region so a screen-reader user learns how many matched.

import type { Session } from './session.ts';
import type { NodeState } from '../fold.ts';
import { searchHeld, searchReleased } from '../search.ts';
import { heldStatus } from '../held.ts';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

export interface SearchUI { refresh(): void }

/**
 * Mount search. `now` is injected like everywhere else so the status word each
 * result carries ("today", "on the Menu", "done") is testable at a fixed moment.
 * `openDetail` is the shell's own sheet-opener, reused so a found item behaves
 * exactly like a tapped card.
 */
export function mountSearch(session: Session, now: () => number, openDetail: (n: NodeState) => void): SearchUI {
  const input = document.querySelector<HTMLInputElement>('#search-input');
  const summary = document.querySelector<HTMLElement>('#search-summary');
  const results = document.querySelector<HTMLElement>('#search-results');
  if (!input || !summary || !results) return { refresh() {} };
  const INPUT = input, SUMMARY = summary, RESULTS = results;

  const run = (): void => {
    const { items, total, query } = searchHeld(session.state(), INPUT.value);

    // Blank query: nothing shown, nothing announced. Search is a tool you reach
    // for, not a surface that greets you with an empty results box.
    if (!query) {
      SUMMARY.hidden = true;
      SUMMARY.textContent = '';
      RESULTS.replaceChildren();
      return;
    }

    SUMMARY.hidden = false;
    // "…you are HOLDING" is exact and stays exact: something you put down is not
    // held, and it is reported separately below rather than folded into this
    // number. A summary that counted both would make "nothing matches" false in
    // the one case where the reader most needs it to be true.
    SUMMARY.textContent = total === 0
      ? 'Nothing you are holding matches that.'
      : total === items.length
        ? `${total} ${total === 1 ? 'match' : 'matches'}.`
        : `Showing ${items.length} of ${total} matches — add a word to narrow it.`;

    const nowIso = new Date(now()).toISOString();
    RESULTS.replaceChildren(...items.map(n => {
      const li = el('li', 'search-item');
      const b = el('button', 'search-open');
      b.type = 'button';
      b.append(el('span', 'search-title', n.title || '(untitled)'));
      // Where it is now, in the same words the held list uses — so the answer to
      // "where did it go" is on the row before you even open it.
      b.append(el('span', 'search-where', heldStatus(n, nowIso, session.zone)));
      b.addEventListener('click', () => openDetail(n));
      li.append(b);
      return li;
    }));

    // AND THINGS YOU HAVE PUT DOWN (1.32.0) — the only way to reach one.
    //
    // Appended after what you are holding, never mixed in, and it says which
    // these are. There is no other route: a put-down thing has no surface, no
    // count and no collection to browse, because a place to look at everything
    // you stopped carrying is another pile and the regret it collects is exactly
    // what made discarding feel expensive.
    //
    // It answers a query you TYPED about a thing you REMEMBERED, and never
    // volunteers. The sentence says how many matched THIS query and never how
    // many exist — a total would be the count this verb was designed without.
    const down = searchReleased(session.state(), INPUT.value);
    if (down.total > 0) {
      const head = el('li', 'search-down-head');
      head.textContent = down.total === 1
        ? 'One thing you put down also matches.'
        : `${down.total} things you put down also match.`;
      RESULTS.append(head);
      for (const n of down.items) {
        const li = el('li', 'search-item');
        const b = el('button', 'search-open');
        b.type = 'button';
        b.append(el('span', 'search-title', n.title || '(untitled)'));
        b.append(el('span', 'search-where', 'put down — open it to pick it back up'));
        b.addEventListener('click', () => openDetail(n));
        li.append(b);
        RESULTS.append(li);
      }
    }
  };

  // Live as you type. No debounce: the corpus is what one person holds, the
  // filter is a substring test, and a keystroke's worth of latency is not a
  // thing this audience should have to wait through.
  INPUT.addEventListener('input', run);

  // `refresh` re-runs the current query against fresh state — so editing a found
  // item and coming back shows its new status without retyping. It reads the
  // input, never clears it.
  return { refresh: run };
}
