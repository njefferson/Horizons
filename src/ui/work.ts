// Work mode: Next up, Upkeep chips, and the tappable coverage gauge
// (build-plan items 18–21). The first point the app is worth opening in the
// morning.
//
// One thing is offered. "Done" records it; "Not this" moves on and RECORDS
// NOTHING — no event, no penalty, no memory. Declining is not data. If it were,
// the surface would be keeping score, and a person who has to justify a skip
// stops opening the app.
//
// Everything a person reads here is set with textContent, states its reason in
// words (nothing depends on seeing a colour, B-01), and every control is a real
// <button> at full target size. Focus is moved deliberately after an action,
// because acting removes the control that was acted on.

import type { Session } from './session.ts';
import type { AppEvent } from '../events.ts';
import { nextUp, upkeepChips, type NextUpItem } from '../nextup.ts';
import { pressureWords } from '../pressure.ts';
import { calendarDaysBetween } from '../time.ts';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/** Marking a thing done. Gated — completing a one-off can orphan its parent, so
 *  the gate may attach a cure, and it is the gate's business either way. */
export const doneEvents = (
  ctx: { id: () => string; vault: string; at: string; device: string; seq: () => number },
  node: string,
): AppEvent[] => [{
  id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
  kind: 'done.marked', node, payload: { at: ctx.at },
} as AppEvent];

export interface WorkUI { refresh(): void }

export function mountWork(session: Session, now: () => number, onChange: () => void): WorkUI {
  const q = <T extends HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);
  const region = q('#nextup');
  const heading = q('#nextup-heading');
  const title = q('#nextup-title');
  const why = q('#nextup-why');
  const doneBtn = q<HTMLButtonElement>('#nextup-done');
  const skipBtn = q<HTMLButtonElement>('#nextup-skip');
  const count = q('#nextup-count');
  const behind = q('#nextup-behind');
  const live = q('#nextup-live');
  const upkeepRegion = q('#upkeep');
  const chips = q('#upkeep-chips');
  const gauge = q<HTMLButtonElement>('#gauge');
  const coverage = q('#coverage');
  if (!region || !heading || !title || !why || !doneBtn || !skipBtn || !count ||
      !behind || !live || !upkeepRegion || !chips || !gauge || !coverage) {
    return { refresh() {} };
  }
  const REGION = region, HEADING = heading, TITLE = title, WHY = why, COUNT = count,
    BEHIND = behind, LIVE = live, UPKEEP = upkeepRegion, CHIPS = chips,
    GAUGE = gauge, COVERAGE = coverage;

  // "Not this" lives HERE, in memory, and nowhere else. It is deliberately not
  // persisted: a skip that survived a reload would be a record of a decision the
  // app promised not to keep.
  let cycle = 0;
  let current: NextUpItem | null = null;

  const nowIso = (): string => new Date(now()).toISOString();

  const markDone = async (): Promise<void> => {
    if (!current) return;
    const node = current.node.id;
    const label = current.node.title;
    try {
      await session.commit(ctx => doneEvents(ctx, node));
      LIVE.textContent = `Done: ${label}.`;
      // A completed item should not be replaced by the same one; the fold has
      // moved it, so the next refresh naturally offers the next thing.
      cycle = 0;
    } catch (err) {
      LIVE.textContent = `Couldn’t record that — ${(err as Error).message}`;
    }
    onChange();
    refresh();
    if (!REGION.hidden) HEADING.focus();
  };

  const skip = (): void => {
    cycle += 1;                       // nothing else happens. That is the point.
    refresh();
    LIVE.textContent = current ? `Showing ${current.node.title} instead.` : 'Nothing else is asking.';
    if (!REGION.hidden) HEADING.focus();
  };

  doneBtn.addEventListener('click', () => void markDone());
  skipBtn.addEventListener('click', skip);

  GAUGE.addEventListener('click', () => {
    const open = COVERAGE.hidden;
    COVERAGE.hidden = !open;
    GAUGE.setAttribute('aria-expanded', String(open));
  });

  /** Plain words for when something returns — calendar days in the reader's
   *  zone, never a countdown and never a rebuke. */
  const returns = (iso: string): string => {
    const d = calendarDaysBetween(nowIso(), iso, session.zone);
    if (d < 0) return 'ready now';
    if (d === 0) return 'today';
    if (d === 1) return 'tomorrow';
    if (d < 7) return `in ${d} days`;
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: session.zone });
  };

  function refresh(): void {
    const state = session.state();
    const iso = nowIso();
    const up = nextUp(state, iso, session.zone, cycle);
    current = up.head;

    if (up.head) {
      REGION.hidden = false;
      TITLE.textContent = up.head.node.title || '(untitled)';
      // Why this, in words. Pressure adds its own gentle phrase; neither ever
      // reaches for the shame word this app refuses — no such state exists here,
      // and the vocabulary that replaces it is in pressure.ts (ADR-0010).
      const p = up.head.pressure;
      const extra = up.head.reason === 'pressure' ? pressureWords(p) : up.head.words;
      WHY.textContent = extra;
      COUNT.textContent = up.total === 1
        ? 'This is the only thing asking.'
        : `${up.total} things are asking. This one first.`;
      BEHIND.replaceChildren(...up.behind.map(item => {
        const li = el('li', 'behind-item');
        li.append(el('span', 'behind-title', item.node.title || '(untitled)'));
        li.append(el('span', 'behind-why', item.reason === 'pressure' ? pressureWords(item.pressure) : item.words));
        return li;
      }));
    } else {
      REGION.hidden = true;
      TITLE.textContent = '';
      BEHIND.replaceChildren();
    }

    // Upkeep chips (item 20).
    const ups = upkeepChips(state, iso, session.zone);
    UPKEEP.hidden = ups.length === 0;
    CHIPS.replaceChildren(...ups.map(item => {
      const li = el('li');
      const b = el('button', 'chip');
      b.type = 'button';
      b.append(el('span', 'chip-title', item.node.title || '(untitled)'));
      b.append(el('span', 'chip-why', pressureWords(item.pressure)));
      b.addEventListener('click', () => {
        const node = item.node.id;
        void session.commit(ctx => doneEvents(ctx, node))
          .then(() => { LIVE.textContent = `Done: ${item.node.title}.`; })
          .catch((err: Error) => { LIVE.textContent = `Couldn’t record that — ${err.message}`; })
          .finally(() => { onChange(); refresh(); });
      });
      li.append(b);
      return li;
    }));

    // The coverage list (item 21) — the gauge's claim, itemised and checkable.
    const held = [...state.nodes.values()]
      .filter(n => !n.trashed && !n.mergedInto)
      .sort((a, b) => (a.id < b.id ? 1 : -1));
    COVERAGE.replaceChildren(...held.map(n => {
      const li = el('li', 'coverage-item');
      li.append(el('span', 'coverage-title', n.title || '(untitled)'));
      const clock = n.clocks.due ?? n.clocks.review ?? n.clocks.start ?? n.clocks.suspense ?? n.clocks.park;
      li.append(el('span', 'coverage-when',
        clock ? `returns ${returns(clock.at)}` : n.onMenu ? 'on the Menu' : 'held'));
      return li;
    }));
  }

  refresh();
  return { refresh };
}
