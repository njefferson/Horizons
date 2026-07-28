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
// triaging.

import type { Session } from './session.ts';
import { nextToHeat, nextToClarify, inboxGauge } from '../triage.ts';
import { heatEvents, routeEvents } from './triage-intents.ts';
import type { ClarifyRoute, Heat } from '../events.ts';

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
  if (!region || !card || !prompt || !actions || !gauge || !live) return { refresh() {} };
  // Non-null bindings, so the nested refresh() closure keeps the narrowing the
  // guard above established.
  const REGION = region, CARD = card, PROMPT = prompt, ACTIONS = actions, GAUGE = gauge, LIVE = live;

  let timer: number | undefined;

  const clearTimer = (): void => {
    if (timer !== undefined) { clearInterval(timer); timer = undefined; }
  };

  const commit = async (make: Parameters<Session['commit']>[0], announce: string): Promise<void> => {
    try {
      await session.commit(make);
      LIVE.textContent = announce;
    } catch (err) {
      LIVE.textContent = `Couldn’t do that — ${(err as Error).message}`;
    }
    onChange();
    refresh();
  };

  // A do-now route also starts a visible 2-minute timer; when it ends or is
  // stopped, one do-now.timed with the outcome. The timer is an affordance, not
  // a gate — the item is already routed and clocked.
  const startDoNowTimer = (node: string): void => {
    clearTimer();
    const startedAt = new Date().toISOString();
    const DURATION = 120; // seconds
    let left = DURATION;
    const bar = el('div', 'donow');
    const label = el('span', 'donow-label');
    const stop = el('button', 'ghost', 'Stop');
    stop.type = 'button';
    bar.append(label, stop);
    PROMPT.after(bar);

    const finish = async (outcome: 'completed' | 'abandoned'): Promise<void> => {
      clearTimer();
      bar.remove();
      await session.commit(ctx => [{
        id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
        kind: 'do-now.timed', node,
        payload: { startedAt, endedAt: new Date().toISOString(), outcome },
      } as unknown as import('../events.ts').AppEvent]).catch(() => {});
    };

    const tick = (): void => {
      const m = Math.floor(left / 60);
      const sec = String(left % 60).padStart(2, '0');
      label.textContent = `Two minutes: ${m}:${sec} left`;
      if (left <= 0) void finish('completed');
      left -= 1;
    };
    tick();
    timer = setInterval(tick, 1000) as unknown as number;
    stop.addEventListener('click', () => void finish('abandoned'));
  };

  const renderHeat = (nodeId: string, text: string): void => {
    PROMPT.textContent = 'Hot or cold?';
    CARD.textContent = text;
    ACTIONS.replaceChildren(...(['hot', 'cold'] as Heat[]).map(h => {
      const b = el('button', 'route', h === 'hot' ? 'Hot' : 'Cold');
      b.type = 'button';
      b.addEventListener('click', () => void commit(
        ctx => heatEvents(ctx, nodeId, h),
        `Marked ${h}.`,
      ));
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
      b.addEventListener('click', () => void commit(
        ctx => routeEvents(ctx, nodeId, route, kind as never),
        `Routed to ${label}.`,
      ).then(() => { if (route === 'do-now') startDoNowTimer(nodeId); }));
      return b;
    }));
  };

  function refresh(): void {
    clearTimer();
    document.querySelector('.donow')?.remove();
    const g = inboxGauge(session.state());
    GAUGE.textContent = g.unclarified === 0
      ? 'Inbox clear.'
      : `${g.unclarified} to clarify${g.unheated ? ` · ${g.unheated} not yet hot/cold` : ''}`;

    // Heat pass first while there is anything unheated; then clarify. Both are
    // one card; the surface hides itself when the inbox is clear.
    const heatItem = nextToHeat(session.state());
    const clarifyItem = nextToClarify(session.state());

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
