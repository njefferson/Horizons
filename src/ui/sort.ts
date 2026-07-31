// Sort mode — the second triage, over a range the user NAMED (1.3.0).
//
// The daily triage surface is captures-not-yet-routed, one card at a time. It
// structurally cannot reach an imported backlog: the `captured` latch bars
// anything that arrived by `node.created`, which is every row of an OmniFocus
// import. This surface is the same one-card conveyor pointed at a NAMED RANGE
// — the lawful bulk shape NOTES.md records: the cap governs what a surface
// shows; a range the user named is legitimate to act on. The picker shows
// sentences and counts, never lists; the card shows one thing.
//
// Shame-free at 1,222 by construction: the range's true total is stated once
// at entry as a checkable fact (the purge precedent), and during sorting NO
// number is shown — no tally, no remaining countdown, no percentage, no bar
// (law 5; a per-sitting counter is a score with a different name). Leaving is
// a Close tap and records nothing. On return the range is simply smaller.
//
// Verbs: the six routes, emitting EXACTLY what daily triage writes
// (`routeEvents`, reused verbatim — parity is a property test); "Open it"
// (the detail sheet, which carries rename, dates, filing, people); "Leave it"
// (next card, writes NOTHING — skipped items cycle in memory only, per the
// no-declined-record rule); and the same one-step undo the daily surface has
// (`clarify.reopened`; the gate re-cures).

import type { Session } from './session.ts';
import type { NodeState } from '../fold.ts';
import type { ClarifyRoute, NodeKind } from '../events.ts';
import { rangeChoices, matchingQuery, sortable, type RangeChoice } from '../range.ts';
import { demandClocksOf, routeEvents, undoRouteEvents } from './triage-intents.ts';
import { heldStatus } from '../held.ts';

const ROUTES: { route: ClarifyRoute; label: string; hint: string }[] = [
  { route: 'do-now', label: 'Do now', hint: 'this one is for today' },
  { route: 'next-action', label: 'Next action', hint: 'a real next step, comes back tomorrow' },
  { route: 'waiting-for', label: 'Waiting for', hint: 'someone else owes you this' },
  { route: 'someday', label: 'Someday', hint: 'onto the Menu, no clock' },
  { route: 'reference', label: 'Reference', hint: 'keep it, don’t act on it' },
  { route: 'trash', label: 'Trash', hint: 'not a thing after all' },
];

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

export interface SortUI { refresh(): void }

export function mountSort(
  session: Session, now: () => number, onChange: () => void,
  openDetail: (n: NodeState) => void,
): SortUI {
  const q = <T extends HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);
  const dlg = q<HTMLDialogElement>('#sort');
  const openBtn = q<HTMLButtonElement>('#sort-open');
  const picker = q('#sort-picker');
  const choices = q('#sort-choices');
  const queryInput = q<HTMLInputElement>('#sort-query');
  const queryGo = q<HTMLButtonElement>('#sort-query-go');
  const cardRegion = q('#sort-card-region');
  const entry = q('#sort-entry');
  const card = q<HTMLButtonElement>('#sort-card');
  const where = q('#sort-where');
  const actions = q('#sort-actions');
  const undoBar = q('#sort-undo');
  const live = q('#sort-live');
  if (!dlg || !openBtn || !picker || !choices || !queryInput || !queryGo
    || !cardRegion || !entry || !card || !where || !actions || !undoBar || !live) {
    return { refresh() {} };
  }
  const DLG = dlg, PICKER = picker, CHOICES = choices, CARDR = cardRegion,
    ENTRY = entry, CARD = card, WHERE = where, ACTIONS = actions, UNDO = undoBar, LIVE = live;

  /** The active range's item-getter, re-run against FRESH state per card — the
   *  range recomputes live, so a thing routed elsewhere leaves it on its own. */
  let activeItems: (() => NodeState[]) | null = null;
  /** Ids passed over with "Leave it" THIS SITTING. Memory only, never written:
   *  a skip that survived the dialog closing would be a record of a decision
   *  the app promised not to keep. */
  let skipped = new Set<string>();
  /** Ids ACTED ON this sitting. A routed item can legitimately still satisfy a
   *  text range (routing does not change its title), and a conveyor that
   *  re-offers what you just decided is a conveyor that stalls — so an act
   *  moves past it for the rest of the sitting. Undo takes it back OUT of this
   *  set, which is what brings the card back. Memory only, like `skipped`. */
  let handled = new Set<string>();
  let showing: NodeState | null = null;
  let busy = false;

  const nowIso = (): string => new Date(now()).toISOString();

  const say = (msg: string): void => { LIVE.textContent = msg; };

  /** The next card from the live range: first item not skipped this sitting;
   *  when only skipped ones remain, they come round again. */
  const nextItem = (): NodeState | null => {
    if (!activeItems) return null;
    const items = activeItems();
    const fresh = items.find(n => !skipped.has(n.id) && !handled.has(n.id));
    if (fresh) return fresh;
    // Everything left this sitting has been left once: start the round again
    // rather than wedging on the head item for ever while announcing success
    // (audit). Clearing the lap is what makes "Leave it" always advance.
    const rest = items.filter(n => !handled.has(n.id));
    if (rest.length > 0) { skipped = new Set(); return rest[0]!; }
    return null;
  };

  const showPicker = (): void => {
    activeItems = null;
    showing = null;
    PICKER.hidden = false;
    CARDR.hidden = true;
    UNDO.replaceChildren();
    const list = rangeChoices(() => session.state(), nowIso);
    CHOICES.replaceChildren(...list.map(c => {
      const li = el('li');
      const b = el('button', 'sort-choice');
      b.type = 'button';
      b.append(el('span', 'sort-choice-words', c.words));
      b.append(el('span', 'sort-choice-count',
        c.count === 1 ? '1 thing' : `${c.count} things`));
      b.addEventListener('click', () => enterRange(c));
      li.append(b);
      return li;
    }));
    if (list.length === 0) {
      const li = el('li', 'sort-choice-none',
        'Nothing here needs wholesale sorting right now.');
      CHOICES.append(li);
    }
  };

  const enterRange = (c: RangeChoice): void => {
    activeItems = c.items;
    skipped = new Set();
    handled = new Set();
    PICKER.hidden = true;
    CARDR.hidden = false;
    // The true total, stated ONCE at entry as a checkable fact. This is the
    // only number sorting ever shows.
    ENTRY.textContent = `${c.words} — ${c.count === 1 ? 'one thing' : `${c.count} things`}, oldest first.`;
    renderCard();
  };

  /** After an action removes the control it was on, focus lands somewhere real
   *  (WCAG 2.4.3) — the entry line mid-range, the back button once it is done.
   *  The daily surface has done this since Phase 2; this one shipped without it
   *  (audit), in the mode built for a thousand consecutive actions. */
  const restoreFocus = (): void => {
    if (!DLG.open) return;
    if (CARD.disabled) q<HTMLButtonElement>('#sort-back')?.focus();
    else ENTRY.focus();
  };

  function renderCard(): void {
    const n = nextItem();
    showing = n;
    if (!n) {
      CARD.textContent = 'That is all of them.';
      CARD.disabled = true;
      WHERE.textContent = '';
      ACTIONS.replaceChildren();
      // Say it: the visual card changing is invisible to a screen reader, and
      // finishing a range deserves words, not silence (audit).
      say('That is all of them.');
      return;
    }
    CARD.disabled = false;
    CARD.textContent = n.title || '(untitled)';
    WHERE.textContent = heldStatus(n, nowIso(), session.zone);
    ACTIONS.replaceChildren(
      ...ROUTES.map(({ route, label, hint }) => {
        const b = el('button', 'route');
        b.type = 'button';
        b.append(el('span', 'route-label', label), el('span', 'route-hint', hint));
        b.addEventListener('click', () => { void act(n, route, label); });
        return b;
      }),
      (() => {
        const b = el('button', 'route');
        b.type = 'button';
        b.append(el('span', 'route-label', 'Leave it'),
          el('span', 'route-hint', 'skip for now — writes nothing'));
        b.addEventListener('click', () => {
          skipped.add(n.id);
          renderCard();
          // Honest words: with one thing left, "left it" and showing it again
          // in the same breath would be the app contradicting itself.
          say(showing && showing.id === n.id
            ? 'Left where it is — and it is the only one left this sitting.'
            : 'Left where it is.');
          restoreFocus();
        });
        return b;
      })(),
    );
  }

  const act = async (n: NodeState, route: ClarifyRoute, label: string): Promise<void> => {
    if (busy) return;
    // THE FRESH CHECK (audit, CRITICAL): the card's closure was captured at
    // render time, and the world may have moved — the sheet is reachable from
    // here, so the very item on screen can have been completed or sent to the
    // Menu between paint and tap. Routing the stale copy writes decisions the
    // user just contradicted, permanently. Refuse in words and repaint instead.
    const fresh = session.state().nodes.get(n.id);
    if (!fresh || !sortable(fresh)) {
      say('That one changed while it was on screen — here is the fresh view.');
      renderCard();
      return;
    }
    busy = true;
    UNDO.replaceChildren();
    const fromKind = fresh.kind;
    try {
      await session.commit(ctx => routeEvents(ctx, n.id, route, fromKind, demandClocksOf(fresh)));
      handled.add(n.id);
      say(`Sent to ${label}.`);
      showUndo(n.id, route, fromKind, label);
    } catch (err) {
      say(`Couldn’t do that — ${(err as Error).message}`);
    } finally {
      busy = false;
    }
    try { onChange(); } catch { /* a render bug must not contradict a landed write */ }
    renderCard();
    restoreFocus();
  };

  /** The same last-action undo the daily surface has: names where it went, one
   *  tap brings it back (`clarify.reopened`; the gate re-cures coverage). */
  const showUndo = (node: string, route: ClarifyRoute, fromKind: NodeKind, label: string): void => {
    const bar = el('p', 'triage-undo-bar');
    bar.append(el('span', 'triage-undo-where', `Sent to ${label}.`));
    const btn = el('button', 'linklike triage-undo-btn', 'Undo');
    btn.type = 'button';
    btn.addEventListener('click', () => {
      btn.disabled = true;
      void session.commit(ctx => undoRouteEvents(ctx, node, route, fromKind))
        .then(() => {
          handled.delete(node);
          UNDO.replaceChildren();
          say('Taken back — it is in the range again.');
          try { onChange(); } catch { /* renders next pass */ }
          renderCard();
          restoreFocus();
        })
        .catch((err: Error) => { btn.disabled = false; say(`Couldn’t undo — ${err.message}`); });
    });
    bar.append(btn);
    UNDO.replaceChildren(bar);
  };

  CARD.addEventListener('click', () => {
    if (!showing) return;
    const fresh = session.state().nodes.get(showing.id);
    if (fresh) openDetail(fresh);
  });

  // Enter submits — the box says enterkeyhint="search" and a hint that lies is
  // worse than none (audit; the rename box learned this first).
  queryInput.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') { e.preventDefault(); queryGo.click(); }
  });
  queryGo.addEventListener('click', () => {
    const words = queryInput.value.trim();
    if (!words) { say('Type a word or two first.'); return; }
    const items = matchingQuery(session.state(), words);
    if (items.length === 0) { say('Nothing you are holding matches that.'); return; }
    enterRange({
      key: 'matching',
      words: `Things matching “${words}”`,
      count: items.length,
      items: () => matchingQuery(session.state(), words),
    });
  });

  openBtn.addEventListener('click', () => {
    showPicker();
    LIVE.textContent = '';
    queryInput.value = '';
    if (!DLG.open) DLG.showModal();
  });
  q<HTMLButtonElement>('#sort-close')?.addEventListener('click', () => DLG.close());
  q<HTMLButtonElement>('#sort-back')?.addEventListener('click', showPicker);

  return {
    refresh(): void {
      // Re-render the current card against fresh state while open — a write
      // from another surface (the detail sheet is reachable from here) must be
      // reflected the moment it lands.
      if (DLG.open && activeItems) renderCard();
    },
  };
}
