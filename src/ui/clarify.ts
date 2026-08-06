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
import {
  clocksOf, demandClocksOf, fileReceiptWords, fileUnderEvents, fileUnderNewEvents,
  heatEvents, placeReturnDays, routeEvents, undoRouteEvents,
} from './triage-intents.ts';
import { CONTAINER_KINDS } from '../tree.ts';
import { captureContextWords } from '../capture-context.ts';
import { timerMinutesOf, timerWords, timerWordsLower } from '../timer.ts';
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

export interface TriageUI {
  refresh(): void;
  /** Re-word an on-screen do-now offer after the timer length changes (1.10.0).
   *  Separate from `refresh` on purpose — see the note at its definition. */
  relabelTimer(): void;
}

/** Mount the triage surface. `onChange` lets the shell re-render its own list
 *  (the held-items view) when triage moves an item. `openDetail` opens the
 *  card's detail sheet — what makes rename, a real date, filing and a person
 *  reachable mid-triage (1.3.0) without the six routes growing a seventh. */
export function mountTriage(
  session: Session, onChange: () => void,
  openDetail?: (n: import('../fold.ts').NodeState) => void,
): TriageUI {
  const region = document.querySelector<HTMLElement>('#triage');
  const card = document.querySelector<HTMLElement>('#triage-card');
  const prompt = document.querySelector<HTMLElement>('#triage-prompt');
  const actions = document.querySelector<HTMLElement>('#triage-actions');
  const gauge = document.querySelector<HTMLElement>('#triage-gauge');
  const live = document.querySelector<HTMLElement>('#triage-live');
  const donow = document.querySelector<HTMLElement>('#triage-donow');
  if (!region || !card || !prompt || !actions || !gauge || !live || !donow) return { refresh() {}, relabelTimer() {} };
  // Non-null bindings, so the nested refresh() closure keeps the narrowing the
  // guard above established.
  const REGION = region, CARD = card, PROMPT = prompt, ACTIONS = actions, GAUGE = gauge, LIVE = live, DONOW = donow;
  const captureInput = (): HTMLElement | null => document.querySelector<HTMLElement>('#capture');

  // The last-action undo lives OUTSIDE the triage section, beside the do-now
  // offer — for the same reason that does: routing your last inbox item hides
  // the whole section, and the way to take that route back must not vanish with
  // it. Optional, so older markup without it simply has no undo.
  const undoRegion = document.querySelector<HTMLElement>('#triage-undo');

  /**
   * WHEN IT WAS WRITTEN (1.23.0) — the one thing triage has never been able to
   * tell you about a card.
   *
   * `docs/nd-collisions.md` entry 17: the context that made a fragment
   * meaningful lives in working memory and is gone within hours, so "call about
   * the thing" arrives here as a stranger's note and gets routed blind, or
   * trashed, or kept out of a vague sense it might have mattered. Capture is
   * right to ask nothing at write time; the log already knows the answer and
   * nobody has ever been shown it.
   *
   * IT NEVER BLOCKS, and that is the whole shape of this code. The card renders
   * from state, synchronously, exactly as it always has; this fills in
   * afterwards or not at all. Nothing on the path to a first capture waits on a
   * store read (ADR-0001), and a store that is slow or broken costs a line of
   * grey text rather than the item somebody was deciding about.
   *
   * The `showing` guard is the other half: a lookup resolving after the card
   * has moved on would attach one item's history to another item's title, which
   * is worse than saying nothing at all.
   */
  const contextLine = document.querySelector<HTMLElement>('#triage-where');
  const paintContext = (nodeId: string | null): void => {
    if (!contextLine) return;
    // Cleared FIRST, every time. Left alone, the previous card's line survives
    // the moment between renders and belongs to whatever is on screen now.
    contextLine.textContent = '';
    contextLine.hidden = true;
    if (!nodeId) return;
    void session.store.firstEventFor(nodeId)
      .then((first) => {
        if (!first || showing !== nodeId || !contextLine) return;
        const words = captureContextWords(first.at, session.zone, new Date().toISOString());
        if (!words) return;
        contextLine.textContent = words;
        contextLine.hidden = false;
      })
      .catch(() => { /* a line of context, never the card */ });
  };

  // The one running do-now timer, if any. It lives in DONOW (a stable region
  // outside the card carousel) so refresh() advancing the card never touches it.
  // The one running timer, if any. `stop` takes no verdict — closing a timer
  // records its span and nothing about why it closed (1.10.0, ADR-0059).
  let active: { stop: (andDone?: boolean) => void } | null = null;

  /**
   * PASSED OVER THIS SESSION (1.25.0) — a way out of a surface that had none.
   *
   * Reported from a phone: paths in without a path out. The heat pass offered
   * Hot and Cold, clarify offered seven routes, and neither had a skip — while
   * Next up has had "Not this" since ADR-0030. `unclarified` is oldest-first
   * and stable, so a card somebody could not decide about was not merely
   * awkward: it was the SAME card at the top of the surface every time the app
   * opened, for ever. The wall this app exists to prevent, built into the
   * surface whose job is to drain the inbox.
   *
   * IN MEMORY, AND NOWHERE ELSE — Next up's rule exactly. A skip that survived
   * a reload would be a record of a decision the app promised not to keep, and
   * on THIS surface it would be worse than on the offer: a durable list of what
   * somebody could not face is the wall rebuilt one layer down, with the app
   * keeping it for them. Nothing is written, nothing is counted, and the gauge
   * never mentions it.
   */
  const passed = new Set<string>();

  /** Which node the card currently shows, so tapping it can open the right
   *  sheet. The card is a real <button> since 1.3.0. */
  let showing: string | null = null;
  CARD.addEventListener('click', () => {
    if (!showing || !openDetail) return;
    const n = session.state().nodes.get(showing);
    if (n) openDetail(n);
  });

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
   *  (found on device). Gated like every other completion. */
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
    active?.stop();
    // NAME the item. The offer used to say "Now — finish it, or take two minutes"
    // with no hint of WHAT, so a fast router landed on a bar demanding an answer
    // about a thing it would not name (found on device).
    const title = session.state().nodes.get(node)?.title || '(untitled)';
    const bar = el('div', 'donow');
    bar.append(el('span', 'donow-label', `Now: ${title}`));
    const done = el('button', 'donow-done', 'Done');
    done.type = 'button';
    // Distinct from Next up's Done, which sits on the same screen (§4). Leads
    // with the visible word so saying it still works (SC 2.5.3).
    done.setAttribute('aria-label', 'Done with what you are on now');
    done.addEventListener('click', () => { DONOW.replaceChildren(); markDone(node); });
    const start = el('button', 'ghost', `Start ${timerWordsLower(timerMinutesOf(session.state()))}`);
    start.dataset.startTimer = 'yes';
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

  /**
   * The timer, started only when asked for — PRESENCE, NOT PROGRESS
   * (1.10.0, ADR-0059).
   *
   * It shows that it is running and says what you chose, and it shows nothing
   * about how far through you are. See `src/timer.ts` for why: any rendering of
   * progress toward a chosen end is a fraction, and a fraction is a score.
   *
   * Stopping writes NOTHING about stopping. `src/requests.ts` and ADR-0056 say
   * the do-now offer's "Not now" is "event-free, forever", and until 1.10.0 the
   * timer beside it wrote `outcome: 'abandoned'` on every stop — the same flow
   * keeping a record the same flow forbids.
   */
  const startDoNowTimer = (node: string): void => {
    // Starting a new timer while one runs closes the old one. Its SPAN is
    // recorded, because a span is a fact about what you did; nothing about why
    // it ended is, because that would be a verdict.
    active?.stop();

    const startedAt = new Date().toISOString();
    const minutes = timerMinutesOf(session.state());
    // `data-seconds` on the timer's own region stays a deliberate test seam —
    // a gate cannot wait twenty real minutes to check what happens at the end.
    // Nothing in the app writes it, so shipped behaviour is always the choice.
    const DURATION = Number(DONOW.dataset.seconds) || minutes * 60;
    let ended = false;
    let timeout: number | undefined;

    const bar = el('div', 'donow');
    // The commitment, in words. Not a countdown, not a fill: a sentence, which
    // is the one form that can hold something you may walk away from.
    const label = el('span', 'donow-label', `${timerWords(minutes)}, running.`);
    // The presence mark. It says "on" and nothing else — no fill, no fraction,
    // no growth. CSS gives it a gentle pulse and a static fallback under
    // prefers-reduced-motion; either way it never encodes an amount.
    const mark = el('span', 'donow-running');
    mark.setAttribute('aria-hidden', 'true');
    // Done is available THROUGHOUT, in one tap. Finishing in forty seconds is
    // the good case, and it should not require stopping a timer first.
    const doneBtn = el('button', 'donow-done', 'Done');
    doneBtn.type = 'button';
    doneBtn.setAttribute('aria-label', 'Done with what you are on now');
    // "Stop" and not "Give up". Leaving is an ordinary move with no cost.
    const stopBtn = el('button', 'ghost', 'Stop');
    stopBtn.type = 'button';
    bar.append(mark, label, doneBtn, stopBtn);
    DONOW.replaceChildren(bar);

    /**
     * Close the timer. ONE `do-now.timed` carries the span and nothing else —
     * the `focus.started` / `focus.ended` shape, which records what you did
     * without judging it. The chosen length is deliberately absent from the
     * payload, so a shortfall cannot be reconstructed by subtraction (the
     * arithmetic that got the report's "Started" section deleted in 1.9.0).
     */
    const finish = (andDone = false): void => {
      if (ended) return;
      ended = true;
      if (timeout !== undefined) clearTimeout(timeout);
      if (active === handle) active = null;
      bar.remove();
      void session.commit(ctx => [{
        id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
        kind: 'do-now.timed', node,
        payload: { startedAt, endedAt: new Date().toISOString() },
      } as unknown as AppEvent]).catch(() => {});
      if (andDone) markDone(node);
    };
    const handle = { stop: finish };
    active = handle;

    /**
     * The chosen time has passed. **The timer goes away.**
     *
     * It does not ask whether you finished. It used to record `completed` the
     * instant the clock hit zero, which was the app asserting something it had
     * never asked; then it asked, which made the chosen length the size of the
     * job. It is neither: the length was the entry price, and reaching it is
     * not an achievement to confirm or a deadline to answer for.
     *
     * The bar removes itself and one line goes to the live region. Silent
     * removal would be an accessibility defect — a control vanishing with no
     * announcement is a control that disappeared for a screen-reader user with
     * no way to know it had. The item stays clocked for today either way.
     */
    const done = (): void => {
      if (ended) return;
      LIVE.textContent = `That is ${timerWordsLower(minutes)}. It is still there when you want it.`;
      finish();
      restoreFocus();
    };

    timeout = setTimeout(done, DURATION * 1000) as unknown as number;
    doneBtn.addEventListener('click', () => finish(true));
    stopBtn.addEventListener('click', () => { finish(); restoreFocus(); });
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
  const showUndo = (
    node: string, route: ClarifyRoute, fromKind: NodeKind, where: string,
    words?: string,
  ): void => {
    if (!undoRegion) return;
    const bar = el('p', 'triage-undo-bar');
    bar.append(el('span', 'triage-undo-where', words ?? `Sent to ${where}.`));
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

  /**
   * "Not this one" — the way past a card, on both passes.
   *
   * It commits nothing and announces the move rather than the decision: there
   * was no decision. The words matter as much as the behaviour here, because
   * this control exists for the moment somebody cannot answer the question, and
   * a label that implied they had answered it would be the surface putting a
   * verdict in their mouth.
   *
   * Marked `ghost` like Next up's "Not this", so it reads as the way past
   * rather than as an eighth route.
   */
  const skipControl = (nodeId: string): HTMLButtonElement => {
    const b = el('button', 'route ghost');
    b.type = 'button';
    b.append(el('span', 'route-label', 'Not this one'),
             el('span', 'route-hint', 'come back to it — nothing is recorded'));
    b.addEventListener('click', () => {
      passed.add(nodeId);
      // A pending route-undo belongs to a DIFFERENT card, and the surface is
      // about to show one. Same reasoning as the heat tap above it.
      clearUndo();
      LIVE.textContent = 'Passed over. It is still in the inbox.';
      refresh();
      restoreFocus();
    });
    return b;
  };

  const renderHeat = (nodeId: string, text: string): void => {
    PROMPT.textContent = 'Hot or cold?';
    showing = nodeId;
    CARD.textContent = text;
    paintContext(nodeId);
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
    ACTIONS.append(skipControl(nodeId));
  };

  /**
   * WHERE, which triage has never been able to answer.
   *
   * Reported 2026-08-04: a backlog imported to work through and file in the
   * right places, and the places kept turning out not to exist yet. That was
   * the problem. The six routes above all answer WHEN. This one answers where,
   * and it MAKES the place when it is not there — law 4, levels push down and
   * the user never climbs. Sending him off to create a project and come back is
   * the climb, and across a 1,173-item import it is the whole difficulty.
   *
   * The picker replaces the routes rather than opening over them: one decision
   * is on screen at a time, and Back is the first control wired (§14).
   */
  const renderPlaces = (nodeId: string, text: string, kind: string, heat: Heat | null): void => {
    const st = session.state();
    const places = [...st.nodes.values()]
      .filter(n => !n.trashed && !n.mergedInto && CONTAINER_KINDS.has(n.kind) && n.id !== nodeId)
      .sort((a, b) => (a.title || '').localeCompare(b.title || ''));

    PROMPT.textContent = 'Where does it go?';
    CARD.textContent = text;

    const back = el('button', 'route ghost');
    back.type = 'button';
    back.append(el('span', 'route-label', 'Back'), el('span', 'route-hint', 'keep deciding when instead'));
    back.addEventListener('click', () => renderClarify(nodeId, text, kind, heat));

    // The receipt (V2 stage 1). Computable BEFORE the commit in both paths: an
    // existing place's clocks are already in state, and a place minted by the
    // file itself has, by construction, no human clock yet — so its receipt is
    // always the honest no-date branch. That branch is the hollow-return
    // finding surfaced to the one person who can date the place.
    const fileInto = (
      make: (c: Parameters<Session['commit']>[0] extends (ctx: infer C) => unknown ? C : never) => AppEvent[],
      where: string,
      place: import('../fold.ts').NodeState | null,
    ): void => {
      clearUndo();
      const receipt = fileReceiptWords(
        where, placeReturnDays(place, new Date().toISOString(), session.zone));
      void commit(make as Parameters<Session['commit']>[0], receipt).then(ok => {
        if (ok) showUndo(nodeId, 'filed', kind as NodeKind, where, receipt);
        restoreFocus();
      });
    };

    const rows: HTMLElement[] = [back];

    // Naming a place that does not exist is the FIRST thing offered, because it
    // is the case that was missing and the one an import runs into constantly.
    const form = el('div', 'place-new');
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'triage-place-new';
    input.placeholder = 'Name a new place';
    const label = el('label', 'visually-hidden', 'Name a new place to put this in');
    label.setAttribute('for', 'triage-place-new');
    const make = el('button', 'route');
    make.type = 'button';
    make.append(el('span', 'route-label', 'Make it'), el('span', 'route-hint', 'a new place, and put this in it'));
    make.addEventListener('click', () => {
      const title = input.value.trim();
      if (!title) { input.focus(); return; }
      fileInto(c => fileUnderNewEvents(c, nodeId, title, clocksOf(session.state().nodes.get(nodeId))), title, null);
    });
    form.append(label, input, make);
    rows.push(form);

    for (const p of places) {
      const b = el('button', 'route');
      b.type = 'button';
      const name = p.title || '(untitled)';
      b.append(el('span', 'route-label', name), el('span', 'route-hint', p.kind));
      // Distinct spoken names (§4) that still lead with the visible words (SC 2.5.3).
      b.setAttribute('aria-label', `${name} — put it in this ${p.kind}`);
      b.addEventListener('click', () => {
        fileInto(c => fileUnderEvents(c, nodeId, p.id, clocksOf(session.state().nodes.get(nodeId))), name, p);
      });
      rows.push(b);
    }

    ACTIONS.replaceChildren(...rows);
  };

  const renderClarify = (nodeId: string, text: string, kind: string, heat: Heat | null): void => {
    PROMPT.textContent = heat ? `Clarify (${heat}):` : 'Clarify:';
    showing = nodeId;
    CARD.textContent = text;
    paintContext(nodeId);
    const routeButtons = ROUTES.map(({ route, label, hint }) => {
      const b = el('button', 'route');
      b.type = 'button';
      b.append(el('span', 'route-label', label), el('span', 'route-hint', hint));
      b.addEventListener('click', () => {
        // Supersede any earlier undo before committing — undo only ever takes
        // back the most recent route.
        clearUndo();
        void commit(ctx => routeEvents(ctx, nodeId, route, kind as never,
          demandClocksOf(session.state().nodes.get(nodeId))), `Routed to ${label}.`)
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
    });
    ACTIONS.replaceChildren(...routeButtons);

    // WHERE, offered beside the six WHENs. Last in the row because the common
    // case is still "when", and first-class rather than buried because for an
    // imported backlog it is the only question that matters.
    const put = el('button', 'route');
    put.type = 'button';
    put.append(el('span', 'route-label', 'Put it somewhere'),
      el('span', 'route-hint', 'into a place — make one if it is not there'));
    put.addEventListener('click', () => renderPlaces(nodeId, text, kind, heat));
    ACTIONS.append(put);
    // And the way past, last of all: every answer first, then the way out for
    // when none of them is available yet.
    ACTIONS.append(skipControl(nodeId));
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
    //
    // WHAT WAS PASSED OVER GOES TO THE BACK, NOT AWAY (1.25.0). Prefer the
    // first card not passed this session; when every one has been, start again
    // from the top rather than showing an empty surface. That is `work.ts`'s
    // rule for its own declined set, and it matters more here: an inbox that
    // emptied itself because somebody skipped everything would be the app
    // hiding work, which is the opposite of law 1 and the exact fear that makes
    // a person keep forty tabs open.
    //
    // The GAUGE above is untouched by any of this. It counts what is in the
    // inbox, which is what the number means and what somebody would check it
    // against — a count that shrank as things were passed over would be the
    // surface keeping score of what was avoided.
    const fresh = <T extends { id: string }>(q: readonly T[]): T | null =>
      q.find(n => !passed.has(n.id)) ?? q[0] ?? null;
    const heatItem = fresh(heatQueue);
    const clarifyItem = fresh(inbox);

    if (heatItem) {
      REGION.hidden = false;
      renderHeat(heatItem.id, heatItem.title);
    } else if (clarifyItem) {
      REGION.hidden = false;
      renderClarify(clarifyItem.id, clarifyItem.title, clarifyItem.kind, clarifyItem.heat);
    } else {
      REGION.hidden = true;
      showing = null;
      CARD.textContent = '';
      paintContext(null);
      ACTIONS.replaceChildren();
    }
  }

  /**
   * Re-label an offer that is already on screen (1.10.0).
   *
   * The timer length is set in the (i) panel, which can be open while an offer
   * is showing — and a button that says "two minutes" and starts twenty is the
   * class of lie 1.7.2 was spent correcting. This is DELIBERATELY not part of
   * `refresh`: rebuilding the clarify card on every commit anywhere in the app
   * changes which card is on screen mid-interaction, which the smoke walk
   * caught immediately. Touching one button's words does not.
   */
  function relabelTimer(): void {
    const startBtn = DONOW.querySelector<HTMLButtonElement>('[data-start-timer]');
    if (startBtn) startBtn.textContent = `Start ${timerWordsLower(timerMinutesOf(session.state()))}`;
  }

  refresh();
  return { refresh, relabelTimer };
}
