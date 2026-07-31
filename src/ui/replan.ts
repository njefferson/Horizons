// The replan surface — product law 3 made visible (ADR-0012, ADR-0034).
//
// **This is not a list of things you failed to do.** No such list exists in this
// app. A hard date that went by becomes a live decision with its context already
// assembled, because by the time a date is behind you the real question is
// "should I still do this, and by when?" — and a bucket answers neither half.
//
// Two shapes, deliberately:
//  - The SURFACE is three quiet rows. Five options on each would be fifteen
//    buttons on one screen, which is the pile in a new costume, and this audience
//    is exactly the one for whom that is expensive.
//  - The SHEET is one item, its context, and the five options at full size with
//    their consequences spelled out. A native <dialog>, so the platform gives us
//    the modal semantics, Esc and the focus trap rather than us reimplementing
//    them badly — the same choice the detail sheet made.
//
// The options are built from REPLAN_CHOICES rather than written into the markup,
// so the surface cannot offer something the intent layer does not implement, and
// cannot drift from ADR-0012's order.

import type { Session } from './session.ts';
import type { ReplanCard } from '../replan.ts';
import { replanCards, replanWords, contextWords, REPLAN_CAP } from '../replan.ts';
import { localDayKey } from '../time.ts';
import { demandClocksOf } from './triage-intents.ts';
import { replanEvents, canResolve, REPLAN_CHOICES } from './replan-intents.ts';
import type { ReplanChoice } from '../events.ts';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/**
 * How many there are, in words. Says the true total whenever the cap is hiding
 * some, because a surface that shows three of nine without saying so is lying by
 * omission — and it is a number, never a score: nothing here counts what you did
 * not do, it counts decisions waiting to be made.
 */
export function countWords(total: number, shown: number): string {
  if (total === 1) return 'One date has gone by.';
  if (total <= shown) return `${total} dates have gone by.`;
  return `${total} dates have gone by. These ${shown} first.`;
}

export interface ReplanUI { refresh(): void }

export function mountReplan(session: Session, now: () => number, onChange: () => void): ReplanUI {
  const q = <T extends HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);
  const region = q('#replan');
  const heading = q('#replan-heading');
  const count = q('#replan-count');
  const list = q('#replan-cards');
  const live = q('#replan-live');
  const dlg = q<HTMLDialogElement>('#replan-sheet');
  const title = q('#replan-sheet-title');
  const when = q('#replan-sheet-when');
  const context = q('#replan-sheet-context');
  const error = q('#replan-sheet-error');
  const options = q('#replan-options');
  const sheetLive = q('#replan-sheet-live');
  if (!region || !heading || !count || !list || !live || !dlg || !title ||
      !when || !context || !error || !options || !sheetLive) {
    return { refresh() {} };
  }
  const REGION = region, HEADING = heading, COUNT = count, LIST = list, LIVE = live,
    DLG = dlg, TITLE = title, WHEN = when, CONTEXT = context, ERROR = error,
    OPTIONS = options, SHEET_LIVE = sheetLive;

  /** What actually happened, in words, after each choice — announced rather than
   *  left for the user to infer from a row disappearing. */
  const OUTCOME: Record<ReplanChoice, string> = {
    compress: 'back today, smaller.',
    escalate: 'now a waiting-for, checked in three days.',
    renegotiate: 'the conversation comes back tomorrow.',
    'new-date': 'given a new date.',
    // Not "no clock" — the gate covers the cleared date with a review cure, so
    // the item does still carry one. Nothing is owed, which is the true part and
    // the part that matters.
    'to-menu': 'on the Menu — nothing owed.',
  };

  let current: ReplanCard | null = null;
  // One write at a time. Every other surface in this app learned the same lesson:
  // without it a double-tap writes the decision twice, and the log records an
  // action the user took once, twice.
  let busy = false;

  const nowIso = (): string => new Date(now()).toISOString();

  /** Say it where it can be HEARD and where it can be SEEN. A failure reported
   *  only to a visually-hidden region is a failure a sighted user never learns
   *  about (F-08).
   *
   *  Into its OWN line, not over the top of "that date was five days ago". The
   *  first version overwrote that, so pressing Set with an empty box cost the
   *  user the context this card exists to assemble — and did not give it back
   *  until the sheet was closed and reopened. */
  const say = (msg: string, alsoVisible = false): void => {
    SHEET_LIVE.textContent = msg;
    if (alsoVisible) { ERROR.textContent = msg; ERROR.hidden = false; }
  };

  /** Focus somewhere real after the sheet closes. Resolving a card REMOVES the
   *  row that opened it, and it may empty the whole section — so the guard has to
   *  have an else, or finishing the last one strands focus on <body>. */
  const restoreFocus = (): void => {
    if (!REGION.hidden) HEADING.focus();
    else document.querySelector<HTMLElement>('#capture')?.focus();
  };

  const resolve = async (choice: ReplanChoice, dayKey?: string): Promise<void> => {
    if (!current || busy) return;
    busy = true;
    const { node, passedKinds } = current;
    const label = node.title || '(untitled)';
    // Refusing rather than inventing. Asked of the SAME predicate the builder
    // uses, so the surface cannot believe a date is acceptable that the events
    // layer will then silently drop — which would look like a button that does
    // nothing at all.
    if (!canResolve(choice, dayKey)) { say('Pick a date first.', true); busy = false; return; }
    let landed = false;
    try {
      // EVERY passed clock, and the node's ACTUAL kind. Passing only the clock
      // the card names left the others live and the card came straight back;
      // letting the kind default to 'action' wrote a transition that never
      // happened into an append-only log (audit).
      await session.commit(ctx =>
        replanEvents(ctx, node.id, choice, passedKinds, dayKey, node.kind,
          demandClocksOf(session.state().nodes.get(node.id))));
      landed = true;
    } catch (err) {
      say(`Couldn’t do that — ${(err as Error).message}`, true);
    } finally {
      busy = false;
    }
    if (!landed) return;
    // From here the decision IS in the log, and nothing below may un-say it.
    try { onChange(); refresh(); } catch { /* a render bug must not contradict a landed write */ }
    // Announce into #status as well as the section's own region. Resolving the
    // LAST card hides the whole section, and a live region inside a hidden
    // element announces nothing — so on the one occasion most worth confirming,
    // the confirmation would have been silent.
    const said = `${label}: ${OUTCOME[choice]}`;
    LIVE.textContent = said;
    const status = document.querySelector<HTMLElement>('#status');
    if (status) status.textContent = said;
    if (DLG.open) DLG.close();
    restoreFocus();
  };

  /** The five options, built once. `new-date` is the only one that needs an
   *  answer from the user, so it renders as a labelled date box beside its
   *  button rather than as a second hidden step. */
  function buildOptions(): void {
    OPTIONS.replaceChildren(...REPLAN_CHOICES.map(({ choice, label, hint }) => {
      const row = el('div', 'replan-option');
      if (choice === 'new-date') {
        const lab = el('label', 'replan-option-label', label);
        lab.htmlFor = 'replan-new-date';
        const input = el('input', 'replan-date');
        input.type = 'date';
        input.id = 'replan-new-date';
        // A new plan for a date already behind you is not a plan. `min` lets the
        // PLATFORM say so, which is better than the app refusing after the fact:
        // it is a date picker doing what date pickers do, not a judgement. If one
        // still gets through, the returning card says plainly that it went by —
        // which is true, so nothing is claimed that the data does not support.
        input.min = localDayKey(nowIso(), session.zone);
        const set = el('button', 'replan-set', 'Set');
        set.type = 'button';
        set.addEventListener('click', () => void resolve('new-date', input.value));
        row.append(lab, input, set);
        row.append(el('span', 'replan-option-hint', hint));
        return row;
      }
      const b = el('button', 'replan-choice');
      b.type = 'button';
      b.append(el('span', 'replan-choice-label', label));
      // The consequence, spelled out. A control whose outcome is unclear is
      // expensive for this audience, and these outcomes are not guessable.
      b.append(el('span', 'replan-choice-hint', hint));
      b.addEventListener('click', () => void resolve(choice));
      row.append(b);
      return row;
    }));
  }

  function open(card: ReplanCard): void {
    current = card;
    TITLE.textContent = card.node.title || '(untitled)';
    WHEN.textContent = replanWords(card.daysAgo);
    const ctxWords = contextWords(card, session.zone);
    CONTEXT.textContent = ctxWords ?? '';
    CONTEXT.hidden = ctxWords === null;
    ERROR.textContent = '';
    ERROR.hidden = true;
    SHEET_LIVE.textContent = '';
    if (!DLG.open) DLG.showModal();
  }

  function refresh(): void {
    const view = replanCards(session.state(), nowIso(), session.zone);
    REGION.hidden = view.total === 0;
    if (view.total === 0) {
      LIST.replaceChildren();
      COUNT.textContent = '';
      return;
    }
    COUNT.textContent = countWords(view.total, view.cards.length);
    LIST.replaceChildren(...view.cards.map(card => {
      const li = el('li', 'replan-card');
      const b = el('button', 'replan-open');
      b.type = 'button';
      b.append(el('span', 'replan-card-title', card.node.title || '(untitled)'));
      // States the fact in words, so nothing here depends on seeing a colour
      // (B-01) — and it is a fact, never a rebuke.
      b.append(el('span', 'replan-card-when', replanWords(card.daysAgo)));
      b.addEventListener('click', () => open(card));
      li.append(b);
      return li;
    }));
  }

  buildOptions();
  q<HTMLButtonElement>('#replan-close')?.addEventListener('click', () => {
    DLG.close();
    restoreFocus();
  });

  refresh();
  return { refresh };
}

export { REPLAN_CAP };
