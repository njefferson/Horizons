// The walkthrough — the first thing a brand-new person sees, and the family's
// first tutorial (the siblings introduce themselves with always-present copy;
// ND Toolbox's own roadmap names the unbuilt item "calm skippable first-run").
//
// It is built to that house style, not to a spotlight-tour convention that would
// cut against it: CALM (a few short steps, no dimming or chasing the cursor),
// SKIPPABLE (Skip is present on every step), and REPLAYABLE (the ⓘ panel has a
// control that shows it again). It is a modal like the ⓘ panel is — Quietkeep's
// own surface pattern — and it is fully keyboard-operable, moves focus to each
// step's heading, announces the step in a live region, and animates nothing, so
// reduced-motion is honoured by having no motion to reduce.
//
// It ends by handing off to the real first action: opening the ⓘ panel so the
// person can keep their data (the V-00 storage nudge the auto-open used to do),
// with the capture box one tap away.

import type { Session } from './session.ts';
import { editionName, isSyncEdition } from './edition.ts';

/** Written when the walkthrough is finished OR skipped: seeing it once is the
 *  contract, and skipping IS seeing it. Its own key, separate from the ⓘ intro. */
const TOUR_SEEN = 'tour.seen';
/** Set alongside it so the ⓘ panel's own first-run intro never also fires — the
 *  walkthrough has taken that job. */
const ABOUT_SEEN = 'about.seen';

interface Step {
  heading: string;
  /** One paragraph per string — rendered with textContent, never innerHTML. */
  body: string[];
}

/** Computed per show, not at import: the last step's privacy sentence must
 *  state THIS edition's truth, and the edition is only known once `main()`
 *  has run (the default's words were caught inside Quietkeep Sync, 1.7.2). */
const stepsNow = (): readonly Step[] => [
  {
    heading: `Welcome to ${editionName()}`,
    body: [
      'Put anything down and Quietkeep holds it, then brings it back on its own.',
      'You never have to keep it in your head, or remember to look. That is the whole idea — everything else is just how it does it.',
    ],
  },
  {
    heading: 'Start with the box',
    body: [
      'The box at the top is where everything begins. Type whatever is on your mind and press Hold it.',
      'One line, nothing to fill in, no folder to choose. Get it out of your head first; the sorting comes later.',
    ],
  },
  {
    heading: 'It sorts and times itself',
    body: [
      'When you have a few, Quietkeep walks you through them one at a time, with a choice you cannot get wrong.',
      'Then it gives each one a moment to come back to you, and hands you the single thing worth doing now. You never file anything or set a reminder by hand.',
    ],
  },
  {
    heading: 'It is yours, and it is all here',
    body: [
      isSyncEdition()
        ? 'Everything stays on your devices — no account, no sign-in. What they trade to stay in step is sealed with a key only they hold.'
        : 'Everything stays on your device — no account, no sign-in, no server holding your writing.',
      'The ⓘ at the top has how to install it, how to keep your data safe, and this walkthrough again whenever you want it. Get started opens that panel, so keeping your data safe is the first thing you do.',
      // Added in 1.14.0. NOT written for the returning reader specifically —
      // the empty screen behind this dialog now offers them the way back, and a
      // sentence here about data they may never have had would land oddly on
      // somebody genuinely new. What it does say is true for both: the exported
      // file is the copy that outlives the browser, and that is worth knowing on
      // day one rather than on the day it matters.
      'That panel also writes you a copy of everything, as a file you keep. It is the one copy that survives a new device or a cleared browser, and bringing it back is one button in the same place.',
    ],
  },
];

/**
 * Show the walkthrough. Used both on first run (via `mountTour`) and on demand
 * from the ⓘ panel's replay control — so it does not consult the seen-flag
 * itself; the caller decides whether it is warranted.
 *
 * `onFinish` runs when the last step's button is pressed (not on Skip): first
 * run passes a callback that opens the ⓘ panel for the storage step.
 */
export function showTour(session: Session, onFinish?: () => void): void {
  const dialog = document.querySelector<HTMLDialogElement>('#tour');
  const progress = document.querySelector<HTMLElement>('#tour-progress');
  const heading = document.querySelector<HTMLElement>('#tour-heading');
  const bodyEl = document.querySelector<HTMLElement>('#tour-body');
  const dots = document.querySelector<HTMLElement>('#tour-dots');
  const back = document.querySelector<HTMLButtonElement>('#tour-back');
  const next = document.querySelector<HTMLButtonElement>('#tour-next');
  const skip = document.querySelector<HTMLButtonElement>('#tour-skip');
  if (!dialog || !progress || !heading || !bodyEl || !dots || !back || !next || !skip) return;

  const STEPS = stepsNow();
  let i = 0;

  const render = (): void => {
    const step = STEPS[i]!;
    progress.textContent = `Step ${i + 1} of ${STEPS.length}`;
    heading.textContent = step.heading;
    // Rebuilt with textContent nodes only — innerHTML is banned here, and a
    // walkthrough of "it is only our own strings" is exactly where that erodes.
    bodyEl.replaceChildren(...step.body.map(text => {
      const p = document.createElement('p');
      p.className = 'tour-p';
      p.textContent = text;
      return p;
    }));
    // Dots are decorative; the live "Step N of M" is the real announcement.
    dots.replaceChildren(...STEPS.map((_, n) => {
      const dot = document.createElement('span');
      dot.className = n === i ? 'tour-dot on' : 'tour-dot';
      return dot;
    }));
    back.hidden = i === 0;
    next.textContent = i === STEPS.length - 1 ? 'Get started' : 'Next';
    // Focus the heading each step — the house a11y rule for a navigated view, so
    // a screen-reader user lands on what changed rather than nowhere.
    heading.focus();
  };

  const finish = (viaSkip: boolean): void => {
    void session.store.setKv(TOUR_SEEN, true);
    // Mark the ⓘ intro seen too, so it never also auto-opens later — the
    // walkthrough has covered that ground. Done here, once, for both exits.
    void session.store.setKv(ABOUT_SEEN, true).then(() => {
      document.body.dataset.introDismissed = 'true';
    });
    if (dialog.open) dialog.close();
    if (!viaSkip) onFinish?.();
  };

  next.onclick = () => {
    if (i < STEPS.length - 1) { i += 1; render(); }
    else finish(false);
  };
  back.onclick = () => { if (i > 0) { i -= 1; render(); } };
  skip.onclick = () => finish(true);
  // Escape closes the dialog; treat that as Skip so the seen-flag is still set
  // and it does not reappear on the next open.
  dialog.addEventListener('cancel', () => finish(true), { once: true });

  render();
  dialog.showModal();
}

/**
 * First-run entry. Shows the walkthrough once, before the ⓘ panel would have
 * auto-opened. On finish it opens the ⓘ so the storage step still happens; the
 * ⓘ's own auto-open is gated on `tour.seen` so the two never stack.
 */
export async function mountTour(session: Session): Promise<void> {
  const replay = document.querySelector<HTMLButtonElement>('#tour-replay');
  if (replay) replay.addEventListener('click', () => showTour(session, openAbout));

  const seen = await session.store.getKv<boolean>(TOUR_SEEN);
  if (seen) return;
  showTour(session, openAbout);
}

/** Open the ⓘ panel by its real control, so the storage step and its wiring run
 *  exactly as they do for any other open — and unfold Your data, because the
 *  handoff's whole promise is "keeping your data safe is the first thing you
 *  do", and a promise behind a fold is not kept (ADR-0055). */
function openAbout(): void {
  document.querySelector<HTMLButtonElement>('#open-about')?.click();
  const data = document.querySelector<HTMLButtonElement>('#group-data-open[aria-expanded="false"]');
  data?.click();
}
