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
import { heatEvents, routeEvents } from './triage-intents.ts';
import type { AppEvent, ClarifyRoute, Heat } from '../events.ts';

const ROUTES: { route: ClarifyRoute; label: string; hint: string }[] = [
  { route: 'do-now', label: 'Do now', hint: 'a two-minute thing — start the timer' },
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

  // A do-now route starts a visible two-minute timer in DONOW. It is an
  // affordance, not a gate — the item is already routed and clocked. On finish
  // or stop, exactly one do-now.timed carries the outcome. `ended` makes finish
  // idempotent, so a completion racing a Stop click cannot commit twice.
  const startDoNowTimer = (node: string): void => {
    // Starting a new timer while one runs records the old one as abandoned — its
    // outcome is never silently dropped.
    active?.stop('abandoned');

    const startedAt = new Date().toISOString();
    const DURATION = 120; // seconds
    let left = DURATION;
    let ended = false;
    let interval: number | undefined;

    const bar = el('div', 'donow');
    const label = el('span', 'donow-label');
    const stopBtn = el('button', 'ghost', 'Stop');
    stopBtn.type = 'button';
    bar.append(label, stopBtn);
    DONOW.replaceChildren(bar);

    const finish = (outcome: 'completed' | 'abandoned'): void => {
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
    };
    const handle = { stop: finish };
    active = handle;

    const tick = (): void => {
      const m = Math.floor(left / 60);
      const sec = String(left % 60).padStart(2, '0');
      label.textContent = `Two minutes: ${m}:${sec} left`;
      if (left <= 0) { finish('completed'); return; }
      left -= 1;
    };
    tick();
    interval = setInterval(tick, 1000) as unknown as number;
    stopBtn.addEventListener('click', () => finish('abandoned'));
  };

  const renderHeat = (nodeId: string, text: string): void => {
    PROMPT.textContent = 'Hot or cold?';
    CARD.textContent = text;
    ACTIONS.replaceChildren(...(['hot', 'cold'] as Heat[]).map(h => {
      const b = el('button', 'route', h === 'hot' ? 'Hot' : 'Cold');
      b.type = 'button';
      b.addEventListener('click', () => {
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
        void commit(ctx => routeEvents(ctx, nodeId, route, kind as never), `Routed to ${label}.`)
          .then(ok => {
            // Start the timer only if the route actually landed, and only after
            // the card has advanced — the timer's own region is untouched by that.
            if (ok && route === 'do-now') startDoNowTimer(nodeId);
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
