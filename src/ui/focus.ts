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
import { commsChip } from '../comms.ts';
import { coverageGauge } from '../gate.ts';
import {
  startFocusEvents, endFocusEvents, interruptEvents, resumeEvents, cleanCue,
  dropResumeEvents,
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

export function mountFocus(
  session: Session, now: () => number, onChange: () => void,
  /** Opens the detail sheet — the close strip's "have a look" door (1.6.0). */
  openDetail?: (n: NodeState) => void,
): FocusUI {
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

  /**
   * The focus-exit ramp.
   *
   * `surfacing` is TRUE only in the moment after a session ends — held here, in
   * memory, and never as an event. It is a property of this sitting, not of your
   * history: persisting it would mean the chip greeting you on a cold start
   * tomorrow morning, which is precisely the arriving-unbidden behaviour the
   * whole design refuses. It is cleared by the next thing you do.
   */
  let surfacing = false;
  /** What the session that just ended was about — in memory, like the ramp
   *  itself: the close strip must never greet a cold start (1.6.0, item 40). */
  let lastEnded: { id: string; title: string; completed: boolean } | null = null;

  function paintComms(): void {
    const region = document.querySelector<HTMLElement>('#comms');
    const words = document.querySelector<HTMLElement>('#comms-words');
    if (!region || !words) return;
    const chip = commsChip(session.state(), new Date(now()).toISOString(), session.zone, surfacing);
    region.hidden = chip === null;
    words.textContent = chip?.words ?? '';
  }

  /** The session close (1.6.0 — item 40, ADR-0052): the second rider on the
   *  ramp. A win in words, the gauge in WORDS (never a colour, B-02), and —
   *  when a thread from an EARLIER sitting is still waiting — the one day-end
   *  question (item 26). Peak-end; no duration, no score, no streak. */
  function paintClose(): void {
    const region = document.querySelector<HTMLElement>('#close');
    const win = document.querySelector<HTMLElement>('#close-win');
    const gaugeLine = document.querySelector<HTMLElement>('#close-gauge');
    const thread = document.querySelector<HTMLElement>('#close-thread');
    const threadWords = document.querySelector<HTMLElement>('#close-thread-words');
    if (!region || !win || !gaugeLine || !thread || !threadWords) return;
    const show = surfacing && lastEnded !== null;
    region.hidden = !show;
    if (!show) return;
    win.textContent = lastEnded!.completed
      ? `Done: ${lastEnded!.title}.`
      : `${lastEnded!.title} is left where you can pick it back up.`;
    const g = coverageGauge(session.state());
    gaugeLine.textContent = g.silent === 0
      ? (g.total === 1
        ? 'Everything you hold is covered — one thing, not silent.'
        : `Everything you hold is covered — ${g.total} things, none silent.`)
      : `${g.silent} of what you hold has gone silent — worth a look.`;
    // The one question: the OLDEST thread from an earlier sitting. A card
    // minted by the session that just ended is not "earlier" — it is the way
    // back the interrupt promised, and it is not questioned.
    const older = resumeCards(session.state())
      .filter(c => c.card.interruptedFocus !== lastEnded!.id);
    const first = older[0] ?? null;
    thread.hidden = first === null;
    if (first) {
      threadWords.textContent =
        `A thread from earlier is still waiting — “${first.target.title || '(untitled)'}”.`;
    }
  }

  function refresh(): void {
    const v = focusView(session.state(), new Date(now()).toISOString());
    REGION.hidden = v.node === null;
    paintComms();
    paintClose();
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

  /** What was on when the session ended, for the close strip's win line. */
  const noteEnded = (completed: boolean): void => {
    const id = session.state().focus?.node;
    const n = id ? session.state().nodes.get(id) : undefined;
    lastEnded = id ? { id, title: n?.title || '(untitled)', completed } : null;
  };

  q<HTMLButtonElement>('#focus-done')?.addEventListener('click', () => {
    const id = session.state().focus?.node;
    if (!id) return;
    surfacing = true;
    noteEnded(true);
    void run(ctx => [
      ...doneEvents(ctx, id),
      ...endFocusEvents(ctx, session.state(), 'completed'),
    ], 'Done.');
  });

  q<HTMLButtonElement>('#focus-stop')?.addEventListener('click', () => {
    if (!sheet || !cue) {
      surfacing = true;
      noteEnded(false);
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
    surfacing = true;
    noteEnded(false);
    void run(ctx => endFocusEvents(ctx, session.state(), 'abandoned', words),
      'Stopped. It is waiting for you.');
  });
  cue?.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') {
      e.preventDefault();
      q<HTMLButtonElement>('#focus-sheet-stop')?.click();
    }
  });

  const lowerRamp = (): void => { surfacing = false; paintComms(); paintClose(); };
  // The close strip's controls (1.6.0). "Carry on" lowers the ramp and writes
  // nothing — leaving a summary is not an act. The thread question offers one
  // door and one honest release; both are about a card from an EARLIER sitting.
  q<HTMLButtonElement>('#close-ok')?.addEventListener('click', lowerRamp);
  q<HTMLButtonElement>('#close-thread-open')?.addEventListener('click', () => {
    const older = resumeCards(session.state())
      .filter(c => c.card.interruptedFocus !== lastEnded?.id);
    const first = older[0];
    if (!first) { lowerRamp(); return; }
    const fresh = session.state().nodes.get(first.target.id);
    if (fresh && openDetail) openDetail(fresh);
  });
  q<HTMLButtonElement>('#close-thread-drop')?.addEventListener('click', () => {
    const older = resumeCards(session.state())
      .filter(c => c.card.interruptedFocus !== lastEnded?.id);
    const first = older[0];
    if (!first) { lowerRamp(); return; }
    // toReviewQuestion: TRUE — the flag the vocabulary carried from Phase 0,
    // set at last, because this drop really did come from the question.
    void run(ctx => dropResumeEvents(ctx, first.card.id, true),
      'Let go — the work itself is still yours, on its ordinary rhythm.');
  });
  q<HTMLButtonElement>('#comms-done')?.addEventListener('click', () => {
    const n = session.state().nodes.get(commsChip(session.state(),
      new Date(now()).toISOString(), session.zone, surfacing)?.node.id ?? '');
    if (!n) { lowerRamp(); return; }
    surfacing = false;
    void run(ctx => doneEvents(ctx, n.id), 'Good. It comes round again on its own.');
  });
  // "Not now" writes NOTHING. Declining is not an event, because an event is a
  // record and a record of every time you did not do something is the ledger
  // this app exists to not keep (law 5). It comes round on the ordinary decay,
  // exactly as if you had never been asked.
  q<HTMLButtonElement>('#comms-later')?.addEventListener('click', lowerRamp);

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
        surfacing = false;
        void run(ctx => startFocusEvents(ctx, session.state(), node.id),
          `Working on ${node.title || 'it'}.`, true);
      }
    },
  };
}
