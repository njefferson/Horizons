// The bother flow: naming a worry, and being asked whose it is.
//
// Rendering and wiring only; everything structural is in `src/bother.ts`.
//
// One card at a time, and the choices carry their consequences as hints — a
// forced choice with unlabelled outcomes is a guess, and this is the one question
// the whole flow turns on.

import type { Session } from './session.ts';
import {
  currentBother, botherCount, botherPrompt, botherWords, outcomeWords,
  OWNERSHIPS, OWNERSHIP_WORDS,
} from '../bother.ts';
import { botherEvents, answerBotherEvents } from './bother-intents.ts';
import type { Ownership } from '../events.ts';

export interface BotherUI { refresh(): void }

export function mountBother(session: Session, onChange: () => void): BotherUI {
  const q = <T extends HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);
  const region = q('#bother');
  const prompt = q('#bother-prompt');
  const card = q('#bother-card');
  const actions = q('#bother-actions');
  const count = q('#bother-count');
  const live = q('#bother-live');
  const form = q<HTMLFormElement>('#bother-form');
  const input = q<HTMLInputElement>('#bother-text');
  const entry = q<HTMLDetailsElement>('#bother-entry');
  if (!region || !prompt || !card || !actions || !live) return { refresh() {} };
  const REGION = region, PROMPT = prompt, CARD = card, ACTIONS = actions, LIVE = live;

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
    const b = currentBother(session.state());
    REGION.hidden = b === null;
    if (!b) { ACTIONS.replaceChildren(); return; }
    const n = botherCount(session.state());
    if (count) {
      // The TRUE number, so one-at-a-time is not a lie by omission — and never
      // the list, because a list of worries is worse than any one of them.
      count.textContent = botherWords(n);
      count.hidden = n <= 1;
    }
    PROMPT.textContent = botherPrompt(b);
    CARD.textContent = b.node.title || '(untitled)';

    ACTIONS.replaceChildren(...OWNERSHIPS.map((o: Ownership) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bother-choice';
      const label = document.createElement('span');
      label.className = 'bother-choice-label';
      label.textContent = OWNERSHIP_WORDS[o].label;
      const hint = document.createElement('span');
      hint.className = 'bother-choice-hint';
      hint.textContent = OWNERSHIP_WORDS[o].hint;
      btn.append(label, hint);
      btn.addEventListener('click', () => {
        void run(ctx => answerBotherEvents(ctx, session.state(), b.node.id, o), outcomeWords(o))
          .then(() => {
            // Focus must not fall to <body> when the button it was on is
            // replaced or removed (WCAG 2.4.3). The prompt if there is another
            // one; the entry line if that was the last.
            if (!REGION.hidden) PROMPT.focus();
            else q<HTMLElement>('#bother-summary')?.focus();
          });
      });
      return btn;
    }));
  }

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input?.value ?? '';
    if (!text.trim()) { LIVE.textContent = 'It needs to say something.'; return; }
    if (input) input.value = '';
    if (entry) entry.open = false;
    void run(ctx => botherEvents(ctx, ctx.id(), text), 'Put down. Nothing to decide yet.')
      .then(() => { if (!REGION.hidden) PROMPT.focus(); });
  });

  refresh();
  return { refresh };
}
