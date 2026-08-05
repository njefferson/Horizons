// "A new version is ready" — and the offer of a copy before it lands.
//
// A requirement: offer a backup when an update is detected.
//
// ## What it must not do
//
// **It must not imply danger, because there is none of the kind it would imply.**
// The log is append-only, state is `fold(log)`, and migrations are additive — an
// update cannot rewrite what is already written. If the words here said "back up
// before you lose something", that would be a manufactured alarm, and manufacturing
// alarm is the thing this app spent the whole of its design refusing.
//
// What a copy genuinely protects against is narrower and worth saying plainly: a
// release that behaves badly AFTER it lands, writing events that a later version has
// to live with. A copy taken now is a point somebody can go back to. That is a real
// reason and it is a small one, so it is offered rather than insisted on.
//
// **It must not block, and it must be closeable.** Doctrine §4: an interrupting
// surface is expected here, and it always has a way out from the first frame. This
// one is a line with three plain choices and no modal, and the app keeps working
// untouched if it is ignored — the old code carries on until somebody reloads.
//
// ## What changed in 1.18.1, and why the whole model moved
//
// This file used to be written AROUND `skipWaiting()`. The worker took over on
// install, so by the time anybody read this line the new shell was already in the
// cache and the old cache was already deleted — the running page was executing the
// previous release's bundle while every fresh request it made was served the new
// file. The prompt could therefore never be "apply the update"; it could only be
// "you have already moved, here is a moment to take a copy before you reload".
//
// That is Doctrine §7h.1's mixed app, and the reader had no say in it. The worker
// now WAITS, and this prompt is the only thing that releases it: press the control
// and the page posts `SKIP_WAITING`, the waiting worker activates, `controllerchange`
// fires, and the page reloads onto a build that is new all the way through. Decline,
// and nothing moves — the old app stays whole and keeps working.
//
// **The one-release cost, stated because it is a real edge and it is invisible.**
// A device still running 1.18.0 has 1.18.0's page code, which cannot post
// `SKIP_WAITING`. It will see this prompt and its Reload will not promote the
// waiting worker; the update lands when every client of the old worker is gone,
// which for a home-screen app means the next full close. That is one hop, it leaves
// them on a CONSISTENT 1.18.0 throughout, and it is the price of not being able to
// patch code that has already shipped.

import { deliverCopy } from './export-copy.ts';
import type { Session } from './session.ts';

/** What the line says. Precise about the risk, which is small and real, and silent
 *  about the risk it does not carry. */
export const UPDATE_WORDS =
  'A newer version is ready, and it waits until you say so — what you are using now keeps working until you install it. Nothing you have written is at risk: this app only ever adds to its record, and an update cannot rewrite it. A copy is worth taking first if you would like a point to come back to.';

/** After a copy has been handed over. States what happened, and what is still true. */
export const UPDATE_SAVED_WORDS =
  'Copy saved. Check it opened, then reload when you are ready.';

/** When the copy could not be written. Never swallowed: somebody about to reload
 *  should know the copy they asked for is not there. */
export const updateFailedWords = (why: string): string =>
  `That copy could not be saved — ${why} Nothing has changed, and you can carry on as you are.`;

/**
 * When the swap does not happen after the reader has asked for it.
 *
 * Reported 2026-08-05 on an iPad: the Install control was pressed ten times
 * with no visible effect, and the update landed only after the app was force
 * closed and reopened. An installed app on iPadOS will
 * not always let the waiting version take over while the app is still running —
 * the message is sent, the worker does not step aside, and nothing on screen
 * changes. What this used to do about that was RELOAD after three seconds,
 * which re-entered the same build and put the same offer back on screen. From
 * the outside that is a button that does nothing, ten times over.
 *
 * So it says what is true and names the thing that actually works. Closing the
 * app fully is not a workaround for a bug we have not fixed — it is the only
 * way the platform releases the old version, and the reader should not have to
 * discover it by giving up.
 */
export const UPDATE_STUCK_WORDS =
  'That did not take. Some devices will not let a new version take over while the app is still open — closing it completely and opening it again will do it. The new version is already downloaded and waiting, so nothing needs fetching, and nothing you have written is affected.';

/**
 * Is there a version newer than the one running?
 *
 * `waiting` is the classic signal. `installed` on `installing` covers the window
 * where a worker has finished installing but has not been promoted yet. And a
 * registration whose `active` worker is not the one controlling this page means the
 * shell has already moved on beneath us — which is what `skipWaiting()` produces,
 * and the case a `waiting`-only check misses entirely.
 *
 * Pure and given plain objects, so the decision is testable without a browser.
 */
export function updateIsReady(reg: {
  waiting?: unknown;
  installing?: { state?: string } | null;
  active?: unknown;
} | null, controller: unknown): boolean {
  if (!reg) return false;
  // A NEWCOMER IS NEVER TOLD (§7h.3), and this gate comes FIRST rather than
  // third. No controller means nothing has ever controlled this page, so there
  // is no older version to be newer than — "a new version is ready" thirty
  // seconds after arriving is nonsense. The gate used to sit below the `waiting`
  // and `installing` checks, which left a first-ever visit that raced two
  // workers being told its brand-new install was an update.
  if (controller == null) return false;
  if (reg.waiting != null) return true;
  if (reg.installing?.state === 'installed') return true;
  return reg.active != null && reg.active !== controller;
}

interface Surface {
  region: HTMLElement;
  words: HTMLElement;
  save: HTMLButtonElement;
  reload: HTMLButtonElement;
  dismiss: HTMLButtonElement;
}

const find = (): Surface | null => {
  const region = document.querySelector<HTMLElement>('#update');
  const words = document.querySelector<HTMLElement>('#update-words');
  const save = document.querySelector<HTMLButtonElement>('#update-save');
  const reload = document.querySelector<HTMLButtonElement>('#update-reload');
  const dismiss = document.querySelector<HTMLButtonElement>('#update-dismiss');
  return region && words && save && reload && dismiss
    ? { region, words, save, reload, dismiss } : null;
};

/**
 * Register the worker and watch for a newer version.
 *
 * Every step is contained. Offline support is an enhancement and this prompt is a
 * courtesy; neither may take capture down with it, which is the one thing that must
 * always work.
 */
export function mountUpdatePrompt(session: Session): void {
  const ui = find();
  if (!ui) return;

  /** Held so the Install control can reach the WAITING worker at click time.
   *  Registration resolves asynchronously and the control is wired before it
   *  does (the way out is wired first, §14) — so this is read on click, never
   *  captured at wiring time. */
  let registration: ServiceWorkerRegistration | null = null;

  // THE WAY OUT FIRST, before anything that can fail — the same ordering the (i)
  // panel had to learn the hard way when its close button ended up wired 490 lines
  // below the things that could throw.
  ui.dismiss.addEventListener('click', () => { ui.region.hidden = true; });

  /** Set when WE asked the worker to step aside, so `controllerchange` can tell
   *  "the reader pressed the button" from "a legacy worker claimed this page on
   *  its own". The first must reload; the second must only offer. */
  let asked = false;
  /** A reload is one-way and must happen exactly once. `controllerchange` can
   *  fire more than once, and reloading twice loses whatever the reader typed
   *  between the press and the swap. */
  let reloading = false;
  const reloadOnce = (): void => {
    if (reloading) return;
    reloading = true;
    location.reload();
  };

  ui.reload.addEventListener('click', () => {
    // Ask the waiting worker to take over, then reload when it HAS — reloading
    // first would just re-enter the same old worker and show this line again,
    // which is the loop a plain `location.reload()` produces once the worker
    // waits properly. If there is nothing waiting (a legacy worker that already
    // claimed the page, or no worker at all), a plain reload is still correct.
    const waiting = registration?.waiting;
    if (waiting) {
      asked = true;
      try { waiting.postMessage({ type: 'SKIP_WAITING' }); } catch { reloadOnce(); }
      // If the swap never happens, SAY SO. This used to reload after three
      // seconds, which on an installed iPadOS app re-entered the same build and
      // re-offered the same update — a control that visibly does nothing, which
      // is what made somebody press it ten times before force-closing. A reload
      // cannot fix this: the platform will not release the old version while the
      // app is running, so the only honest move is to name the thing that works.
      setTimeout(() => {
        if (reloading) return;              // the swap happened; we are on our way out
        ui.words.textContent = UPDATE_STUCK_WORDS;
        ui.reload.hidden = true;            // pressing it again cannot help
      }, 3000);
      return;
    }
    reloadOnce();
  });
  ui.save.addEventListener('click', () => {
    void (async () => {
      ui.save.disabled = true;
      try {
        await deliverCopy(session);
        ui.words.textContent = UPDATE_SAVED_WORDS;
      } catch (err) {
        ui.words.textContent = updateFailedWords((err as Error).message);
      } finally {
        ui.save.disabled = false;
      }
    })();
  });

  const show = (): void => {
    // Never re-shown after it has been dismissed in this session: an offer repeated
    // until it is accepted is a nag, and this one is genuinely optional.
    if (ui.region.dataset.seen === 'true') return;
    ui.region.dataset.seen = 'true';
    ui.words.textContent = UPDATE_WORDS;
    ui.region.hidden = false;
  };

  if (!('serviceWorker' in navigator)) return;

  /**
   * Did anything control this page when we started?
   *
   * §7h.3 says a newcomer is never told, and `updateIsReady` gates on exactly
   * that — but `controllerchange` below never consults it, so the gate was not
   * on the path that needed it. `clients.claim()` in the worker's `activate`
   * hands a FIRST-EVER visitor its first controller, which fires
   * `controllerchange` like any other swap. A brand-new arrival was therefore
   * told a new version was ready, thirty seconds into their first visit.
   *
   * Found by `tools/update-walk.mjs` on a genuinely fresh profile. The unit
   * test asserting §7h.3 passed throughout, because the defect was never in the
   * function it tested.
   */
  let hadController = navigator.serviceWorker.controller != null;

  navigator.serviceWorker.register('./sw.js').then(reg => {
    registration = reg;
    if (updateIsReady(reg, navigator.serviceWorker.controller)) show();
    reg.addEventListener('updatefound', () => {
      const fresh = reg.installing;
      if (!fresh) { show(); return; }
      fresh.addEventListener('statechange', () => {
        if (fresh.state === 'installed' && navigator.serviceWorker.controller) show();
      });
    });
  }).catch(() => {
    // Registration failing costs offline support and this prompt. It must not cost
    // the app.
  });

  // Two different events wear the same name here. If WE asked, the swap is the
  // reader's decision arriving and the page reloads onto a build that is new all
  // the way through. If we did not, something claimed this page without being
  // asked — a 1.18.0 worker still out there — and the honest response is to
  // OFFER, never to reload underneath somebody who is typing.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (asked) { reloadOnce(); return; }
    // A FIRST claim is not an update. Record it and say nothing (§7h.3); every
    // swap after this one is a genuine replacement and is worth offering.
    if (!hadController) { hadController = true; return; }
    show();
  });
}
