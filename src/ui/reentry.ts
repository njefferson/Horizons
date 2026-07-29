// The re-entry greeting (product law 8: rest is legitimate).
//
// Rendering and wiring only; everything structural is in `src/reentry.ts`.
//
// The absence is measured ONCE, at mount, from the state as it was loaded —
// before this session has written anything. It has to be: the greeting itself is
// an event, and every projection here reads `lastActivityAt`, so measuring later
// would report an absence of zero to the person who has just come back after a
// fortnight. Held in memory for the sitting, like the focus-exit ramp.

import type { Session } from './session.ts';
import { reentryView, reentryWords, waitingWords, amnestyWords, REENTRY_TRIAGE_CAP } from '../reentry.ts';
import { greetEvents, offerAmnestyEvents, acceptAmnestyEvents } from './reentry-intents.ts';

export interface ReentryUI { refresh(): void }

export function mountReentry(session: Session, now: () => number, onChange: () => void): ReentryUI {
  const q = <T extends HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);
  const region = q('#reentry');
  const words = q('#reentry-words');
  const waiting = q('#reentry-waiting');
  const amnesty = q('#reentry-amnesty');
  const amnestyWordsEl = q('#reentry-amnesty-words');
  const plain = q('#reentry-plain-actions');
  const live = q('#reentry-live');
  const heading = q('#reentry-heading');
  if (!region || !words || !live) return { refresh() {} };
  const REGION = region, WORDS = words, LIVE = live;

  // Measured once, before this session writes anything.
  const arrivedAt = new Date(now()).toISOString();
  const atArrival = reentryView(session.state(), arrivedAt, session.zone);
  let dismissed = !atArrival.lapsed;
  let busy = false;

  const run = async (make: Parameters<Session['commit']>[0], announce: string): Promise<void> => {
    if (busy) return;
    busy = true;
    try {
      await session.commit(make);
      LIVE.textContent = announce;
    } catch (err) {
      LIVE.textContent = `Couldn’t do that — ${(err as Error).message}`;
    } finally { busy = false; }
    try { onChange(); } catch { /* a render bug must not contradict a landed write */ }
    refresh();
  };

  function refresh(): void {
    REGION.hidden = dismissed;
    if (dismissed) return;
    WORDS.textContent = reentryWords(atArrival);
    // The counts are read from CURRENT state, not from arrival: triaging three
    // things should make the line say so rather than keep reciting the number
    // you walked in to.
    const nowView = reentryView(session.state(), new Date(now()).toISOString(), session.zone);
    if (waiting) {
      const w = waitingWords(nowView);
      waiting.textContent = w ?? '';
      waiting.hidden = !w;
    }
    const canForgive = nowView.passedDates > 0;
    if (amnesty && amnestyWordsEl) {
      amnesty.hidden = !canForgive;
      amnestyWordsEl.textContent = canForgive ? amnestyWords(nowView.passedDates) : '';
    }
    // Exactly one way out is offered: the amnesty block carries its own, so the
    // bare "Thanks" would otherwise be a second dismiss sitting under the first.
    if (plain) plain.hidden = canForgive;
  }

  const dismiss = (): void => {
    dismissed = true;
    refresh();
    // Focus must not fall to <body> when the section it was in disappears
    // (WCAG 2.4.3). Capture is where arrival focus belongs anyway.
    q<HTMLElement>('#capture')?.focus();
  };
  q<HTMLButtonElement>('#reentry-dismiss')?.addEventListener('click', dismiss);
  q<HTMLButtonElement>('#reentry-dismiss-plain')?.addEventListener('click', dismiss);

  q<HTMLButtonElement>('#reentry-amnesty-go')?.addEventListener('click', () => {
    void run(
      ctx => acceptAmnestyEvents(ctx, session.state(), new Date(now()).toISOString(), session.zone),
      'Moved to the Menu. Nothing was deleted and nothing was marked done.',
    ).then(() => { dismissed = true; refresh(); q<HTMLElement>('#capture')?.focus(); });
  });

  // Record the arrival — and the OFFER, which is the interesting half: it is
  // evidence the app noticed a lapse and responded, whether or not it was taken
  // up. Written once, on arrival, and never blocking the render.
  if (atArrival.lapsed) {
    void run(ctx => [
      ...greetEvents(ctx, atArrival.absenceDays ?? 0, Math.min(atArrival.waitingToTriage, REENTRY_TRIAGE_CAP)),
      ...(atArrival.amnestyAvailable ? offerAmnestyEvents(ctx, 'passed-dates') : []),
    ], '');
    queueMicrotask(() => { if (!REGION.hidden) heading?.focus(); });
  }

  refresh();
  return { refresh };
}
