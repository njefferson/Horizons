// "A new version is ready" — and the offer of a copy before it lands.
//
// Noah: *"Ask to backup when update detected?"*
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
// ## Why it appears at all, given `skipWaiting()`
//
// The service worker takes over promptly on install, so the new shell is already in
// the cache and the next load gets it. The running page keeps executing the old
// bundle until it reloads. So this is never "apply the update" — it is "there is a
// newer version than the one you are looking at, and here is a moment to take a copy
// before you go to it". Saying that accurately is why the button reads as a reload
// rather than as an install.

import { deliverCopy } from './export-copy.ts';
import type { Session } from './session.ts';

/** What the line says. Precise about the risk, which is small and real, and silent
 *  about the risk it does not carry. */
export const UPDATE_WORDS =
  'A newer version is ready. Nothing you have written is at risk — this app only ever adds to its record, and an update cannot rewrite it. A copy is worth taking if you would like a point to come back to.';

/** After a copy has been handed over. States what happened, and what is still true. */
export const UPDATE_SAVED_WORDS =
  'Copy saved. Check it opened, then reload when you are ready.';

/** When the copy could not be written. Never swallowed: somebody about to reload
 *  should know the copy they asked for is not there. */
export const updateFailedWords = (why: string): string =>
  `That copy could not be saved — ${why} Nothing has changed, and you can carry on as you are.`;

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
  if (reg.waiting != null) return true;
  if (reg.installing?.state === 'installed') return true;
  // Controlled by nothing yet means a first-ever load, not an update.
  if (controller == null) return false;
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

  // THE WAY OUT FIRST, before anything that can fail — the same ordering the (i)
  // panel had to learn the hard way when its close button ended up wired 490 lines
  // below the things that could throw.
  ui.dismiss.addEventListener('click', () => { ui.region.hidden = true; });
  ui.reload.addEventListener('click', () => { location.reload(); });
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

  navigator.serviceWorker.register('./sw.js').then(reg => {
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

  // `skipWaiting()` in the worker means the new one activates without asking, so
  // this is the signal that actually fires on Noah's device.
  navigator.serviceWorker.addEventListener('controllerchange', () => { show(); });
}
