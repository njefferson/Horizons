// The heat pass and the clarify surface (Phase 2).
//
// One card at a time, forced choice, oldest-first (boss hotter). The heat pass
// is the lighter first pass — two taps, hot or cold; clarify is the six routes.
// Both read projections from triage.ts and commit intent batches from
// triage-intents.ts through the gate. Neither touches the log directly.
//
// Everything the user reads is set with textContent. Every control is a real
// <button> at full target size, keyboard-first, and the current item is
// announced in a live region so a screen-reader user is told what they are
// triaging. Activating a control removes it (the card advances), so focus is
// moved to the prompt heading rather than left to fall to <body> (WCAG 2.4.3).

import type { Session } from './session.ts';
import { unclarified, needsHeat } from '../triage.ts';
import { heatEvents, routeEvents, undoRouteEvents } from './triage-intents.ts';
import { doneEvents } from './work.ts';
import type { AppEvent, ClarifyRoute, Heat, NodeKind } from '../events.ts';

const ROUTES: { route: ClarifyRoute; label: string; hint: string }[] = [
  { route: 'do-now', label: 'Do now', hint: 'this one is for today — two minutes if you want them' },
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

export interface TriageUI { refresh(): void }

/** Mount the triage surface. `onChange` lets the shell re-render its own list
 *  (the held-items view) when triage moves an item. */
export function mountTriage(session: Session, onChange: () => void): TriageUI {
  const region = document.querySelector<HTMLElement>('#triage');
  const card = document.querySelector<HTMLElement>('#triage-card');
  const prompt = document.querySelector<HTMLElement>('#triage-prompt');
  const actions = document.querySelector<HTMLElement>('#triage-actions');
  const gauge = document.querySelector<HTMLElement>('#triage-gauge');
  const live = document.querySelector<HTMLElement>('#triage-live');
  const donow = document.querySelector<HTMLElement>('#triage-donow');
  if (!region || !card || !prompt || !actions || !gauge || !live || !donow) return { refresh() {} };
  // Non-null bindings, so the nested refresh() closure keeps the narrowing the
  // guard above established.
  const REGION = region, CARD = card, PROMPT = prompt, ACTIONS = actions, GAUGE = gauge, LIVE = live, DONOW = donow;
  const captureInput = (): HTMLElement | null => document.querySelector<HTMLElement>('#capture');

  // The last-action undo lives OUTSIDE the triage section, beside the do-now
  // offer — for the same reason that does: routing your last inbox item hides
  // the whole section, and the way to take that route back must not vanish with
  // it. Optional, so older markup without it simply has no undo.
  const undoRegion = document.querySelector<HTMLElement>('#triage-undo');

  // The one running do-now timer, if any. It lives in DONOW (a stable region
  // outside the card carousel) so refresh() advancing the card never touches it.
  let active: { stop: (outcome: 'completed' | 'abandoned') => void } | null = null;

  /** Commit a batch; report success so callers only chain success-only effects
   *  (like starting the do-now timer). Announces the outcome in the live region;
   *  on a gate rejection the same card is re-rendered and the message survives. */
  const commit = async (make: Parameters<Session['commit']>[0], announce: string): Promise<boolean> => {
    let ok = true;
    try {
      await session.commit(make);
      LIVE.textContent = announce;
    } catch (err) {
      ok = false;
      LIVE.textContent = `Couldn’t do that — ${(err as Error).message}`;
    }
    onChange();
    refresh();
    return ok;
  };

  /** After an action removes the control the user activated, put focus somewhere
   *  real: the prompt of the next card, or the capture line once the inbox is
   *  clear. Focusing a non-actionable heading (not the first route) avoids an
   *  accidental double-activation of a destructive route like Trash. */
  const restoreFocus = (): void => {
    if (!REGION.hidden) PROMPT.focus();
    else captureInput()?.focus();
  };

  /** Record that the item is finished. The ONE thing the do-now flow could not
   *  do, and the thing it most obviously needed: routing something to "Do now"
   *  clocked it for today and then offered no way to say you had done it, so a
   *  two-minute job sat under "Ready now" until it was found in the list
   *  (Noah, on device). Gated like every other completion. */
  const markDone = (node: string): void => {
    void session.commit(ctx => doneEvents(ctx, node)).then(() => {
      LIVE.textContent = 'Done.';
      onChange();
    }).catch((err: Error) => { LIVE.textContent = `Couldn’t record that — ${err.message}`; });
  };

  /**
   * What a just-routed "Do now" offers: finish it, or start two minutes.
   *
   * **The timer is an offering, not a gate.** It used to start on its own the
   * moment the route landed, which made a category ("this one is for now") into
   * a stopwatch nobody asked for. The category is the useful part; the two
   * minutes are a tool some people want and others do not.
   */
  const offerDoNow = (node: string): void => {
    active?.stop('abandoned');
    // NAME the item. The offer used to say "Now — finish it, or take two minutes"
    // with no hint of WHAT, so a fast router landed on a bar demanding an answer
    // about a thing it would not name (Noah, on device).
    const title = session.state().nodes.get(node)?.title || '(untitled)';
    const bar = el('div', 'donow');
    bar.append(el('span', 'donow-label', `Now: ${title}`));
    const done = el('button', 'donow-done', 'Done');
    done.type = 'button';
    done.addEventListener('click', () => { DONOW.replaceChildren(); markDone(node); });
    const start = el('button', 'ghost', 'Start two minutes');
    start.type = 'button';
    start.addEventListener('click', () => startDoNowTimer(node));
    // A WAY OUT that keeps it for today. The offer is an offering, not a gate —
    // but "Done" and a timer were the only exits, so a category ("this one is for
    // today") became a trap with no way to simply agree and move on. Leaving it
    // dismisses the offer; the item stays clocked for today, waiting under Next up.
    const leave = el('button', 'ghost', 'Leave it for now');
    leave.type = 'button';
    leave.addEventListener('click', () => {
      DONOW.replaceChildren();
      LIVE.textContent = 'Left for today — it is waiting under Next up.';
      restoreFocus();
    });
    bar.append(done, start, leave);
    DONOW.replaceChildren(bar);
  };

  // The two-minute timer, started only when asked for. On finish or stop,
  // exactly one do-now.timed carries the outcome. `ended` makes finish
  // idempotent, so a completion racing a Stop click cannot commit twice.
  const startDoNowTimer = (node: string): void => {
    // Starting a new timer while one runs records the old one as abandoned — its
    // outcome is never silently dropped.
    active?.stop('abandoned');

    const startedAt = new Date().toISOString();
    // Two minutes, unless the page says otherwise. `data-seconds` on the timer's
    // own region is a deliberate seam: the behaviour most worth gating is what
    // happens when the clock reaches zero — it used to record "completed" there,
    // unasked — and a gate cannot wait two real minutes to check it. Nothing in
    // the app writes this attribute, so shipped behaviour is always 120.
    const DURATION = Number(DONOW.dataset.seconds) || 120;
    let left = DURATION;
    let ended = false;
    let interval: number | undefined;

    const bar = el('div', 'donow');
    const label = el('span', 'donow-label');
    // Done is available THROUGHOUT, in one tap. Finishing in forty seconds is
    // the good case, and it should not require stopping a timer first.
    const doneBtn = el('button', 'donow-done', 'Done');
    doneBtn.type = 'button';
    const stopBtn = el('button', 'ghost', 'Stop');
    stopBtn.type = 'button';
    bar.append(label, doneBtn, stopBtn);
    DONOW.replaceChildren(bar);

    /** Record the timer's outcome. `completed` means the person SAID they
     *  finished — never merely that the clock ran out. */
    const finish = (outcome: 'completed' | 'abandoned', andDone = false): void => {
      if (ended) return;
      ended = true;
      if (interval !== undefined) clearInterval(interval);
      if (active === handle) active = null;
      bar.remove();
      void session.commit(ctx => [{
        id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
        kind: 'do-now.timed', node,
        payload: { startedAt, endedAt: new Date().toISOString(), outcome },
      } as unknown as AppEvent]).catch(() => {});
      if (andDone) markDone(node);
    };
    const handle = { stop: finish };
    active = handle;

    /**
     * Two minutes are up. **ASK.**
     *
     * The old code recorded `outcome: 'completed'` the instant the clock hit
     * zero — the app asserting the person had finished something it never asked
     * about, in a log that is permanent, for an audience whose whole difficulty
     * is with time. Elapsed is not finished. Neither answer here is a failure:
     * "not yet" leaves it exactly where it was, clocked for today.
     */
    const ask = (): void => {
      if (ended) return;
      if (interval !== undefined) clearInterval(interval);
      label.textContent = 'Two minutes are up. Did you finish it?';
      doneBtn.textContent = 'Done';
      stopBtn.textContent = 'Not yet';
      // Focus the question, because the timer ending is the app speaking first
      // and the person may have looked away.
      LIVE.textContent = 'Two minutes are up. Did you finish it?';
      doneBtn.focus();
    };

    const tick = (): void => {
      const m = Math.floor(left / 60);
      const sec = String(left % 60).padStart(2, '0');
      label.textContent = `Two minutes: ${m}:${sec} left`;
      if (left <= 0) { ask(); return; }
      left -= 1;
    };
    tick();
    interval = setInterval(tick, 1000) as unknown as number;
    doneBtn.addEventListener('click', () => finish('completed', true));
    stopBtn.addEventListener('click', () => finish('abandoned'));
  };

  /** Drop the last-action undo. Any new triage action makes it stale — undo
   *  reverses the MOST RECENT route, never an older one. */
  const clearUndo = (): void => { undoRegion?.replaceChildren(); };

  /**
   * Offer to take the just-made route back. Names where the card went and, in
   * one tap, returns it to the inbox — the direct answer to "it moved and I do
   * not know how to get it back". The node id, route and prior kind are captured
   * here, so undo reverses THAT card even after the surface has advanced to the
   * next one.
   */
  const showUndo = (node: string, route: ClarifyRoute, fromKind: NodeKind, where: string): void => {
    if (!undoRegion) return;
    const bar = el('p', 'triage-undo-bar');
    bar.append(el('span', 'triage-undo-where', `Sent to ${where}.`));
    const btn = el('button', 'linklike triage-undo-btn', 'Undo');
    btn.type = 'button';
    btn.addEventListener('click', () => {
      btn.disabled = true;
      void session.commit(ctx => undoRouteEvents(ctx, node, route, fromKind))
        .then(() => {
          clearUndo();
          LIVE.textContent = 'Back in your inbox.';
          onChange();
          refresh();
          restoreFocus();
        })
        .catch((err: Error) => {
          btn.disabled = false;
          LIVE.textContent = `Couldn’t undo — ${err.message}`;
        });
    });
    bar.append(btn);
    undoRegion.replaceChildren(bar);
  };

  const renderHeat = (nodeId: string, text: string): void => {
    PROMPT.textContent = 'Hot or cold?';
    CARD.textContent = text;
    ACTIONS.replaceChildren(...(['hot', 'cold'] as Heat[]).map(h => {
      const b = el('button', 'route', h === 'hot' ? 'Hot' : 'Cold');
      b.type = 'button';
      b.addEventListener('click', () => {
        // A heat pass is a new action, so any pending route-undo is now stale.
        clearUndo();
        void commit(ctx => heatEvents(ctx, nodeId, h), `Marked ${h}.`).then(restoreFocus);
      });
      return b;
    }));
  };

  const renderClarify = (nodeId: string, text: string, kind: string, heat: Heat | null): void => {
    PROMPT.textContent = heat ? `Clarify (${heat}):` : 'Clarify:';
    CARD.textContent = text;
    ACTIONS.replaceChildren(...ROUTES.map(({ route, label, hint }) => {
      const b = el('button', 'route');
      b.type = 'button';
      b.append(el('span', 'route-label', label), el('span', 'route-hint', hint));
      b.addEventListener('click', () => {
        // Supersede any earlier undo before committing — undo only ever takes
        // back the most recent route.
        clearUndo();
        void commit(ctx => routeEvents(ctx, nodeId, route, kind as never), `Routed to ${label}.`)
          .then(ok => {
            // Offer to take it back, whichever route it was — the answer to
            // "where did it go and how do I undo it". Captured with the id, route
            // and prior kind so it reverses this card after the queue advances.
            if (ok) showUndo(nodeId, route, kind as NodeKind, label);
            // Start the timer only if the route actually landed, and only after
            // the card has advanced — the timer's own region is untouched by that.
            // OFFER, do not start. The route is the decision; the timer is a tool.
            if (ok && route === 'do-now') offerDoNow(nodeId);
            restoreFocus();
          });
      });
      return b;
    }));
  };

  function refresh(): void {
    const st = session.state();
    // Two scans, not four: the heads and the gauge all derive from these.
    const inbox = unclarified(st);
    const heatQueue = needsHeat(st);
    GAUGE.textContent = inbox.length === 0
      ? 'Inbox clear.'
      : `${inbox.length} to clarify${heatQueue.length ? ` · ${heatQueue.length} not yet hot/cold` : ''}`;

    // Heat pass first while there is anything unheated; then clarify. Both are
    // one card; the surface hides itself when the inbox is clear. A running
    // do-now timer is deliberately NOT cleared here — it lives in its own region.
    const heatItem = heatQueue[0] ?? null;
    const clarifyItem = inbox[0] ?? null;

    if (heatItem) {
      REGION.hidden = false;
      renderHeat(heatItem.id, heatItem.title);
    } else if (clarifyItem) {
      REGION.hidden = false;
      renderClarify(clarifyItem.id, clarifyItem.title, clarifyItem.kind, clarifyItem.heat);
    } else {
      REGION.hidden = true;
      CARD.textContent = '';
      ACTIONS.replaceChildren();
    }
  }

  refresh();
  return { refresh };
}
