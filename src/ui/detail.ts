// The detail sheet — what turns a triage loop into a planner (Phase 3.5).
//
// Tap anything you are holding and you can give it a date, make it repeat, take
// back a completion, put it on the Menu or let it go. Before this, the only
// thing the app could do to an item was route it six ways once, and the decay
// primitive had no path into it at all.
//
// One sheet, one item, every control a real <button> at full target size. It is
// a native <dialog>, so the platform gives us the modal semantics, Esc, and the
// focus trap rather than us reimplementing them badly.
//
// Only what is POSSIBLE for this item is shown: offering "Bring back from the
// Menu" for something that is not on the Menu would be a button that either does
// nothing or does something surprising, and this audience is exactly the one for
// whom a surprising control is expensive.

import type { Session } from './session.ts';
import type { NodeState } from '../fold.ts';
import { localDayKey } from '../time.ts';
import { pressureOf, pressureWords } from '../pressure.ts';
import {
  setDueEvents, clearDueEvents, makeRepeatEvents, stopRepeatEvents,
  undoneEvents, untrashEvents, promoteFromMenuEvents, toMenuEvents, renameEvents,
} from './detail-intents.ts';
import { doneEvents } from './work.ts';

export interface DetailUI { open(node: NodeState): void }

export function mountDetail(session: Session, now: () => number, onChange: () => void): DetailUI {
  const q = <T extends HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);
  const dlg = q<HTMLDialogElement>('#detail');
  const title = q('#detail-title');
  const state = q('#detail-state');
  const date = q<HTMLInputElement>('#detail-date');
  const name = q<HTMLInputElement>('#detail-name');
  const every = q<HTMLInputElement>('#detail-every');
  const slack = q<HTMLInputElement>('#detail-slack');
  const live = q('#detail-live');
  const hint = q('#detail-repeat-hint');
  if (!dlg || !title || !state || !date || !name || !every || !slack || !live || !hint) {
    return { open() {} };
  }
  const NAME = name;
  const DLG = dlg, TITLE = title, STATE = state, DATE = date, EVERY = every, SLACK = slack, LIVE = live;

  let current: NodeState | null = null;
  let busy = false;

  const btn = (sel: string): HTMLButtonElement | null => q<HTMLButtonElement>(sel);

  /** Say it where it can be seen AND where it can be heard. A failure reported
   *  only to a visually-hidden region is a failure a sighted user never learns
   *  about (F-08). */
  const say = (msg: string): void => { LIVE.textContent = msg; STATE.textContent = msg; };

  /** Commit, then re-read the node from fresh state — never from the stale copy
   *  the sheet was opened with, which would render yesterday's answer. */
  const run = async (make: Parameters<Session['commit']>[0], announce: string): Promise<void> => {
    if (!current || busy) return;
    busy = true;
    const id = current.id;
    try {
      await session.commit(make);
      LIVE.textContent = announce;
    } catch (err) {
      say(`Couldn’t do that — ${(err as Error).message}`);
    } finally {
      busy = false;
    }
    try { onChange(); } catch { /* a render bug must not contradict a landed write */ }
    const fresh = session.state().nodes.get(id);
    if (fresh) render(fresh);
  };

  function render(n: NodeState): void {
    current = n;
    TITLE.textContent = n.title || '(untitled)';

    // What is true about it now, in words — never a colour, never a badge.
    const p = pressureOf(n, new Date(now()).toISOString(), session.zone);
    const bits: string[] = [];
    if (n.trashed) bits.push('let go');
    if (n.onMenu) bits.push('on the Menu');
    if (n.lastDone) bits.push('done');
    if (n.kind === 'upkeep' && n.intervalDays) bits.push(`repeats every ${n.intervalDays} days`);
    const words = pressureWords(p);
    if (words) bits.push(words);
    const clock = n.clocks.due ?? n.clocks.review ?? n.clocks.start;
    if (clock) bits.push(`comes back ${localDayKey(clock.at, session.zone)}`);
    STATE.textContent = bits.length ? bits.join(' · ') : 'held';

    // Seed the date box with the date it already has, so "Set" is an edit rather
    // than a blank slate you have to re-derive.
    NAME.value = n.title;
    DATE.value = n.clocks.due ? localDayKey(n.clocks.due.at, session.zone) : '';
    if (n.intervalDays && n.intervalDays > 0) EVERY.value = String(n.intervalDays);
    if (n.comfortWindowDays && n.comfortWindowDays > 0) SLACK.value = String(n.comfortWindowDays);

    // Only offer what this item can actually do.
    const show = (sel: string, on: boolean): void => {
      const b = btn(sel);
      if (b) b.hidden = !on;
    };
    const repeats = n.kind === 'upkeep' && (n.intervalDays ?? 0) > 0;
    show('#detail-date-clear', Boolean(n.clocks.due));
    show('#detail-repeat-stop', repeats);
    show('#detail-done', !n.lastDone && !n.trashed);
    show('#detail-undone', Boolean(n.lastDone));
    show('#detail-menu', !n.onMenu && !n.trashed);
    show('#detail-promote', Boolean(n.onMenu));
    show('#detail-trash', !n.trashed);
    show('#detail-untrash', n.trashed);
  }

  /** A positive whole number, or null. A blank or nonsense box must not become
   *  NaN in the log — a NaN cadence made an item shout the loudest phrase in the
   *  app and, worse, could make it un-completable (audit). */
  const positiveInt = (el: HTMLInputElement): number | null => {
    const v = Number(el.value);
    return Number.isFinite(v) && Number.isInteger(v) && v > 0 ? v : null;
  };

  const doRename = (): void => {
    const next = NAME.value.trim();
    if (!next) { say('It needs to say something.'); return; }
    if (next === current?.title) { say('That is what it already says.'); return; }
    void run(ctx => renameEvents(ctx, current!.id, next), `Now reads "${next}".`);
  };
  btn('#detail-rename')?.addEventListener('click', doRename);
  NAME.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') { e.preventDefault(); doRename(); }
  });

  btn('#detail-date-set')?.addEventListener('click', () => {
    const key = DATE.value;
    // A date input yields '' when empty or invalid; nothing is a legal answer.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) { say('Pick a date first.'); return; }
    void run(ctx => setDueEvents(ctx, current!.id, key), `Due ${key}.`);
  });
  btn('#detail-date-clear')?.addEventListener('click', () => {
    void run(ctx => clearDueEvents(ctx, current!.id), 'Date removed — it comes back to you today.');
  });
  btn('#detail-repeat-set')?.addEventListener('click', () => {
    const i = positiveInt(EVERY), c = positiveInt(SLACK);
    if (i === null || c === null) { say('Both numbers need to be whole days, at least 1.'); return; }
    void run(ctx => makeRepeatEvents(ctx, current!.id, current!.kind, i, c), `Repeats every ${i} days.`);
  });
  btn('#detail-repeat-stop')?.addEventListener('click', () => {
    void run(ctx => stopRepeatEvents(ctx, current!.id), 'It no longer repeats.');
  });
  btn('#detail-done')?.addEventListener('click', () => {
    void run(ctx => doneEvents(ctx, current!.id), 'Done.');
  });
  btn('#detail-undone')?.addEventListener('click', () => {
    void run(ctx => undoneEvents(ctx, current!.id), 'Back on the list.');
  });
  btn('#detail-menu')?.addEventListener('click', () => {
    void run(ctx => toMenuEvents(ctx, current!.id), 'On the Menu — no clock, no demand.');
  });
  btn('#detail-promote')?.addEventListener('click', () => {
    void run(ctx => promoteFromMenuEvents(ctx, current!.id), 'Brought back as real work.');
  });
  btn('#detail-trash')?.addEventListener('click', () => {
    void run(ctx => [{
      id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
      kind: 'node.trashed', node: current!.id, payload: { reason: 'detail' },
    } as never], 'Let go. You can still keep it after all.');
  });
  btn('#detail-untrash')?.addEventListener('click', () => {
    void run(ctx => untrashEvents(ctx, current!.id), 'Kept.');
  });
  btn('#detail-close')?.addEventListener('click', () => DLG.close());

  return {
    open(node: NodeState): void {
      render(node);
      LIVE.textContent = '';
      if (!DLG.open) DLG.showModal();
    },
  };
}
