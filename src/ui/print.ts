// Building what goes on paper, and nothing else.
//
// Everything printable is rendered into `#print-area`, and the print stylesheet
// hides the whole app except that element. Before this existed the report's
// "Print it" called `window.print()` against the live page — so the output was
// the About dialog, the app behind it, and whatever the screen layout happened
// to do under print media. The button worked and the result was unusable, which
// is the worst of the available combinations.
//
// The area is emptied afterwards. It is not a cache and it is not state; it is
// scaffolding that exists for the length of one print dialog.

import type { Session } from './session.ts';
import { todayCard, snapshotWords, moreWords, EMPTY_WORDS } from '../today.ts';

const el = (tag: string, cls: string, text?: string): HTMLElement => {
  const n = document.createElement(tag);
  n.className = cls;
  if (text != null) n.textContent = text;    // textContent, never innerHTML
  return n;
};

/** Render, print, empty. Emptying afterwards matters: a stale card left in the
 *  DOM would be printed by the NEXT print, whatever it was for. */
function printThese(nodes: HTMLElement[]): void {
  const area = document.querySelector<HTMLElement>('#print-area');
  if (!area) return;
  area.replaceChildren(...nodes);
  try {
    window.print();
  } finally {
    // Not in a timeout. `window.print()` is synchronous-ish in every browser
    // that matters, and leaving the clear to a timer means a fast second print
    // races the first one's cleanup.
    area.replaceChildren();
  }
}

/** A list with its cap stated. `moreWords` returns null when nothing is held
 *  back, so an uncapped list says nothing rather than "and 0 more". */
function listBlock(heading: string, items: string[], total: number): HTMLElement[] {
  if (items.length === 0) return [];
  const out: HTMLElement[] = [el('h2', 'print-h2 print-block', heading)];
  const ul = el('ul', 'print-list print-block');
  for (const t of items) ul.append(el('li', '', t));
  out.push(ul);
  const more = moreWords(total, items.length);
  if (more) out.push(el('p', 'print-more', more));
  return out;
}

export function mountPrint(session: Session, now: () => number): void {
  document.querySelector<HTMLButtonElement>('#today-print')?.addEventListener('click', () => {
    const nowIso = new Date(now()).toISOString();
    const c = todayCard(session.state(), nowIso, session.zone);

    const nodes: HTMLElement[] = [
      el('h1', 'print-h1', 'Quietkeep'),
      el('p', 'print-when', c.day),
    ];

    if (c.head) {
      nodes.push(el('p', 'print-head print-block', c.head.title));
      nodes.push(el('p', 'print-why', c.head.why));
    } else {
      // A real and good state, said plainly rather than left as a blank page
      // somebody will assume is a bug.
      nodes.push(el('p', 'print-head print-block', EMPTY_WORDS));
    }

    nodes.push(...listBlock('Also ready', c.also, c.alsoTotal));
    nodes.push(...listBlock(
      'With other people',
      c.withOthers.map(w => [w.title, w.whom ? `— ${w.whom}` : null, w.how].filter(Boolean).join(' ')),
      c.withOthersTotal,
    ));
    nodes.push(...listBlock('Coming up', c.ahead.map(a => `${a.day} — ${a.title}`), c.aheadTotal));

    // The line that keeps the paper honest, and it goes last where a reader ends.
    nodes.push(el('p', 'print-note', snapshotWords(c.day)));
    printThese(nodes);
  });
}

/** The status report's own print path, using the same area — so it prints the
 *  report and not the dialog it was launched from. */
export function printText(text: string, heading: string): void {
  printThese([el('h1', 'print-h1', heading), el('pre', 'print-pre', text)]);
}
