// The header clock (1.22.0) — the rendering and the tick, nothing else.
//
// Everything that could be wrong is in `src/clock.ts` and is tested there. This
// module turns three numbers into two hands and a sentence, and decides how
// often to ask again.
//
// ## It is CHROME, not a control
//
// The dial is `aria-hidden` and the words beside it are the whole accessible
// version — a screen reader gets "14:20. 9h 39m left today. 2 things are dated
// today.", which stands alone as a sentence, rather than a description of where
// two lines are pointing.
//
// There is no button here, and that is a decision rather than an omission. The
// approved plan had tapping the clock hand today's dated items to the calendar,
// which is the honest substitute for the requested "open the device's alarm
// page" — no browser can reach that screen, and an `.ics` with a `VALARM` is the
// thing that actually rings with the app shut. Two problems killed it in the
// chrome:
//
//   - A button's accessible name would be its visible words, and those change
//     every thirty seconds. Voice control needs a phrase somebody can SAY, and
//     "14:20, 9h 39m left today" is not one. A stable `aria-label` over
//     different visible text is the SC 2.5.3 trap this repo already paid a
//     release for (hub LESSONS §29).
//   - A tap on the header that writes a file to Files is a surprise, and the
//     header is the easiest thing on the screen to hit by accident.
//
// The calendar hand-off is unchanged and one tap away, on the (i) panel, where
// it says what it does before it does it. The Extras copy points at it.
//
// ## The tick
//
// Thirty seconds, and only while the clock is on screen — `src/ui/focus.ts`'s
// elapsed line, which is the only other timer in this app. Minute granularity,
// so a sweeping second hand never exists and `prefers-reduced-motion` has
// nothing here to suppress.
//
// Every repaint writes IN PLACE — `textContent` on the same paragraph, two
// `transform` attributes on the same two lines. Nothing here is ever replaced.
// A component that rebuilds its own DOM on a timer drops keyboard focus and
// re-announces itself to a screen reader every tick, and it invalidates any
// measurement taken across two steps — a gate that reads a box, hides the node
// and then samples finds a different node there (hub LESSONS §61). This one is
// on screen permanently and ticks forever, so it is the worst possible place to
// get that wrong.
//
// It also repaints on becoming visible, which matters more than the interval
// does. On iPadOS a backgrounded standalone app is FROZEN, not throttled: come
// back after two hours and the interval has not run, so a header that only
// ticked would be showing a two-hour-old time in the most confident possible
// place. A stale clock is the same class of failure as a negative remainder —
// it teaches somebody to stop believing the surface — and it is the one this
// app is most likely to hit, because it is built to be left and come back to.

import type { Session } from './session.ts';
import {
  clockFace, clockIsOn, datedWords, handAngles, remainderWords, timeWords,
} from '../clock.ts';

export interface ClockUI {
  /** Repaint from current state. Called by the app's refresh and by the
   *  (i) panel's toggle, so switching it on takes effect without a reload. */
  refresh(): void;
}

const NOOP: ClockUI = { refresh() {} };

export function mountClock(session: Session, now: () => number): ClockUI {
  const region = document.querySelector<HTMLElement>('#clock');
  const hour = document.querySelector<SVGLineElement>('#clock-hour');
  const minute = document.querySelector<SVGLineElement>('#clock-minute');
  const words = document.querySelector<HTMLElement>('#clock-words');
  if (!region || !hour || !minute || !words) return NOOP;

  let tick: ReturnType<typeof setInterval> | null = null;

  const visible = (): boolean =>
    typeof document === 'undefined' || document.visibilityState === 'visible';

  const refresh = (): void => {
    const on = clockIsOn(session.state());
    region.hidden = !on;
    if (!on) {
      // The interval is dropped rather than left spinning against a hidden
      // element. An off switch that keeps the timer running is an off switch
      // that only turns off the part you can see.
      if (tick) { clearInterval(tick); tick = null; }
      words.textContent = '';
      return;
    }

    // `clockFace` reads the local time, and `localParts` throws a RangeError on
    // a zone Intl will not accept. This runs inside the refresh chain that
    // repaints every other surface, so an escape here would take the card list
    // down with it — a clock is chrome and must never be able to cost anybody
    // their list. A face that cannot be built means no clock, not no app.
    let face;
    try {
      face = clockFace(session.state(), new Date(now()).toISOString(), session.zone);
    } catch {
      region.hidden = true;
      if (tick) { clearInterval(tick); tick = null; }
      return;
    }
    const a = handAngles(face);
    // Rotated about the dial's centre. The hands are drawn pointing at twelve,
    // so the angle IS the time and there is no offset to get wrong.
    hour.setAttribute('transform', `rotate(${a.hour.toFixed(2)} 20 20)`);
    minute.setAttribute('transform', `rotate(${a.minute.toFixed(2)} 20 20)`);

    // One sentence per fact, in the order they matter: what time it is, how
    // much of the day is left, and what carries today's date. No live region —
    // a header that announced itself every thirty seconds would talk over
    // everything somebody was actually reading.
    words.textContent =
      `${timeWords(face)}. ${remainderWords(face.minutesLeft)} ${datedWords(face.datedToday)}`;

    if (!tick) {
      tick = setInterval(() => { if (!region.hidden && visible()) refresh(); }, 30_000);
    }
  };

  // Coming back is when the displayed time is most likely to be a lie.
  document.addEventListener('visibilitychange', () => { if (visible()) refresh(); });

  refresh();
  return { refresh };
}
