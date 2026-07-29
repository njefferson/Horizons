// The focus surface: one thing, and a way to be interrupted without losing it.
//
// Everything structural is in `src/focus.ts` (pure) and `focus-intents.ts`
// (events). This module is only the rendering and the wiring, which is where it
// belongs — a surface that computes is a surface that disagrees with the tests.
//
// The elapsed line ticks on a timer, and that timer is the only thing in the app
// that runs on its own. It is bounded by the section being visible and it writes
// nothing: a clock that logged would turn "how long have I been at this" into a
// stream of events nobody asked for.

import type { Session } from './session.ts';
import type { NodeState } from '../fold.ts';
import { focusView, focusWords, interruptWords, resumeCards } from '../focus.ts';
import {
  startFocusEvents, endFocusEvents, interruptEvents, resumeEvents, cleanCue,
} from './focus-intents.ts';
// The same builder work mode and the detail sheet use. Three surfaces writing
// three slightly different "done" is how a completion ends up meaning three
// things. The dependency runs one way — `app.ts` wires the button that starts a
// focus, so work.ts never has to import this module back.
import { doneEvents } from './work.ts';

export interface FocusUI {
  refresh(): void;
  start(node: NodeState): void;
}

export function mountFocus(session: Session, now: () => number, onChange: () => void): FocusUI {
  const q = <T extends HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);
  const region = q('#focus');
  const heading = q('#focus-heading');
  const title = q('#focus-title');
  const elapsed = q('#focus-elapsed');
  const held = q('#focus-held');
  const live = q('#focus-live');
  const form = q<HTMLFormElement>('#focus-interrupt-form');
  const input = q<HTMLInputElement>('#focus-interrupt');
  const sheet = q<HTMLDialogElement>('#focus-sheet');
  const cue = q<HTMLInputElement>('#focus-cue');
  if (!region || !title || !elapsed || !live || !form || !input) {
    return { refresh() {}, start() {} };
  }
  const REGION = region, TITLE = title, ELAPSED = elapsed, LIVE = live;
  const FORM = form, INPUT = input, HELD = held, HEAD = heading;

  let busy = false;
  let tick: ReturnType<typeof setInterval> | null = null;

  const say = (msg: string): void => { LIVE.textContent = msg; };

  const run = async (make: Parameters<Session['commit']>[0], announce: string,
                    thenFocusHeading = false): Promise<void> => {
    if (busy) return;
    busy = true;
    try {
      await session.commit(make);
      say(announce);
    } catch (err) {
      say(`Couldn’t do that — ${(err as Error).message}`);
    } finally {
      busy = false;
    }
    try { onChange(); } catch { /* a render bug must not contradict a landed write */ }
    refresh();
    // AFTER the commit, not alongside it. A queueMicrotask fired while the
    // commit was still in flight, so the section was still hidden and focus went
    // nowhere — leaving it on a button that had just been replaced (WCAG 2.4.3,
    // caught by smoke).
    if (thenFocusHeading && !REGION.hidden) HEAD?.focus();
  };

  function refresh(): void {
    const v = focusView(session.state(), new Date(now()).toISOString());
    REGION.hidden = v.node === null;
    if (!v.node) {
      if (tick) { clearInterval(tick); tick = null; }
      return;
    }
    TITLE.textContent = v.node.title || '(untitled)';
    const words = focusWords(v.minutes);
    ELAPSED.textContent = words ?? '';
    ELAPSED.hidden = !words;
    if (HELD) {
      // A COUNT OF THINGS YOU WROTE DOWN. It is deliberately not a count of
      // interruptions suffered — same number, opposite sentence, and only one of
      // them is a thing you did.
      const w = interruptWords(v.interrupted.length);
      HELD.textContent = w ?? '';
      HELD.hidden = !w;
    }
    // A minute is the resolution the words have, so that is how often it ticks.
    // Anything faster is a spinner pretending to be information.
    if (!tick) tick = setInterval(() => { if (!REGION.hidden) refresh(); }, 30_000);
  }

  FORM.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = INPUT.value;
    if (!text.trim()) { say('It needs to say something.'); return; }
    INPUT.value = '';
    void run(ctx => interruptEvents(ctx, session.state(), ctx.id(), text),
      'Held. Your way back here is saved.');
  });

  q<HTMLButtonElement>('#focus-done')?.addEventListener('click', () => {
    const id = session.state().focus?.node;
    if (!id) return;
    void run(ctx => [
      ...doneEvents(ctx, id),
      ...endFocusEvents(ctx, session.state(), 'completed'),
    ], 'Done.');
  });

  q<HTMLButtonElement>('#focus-stop')?.addEventListener('click', () => {
    if (!sheet || !cue) {
      void run(ctx => endFocusEvents(ctx, session.state(), 'abandoned'), 'Stopped. It is waiting for you.');
      return;
    }
    cue.value = '';
    if (!sheet.open) sheet.showModal();
  });

  q<HTMLButtonElement>('#focus-sheet-cancel')?.addEventListener('click', () => sheet?.close());
  q<HTMLButtonElement>('#focus-sheet-stop')?.addEventListener('click', () => {
    const words = cue ? cleanCue(cue.value) : null;
    sheet?.close();
    // `abandoned`, and the word never reaches a person. It is the vocabulary's
    // term for "you stopped without finishing", and the surface says "Stopped.
    // It is waiting for you." — which is what actually happened.
    void run(ctx => endFocusEvents(ctx, session.state(), 'abandoned', words),
      'Stopped. It is waiting for you.');
  });
  cue?.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') {
      e.preventDefault();
      q<HTMLButtonElement>('#focus-sheet-stop')?.click();
    }
  });

  refresh();

  return {
    refresh,
    start(node: NodeState): void {
      // A resume card is not a thing you work on — it is a pointer at one. So
      // starting from a card spends it and focuses the WORK. Without this you
      // would sit in a focus session on a card about a focus session.
      if (node.kind === 'resume-card') {
        const c = resumeCards(session.state()).find(x => x.card.id === node.id);
        if (!c) return;
        void run(ctx => resumeEvents(ctx, session.state(), c.card.id, c.target.id),
          `Back on ${c.target.title || 'it'}.`, true);
      } else {
        void run(ctx => startFocusEvents(ctx, session.state(), node.id),
          `Working on ${node.title || 'it'}.`, true);
      }
    },
  };
}
