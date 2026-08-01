// Sort mode — the second triage, over a range the user NAMED (1.3.0).
//
// The daily triage surface is captures-not-yet-routed, one card at a time. It
// structurally cannot reach an imported backlog: the `captured` latch bars
// anything that arrived by `node.created`, which is every row of an OmniFocus
// import. This surface is the same one-card conveyor pointed at a NAMED RANGE
// — the lawful bulk shape NOTES.md records: the cap governs what a surface
// shows; a range the user named is legitimate to act on. The picker shows
// sentences and counts, never lists; the card shows one thing.
//
// Shame-free at 1,222 by construction: the range's true total is stated once
// at entry as a checkable fact (the purge precedent), and during sorting NO
// number is shown — no tally, no remaining countdown, no percentage, no bar
// (law 5; a per-sitting counter is a score with a different name). Leaving is
// a Close tap and records nothing. On return the range is simply smaller.
// The ONE carve-out (1.5.0, ADR-0049): a wholesale act's status and receipt
// are counts of the APP's mechanical work — receipts, the class the log
// viewer established — never scores about the person's sorting.
//
// Verbs: the six routes, emitting EXACTLY what daily triage writes
// (`routeEvents`, reused verbatim — parity is a property test); "Open it"
// (the detail sheet, which carries rename, dates, filing, people); "Leave it"
// (next card, writes NOTHING — skipped items cycle in memory only, per the
// no-declined-record rule); and the same one-step undo the daily surface has
// (`clarify.reopened`; the gate re-cures).

import type { Session } from './session.ts';
import type { NodeState } from '../fold.ts';
import type { ClarifyRoute, MenuCategory, NodeKind } from '../events.ts';
import { rangeChoices, matchingQuery, sortable, type RangeChoice } from '../range.ts';
import { demandClocksOf, routeEvents, undoRouteEvents } from './triage-intents.ts';
import { heldStatus } from '../held.ts';
import { heldNodes } from '../gate.ts';
import { isContainer } from '../tree.ts';
import { normalize } from '../search.ts';
import { deliverCopy, deliverRangeCopy } from './export-copy.ts';
import {
  planBulk, runBulk, undoBulk, verbsFor,
  type BulkParams, type BulkReceipt, type BulkVerb,
} from './bulk-intents.ts';

const ROUTES: { route: ClarifyRoute; label: string; hint: string }[] = [
  { route: 'do-now', label: 'Do now', hint: 'this one is for today' },
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

export interface SortUI { refresh(): void }

export function mountSort(
  session: Session, now: () => number, onChange: () => void,
  openDetail: (n: NodeState) => void,
): SortUI {
  const q = <T extends HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);
  const dlg = q<HTMLDialogElement>('#sort');
  const openBtn = q<HTMLButtonElement>('#sort-open');
  const picker = q('#sort-picker');
  const choices = q('#sort-choices');
  const queryInput = q<HTMLInputElement>('#sort-query');
  const queryGo = q<HTMLButtonElement>('#sort-query-go');
  const cardRegion = q('#sort-card-region');
  const entry = q('#sort-entry');
  const card = q<HTMLButtonElement>('#sort-card');
  const where = q('#sort-where');
  const actions = q('#sort-actions');
  const undoBar = q('#sort-undo');
  const live = q('#sort-live');
  if (!dlg || !openBtn || !picker || !choices || !queryInput || !queryGo
    || !cardRegion || !entry || !card || !where || !actions || !undoBar || !live) {
    return { refresh() {} };
  }
  const DLG = dlg, PICKER = picker, CHOICES = choices, CARDR = cardRegion,
    ENTRY = entry, CARD = card, WHERE = where, ACTIONS = actions, UNDO = undoBar, LIVE = live;

  /** The active range's item-getter, re-run against FRESH state per card — the
   *  range recomputes live, so a thing routed elsewhere leaves it on its own. */
  let activeItems: (() => NodeState[]) | null = null;
  /** The whole active choice — the bulk block needs its words and family. */
  let activeChoice: RangeChoice | null = null;
  /** Ids passed over with "Leave it" THIS SITTING. Memory only, never written:
   *  a skip that survived the dialog closing would be a record of a decision
   *  the app promised not to keep. */
  let skipped = new Set<string>();
  /** Ids ACTED ON this sitting. A routed item can legitimately still satisfy a
   *  text range (routing does not change its title), and a conveyor that
   *  re-offers what you just decided is a conveyor that stalls — so an act
   *  moves past it for the rest of the sitting. Undo takes it back OUT of this
   *  set, which is what brings the card back. Memory only, like `skipped`. */
  let handled = new Set<string>();
  let showing: NodeState | null = null;
  let busy = false;

  const nowIso = (): string => new Date(now()).toISOString();

  const say = (msg: string): void => { LIVE.textContent = msg; };

  /** The next card from the live range: first item not skipped this sitting;
   *  when only skipped ones remain, they come round again. */
  const nextItem = (): NodeState | null => {
    if (!activeItems) return null;
    const items = activeItems();
    const fresh = items.find(n => !skipped.has(n.id) && !handled.has(n.id));
    if (fresh) return fresh;
    // Everything left this sitting has been left once: start the round again
    // rather than wedging on the head item for ever while announcing success
    // (audit). Clearing the lap is what makes "Leave it" always advance.
    const rest = items.filter(n => !handled.has(n.id));
    if (rest.length > 0) { skipped = new Set(); return rest[0]!; }
    return null;
  };

  const showPicker = (): void => {
    activeItems = null;
    activeChoice = null;
    showing = null;
    PICKER.hidden = false;
    CARDR.hidden = true;
    UNDO.replaceChildren();
    closeBulk();
    const list = rangeChoices(() => session.state(), nowIso);
    CHOICES.replaceChildren(...list.map(c => {
      const li = el('li');
      const b = el('button', 'sort-choice');
      b.type = 'button';
      b.append(el('span', 'sort-choice-words', c.words));
      b.append(el('span', 'sort-choice-count',
        c.count === 1 ? '1 thing' : `${c.count} things`));
      b.addEventListener('click', () => enterRange(c));
      li.append(b);
      return li;
    }));
    if (list.length === 0) {
      const li = el('li', 'sort-choice-none',
        'Nothing here needs wholesale sorting right now.');
      CHOICES.append(li);
    }
  };

  const enterRange = (c: RangeChoice): void => {
    activeItems = c.items;
    activeChoice = c;
    skipped = new Set();
    handled = new Set();
    PICKER.hidden = true;
    CARDR.hidden = false;
    closeBulk();
    // The true total, stated ONCE at entry as a checkable fact. This is the
    // only number sorting ever shows.
    ENTRY.textContent = c.family === 'menu'
      ? `${c.words} — ${c.count === 1 ? 'one thing' : `${c.count} things`}.`
      : `${c.words} — ${c.count === 1 ? 'one thing' : `${c.count} things`}, oldest first.`;
    renderCard();
    // A Menu range has no conveyor — the six routes are illegal on wishes
    // (Menu-plus-clock is the state the gate's belt refuses), so wholesale IS
    // the surface for it and the block opens ready.
    if (c.family === 'menu') openBulk();
  };

  /** After an action removes the control it was on, focus lands somewhere real
   *  (WCAG 2.4.3) — the entry line mid-range, the back button once it is done.
   *  The daily surface has done this since Phase 2; this one shipped without it
   *  (audit), in the mode built for a thousand consecutive actions. */
  const restoreFocus = (): void => {
    if (!DLG.open) return;
    if (CARD.disabled) q<HTMLButtonElement>('#sort-back')?.focus();
    else ENTRY.focus();
  };

  function renderCard(): void {
    // A Menu range shows no card: wishes take no routes, and offering a
    // control the gate must refuse is the recorded anti-pattern (ADR-0038).
    if (activeChoice?.family === 'menu') {
      showing = null;
      CARD.hidden = true;
      WHERE.textContent = '';
      ACTIONS.replaceChildren();
      return;
    }
    CARD.hidden = false;
    const n = nextItem();
    showing = n;
    if (!n) {
      CARD.textContent = 'That is all of them.';
      CARD.disabled = true;
      WHERE.textContent = '';
      ACTIONS.replaceChildren();
      // Say it: the visual card changing is invisible to a screen reader, and
      // finishing a range deserves words, not silence (audit).
      say('That is all of them.');
      return;
    }
    CARD.disabled = false;
    CARD.textContent = n.title || '(untitled)';
    WHERE.textContent = heldStatus(n, nowIso(), session.zone);
    ACTIONS.replaceChildren(
      ...ROUTES.map(({ route, label, hint }) => {
        const b = el('button', 'route');
        b.type = 'button';
        b.append(el('span', 'route-label', label), el('span', 'route-hint', hint));
        b.addEventListener('click', () => { void act(n, route, label); });
        return b;
      }),
      (() => {
        const b = el('button', 'route');
        b.type = 'button';
        b.append(el('span', 'route-label', 'Leave it'),
          el('span', 'route-hint', 'skip for now — writes nothing'));
        b.addEventListener('click', () => {
          skipped.add(n.id);
          renderCard();
          // Honest words: with one thing left, "left it" and showing it again
          // in the same breath would be the app contradicting itself.
          say(showing && showing.id === n.id
            ? 'Left where it is — and it is the only one left this sitting.'
            : 'Left where it is.');
          restoreFocus();
        });
        return b;
      })(),
    );
  }

  const act = async (n: NodeState, route: ClarifyRoute, label: string): Promise<void> => {
    if (busy) return;
    // THE FRESH CHECK (audit, CRITICAL): the card's closure was captured at
    // render time, and the world may have moved — the sheet is reachable from
    // here, so the very item on screen can have been completed or sent to the
    // Menu between paint and tap. Routing the stale copy writes decisions the
    // user just contradicted, permanently. Refuse in words and repaint instead.
    const fresh = session.state().nodes.get(n.id);
    if (!fresh || !sortable(fresh)) {
      say('That one changed while it was on screen — here is the fresh view.');
      renderCard();
      return;
    }
    busy = true;
    UNDO.replaceChildren();
    const fromKind = fresh.kind;
    try {
      await session.commit(ctx => routeEvents(ctx, n.id, route, fromKind, demandClocksOf(fresh)));
      handled.add(n.id);
      say(`Sent to ${label}.`);
      showUndo(n.id, route, fromKind, label);
    } catch (err) {
      say(`Couldn’t do that — ${(err as Error).message}`);
    } finally {
      busy = false;
    }
    try { onChange(); } catch { /* a render bug must not contradict a landed write */ }
    renderCard();
    restoreFocus();
  };

  /** The same last-action undo the daily surface has: names where it went, one
   *  tap brings it back (`clarify.reopened`; the gate re-cures coverage). */
  const showUndo = (node: string, route: ClarifyRoute, fromKind: NodeKind, label: string): void => {
    const bar = el('p', 'triage-undo-bar');
    bar.append(el('span', 'triage-undo-where', `Sent to ${label}.`));
    const btn = el('button', 'linklike triage-undo-btn', 'Undo');
    btn.type = 'button';
    btn.addEventListener('click', () => {
      btn.disabled = true;
      void session.commit(ctx => undoRouteEvents(ctx, node, route, fromKind))
        .then(() => {
          handled.delete(node);
          UNDO.replaceChildren();
          say('Taken back — it is in the range again.');
          try { onChange(); } catch { /* renders next pass */ }
          renderCard();
          restoreFocus();
        })
        .catch((err: Error) => { btn.disabled = false; say(`Couldn’t undo — ${err.message}`); });
    });
    bar.append(btn);
    UNDO.replaceChildren(bar);
  };

  CARD.addEventListener('click', () => {
    if (!showing) return;
    const fresh = session.state().nodes.get(showing.id);
    if (fresh) openDetail(fresh);
  });

  // --- wholesale acts (1.5.0, ADR-0049) -------------------------------------
  // The preview IS the dry run: its sentence is counted from the real plan,
  // and the batch is exactly the events the single acts write, chunked, a
  // receipt first in every chunk. Verb legality is computed per range family
  // and per item — never offer what the gate must refuse (ADR-0038). Only
  // "Let them go" takes a typed word, and a copy of everything is delivered
  // BEFORE the destructive commit (the migration precedent), which the smoke
  // walk machine-checks for the first time.
  const BULK_VERBS: Record<BulkVerb, { label: string; hint: string }> = {
    'put-under': { label: 'Put them under…', hint: 'file every one into a place' },
    'to-menu': { label: 'To the Menu…', hint: 'wishes, not demands — any dates come off' },
    'park': { label: 'Park until…', hint: 'held away on purpose, back on the day' },
    'let-go': { label: 'Let them go', hint: 'a copy is saved first; the trash can give them back' },
    'bring-back': { label: 'Bring them back as real work', hint: 'each gets a clock so it returns' },
  };
  const BULK_CONFIRM = 'let go';

  const actAll = q<HTMLButtonElement>('#sort-act-all');
  const BULK = q<HTMLElement>('#sort-bulk');
  const BVERBS = q<HTMLElement>('#sort-bulk-verbs');
  const BUNDER = q<HTMLElement>('#sort-bulk-under');
  const BPFILTER = q<HTMLInputElement>('#sort-bulk-parent-filter');
  const BPARENT = q<HTMLSelectElement>('#sort-bulk-parent');
  const BMENUCAT = q<HTMLElement>('#sort-bulk-menucat');
  const BCATEGORY = q<HTMLSelectElement>('#sort-bulk-category');
  const BDAY = q<HTMLElement>('#sort-bulk-day');
  const BDATE = q<HTMLInputElement>('#sort-bulk-date');
  const BPREVIEW = q<HTMLElement>('#sort-bulk-preview');
  const BCONFIRM = q<HTMLElement>('#sort-bulk-confirm');
  const BWORD = q<HTMLInputElement>('#sort-bulk-word');
  const BGO = q<HTMLButtonElement>('#sort-bulk-go');
  const BCANCEL = q<HTMLButtonElement>('#sort-bulk-cancel');
  const BSTATUS = q<HTMLElement>('#sort-bulk-status');
  const BRECEIPT = q<HTMLElement>('#sort-bulk-receipt');
  const BOUTCOME = q<HTMLElement>('#sort-bulk-outcome');
  const BUNDOBTN = q<HTMLButtonElement>('#sort-bulk-undo');

  let bulkVerb: BulkVerb | null = null;
  let lastReceipt: BulkReceipt | null = null;

  function closeBulk(): void {
    if (!BULK) return;
    BULK.hidden = true;
    actAll?.setAttribute('aria-expanded', 'false');
    bulkVerb = null;
    lastReceipt = null;
    if (BSTATUS) BSTATUS.textContent = '';
    if (BRECEIPT) BRECEIPT.hidden = true;
    if (BWORD) BWORD.value = '';
  }

  function openBulk(): void {
    if (!BULK || !activeChoice) return;
    BULK.hidden = false;
    actAll?.setAttribute('aria-expanded', 'true');
    bulkVerb = null;
    lastReceipt = null;
    if (BSTATUS) BSTATUS.textContent = '';
    if (BRECEIPT) BRECEIPT.hidden = true;
    if (BWORD) BWORD.value = '';
    paintBulkVerbs();
    paintBulkParams();
    paintBulkPreview();
  }

  function paintBulkVerbs(): void {
    if (!BVERBS || !activeChoice) return;
    BVERBS.replaceChildren(...verbsFor(activeChoice.family).map(v => {
      const b = el('button', 'route');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(bulkVerb === v));
      b.append(el('span', 'route-label', BULK_VERBS[v].label),
        el('span', 'route-hint', BULK_VERBS[v].hint));
      b.addEventListener('click', () => {
        bulkVerb = v;
        if (BWORD) BWORD.value = '';
        paintBulkVerbs();
        paintBulkParams();
        paintBulkPreview();
      });
      return b;
    }));
  }

  /** The place picker for "Put them under…": every live container, lineage
   *  named, narrowed as you type — the 1.3.0 picker's manners. */
  function paintBulkParents(): void {
    if (!BPARENT) return;
    const st = session.state();
    const query = normalize(BPFILTER?.value ?? '');
    const lineage = (t: NodeState): string => {
      const p = t.parent ? st.nodes.get(t.parent) : undefined;
      const alive = p && !p.trashed && !p.mergedInto;
      return alive ? `${t.title || '(untitled)'} — in ${p.title || '(untitled)'}` : (t.title || '(untitled)');
    };
    const keep = BPARENT.value;
    const all = heldNodes(st).filter(isContainer)
      .sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    const shown = query ? all.filter(t => normalize(t.title || '').includes(query)) : all;
    BPARENT.replaceChildren(...[
      Object.assign(document.createElement('option'), {
        value: '',
        textContent: all.length === 0 ? 'nothing to put them under yet'
          : shown.length === 0 ? 'nothing matches that' : 'pick a place',
      }),
      ...shown.map(t => Object.assign(document.createElement('option'), {
        value: t.id, textContent: lineage(t),
      })),
    ]);
    if (shown.some(t => t.id === keep)) BPARENT.value = keep;
  }

  function paintBulkParams(): void {
    if (BUNDER) BUNDER.hidden = bulkVerb !== 'put-under';
    if (BMENUCAT) BMENUCAT.hidden = bulkVerb !== 'to-menu';
    if (BDAY) BDAY.hidden = bulkVerb !== 'park';
    if (BCONFIRM) BCONFIRM.hidden = bulkVerb !== 'let-go';
    if (bulkVerb === 'put-under') paintBulkParents();
  }

  const bulkParams = (): BulkParams => ({
    ...(BPARENT?.value ? { parent: BPARENT.value } : {}),
    ...(BCATEGORY?.value ? { category: BCATEGORY.value as MenuCategory } : {}),
    ...(BDATE?.value ? { dayKey: BDATE.value } : {}),
  });

  /** The sentence the user agrees to — stored verbatim in every receipt. */
  function paintBulkPreview(): void {
    if (!BPREVIEW || !BGO || !activeChoice || !activeItems) return;
    if (!bulkVerb) {
      BPREVIEW.textContent = 'Pick what should happen to every thing in this batch.';
      BGO.disabled = true;
      return;
    }
    const st = session.state();
    const params = bulkParams();
    const items = activeItems();
    const plan = planBulk(st, items, bulkVerb, params, '');
    const n = plan.eligibleNow;
    const things = n === 1 ? 'one thing' : `${n} things`;
    let words = '';
    let ready = n > 0;
    switch (bulkVerb) {
      case 'put-under': {
        const target = params.parent ? st.nodes.get(params.parent) : undefined;
        if (!target) { words = 'Pick the place first.'; ready = false; break; }
        words = `Put ${things} under “${target.title || '(untitled)'}”.`;
        break;
      }
      case 'to-menu':
        words = `Send ${things} to the Menu — ${params.category ?? 'read'}. Any due, start, or park dates come off as they land: a wish holds no demands.`;
        break;
      case 'park': {
        if (!params.dayKey) { words = 'Pick the day they come back.'; ready = false; break; }
        words = `Park ${things} until ${params.dayKey} — held away on purpose, back on the day.`;
        break;
      }
      case 'let-go':
        words = `Let ${things} go. A copy of everything is saved first, and “Things you let go” can give any of them back.`;
        break;
      case 'bring-back':
        words = `Bring ${things} back from the Menu as real work — each gets a clock so it returns to you.`;
        break;
    }
    if (plan.ineligibleNow > 0) {
      words += ` ${plan.ineligibleNow === 1 ? 'One is' : `${plan.ineligibleNow} are`} not able to take this (already there, or it would put a thing inside itself) — left alone, and counted.`;
    }
    BPREVIEW.textContent = words;
    if (bulkVerb === 'let-go') {
      ready = ready && (BWORD?.value ?? '').trim().toLowerCase() === BULK_CONFIRM;
    }
    BGO.disabled = !ready || busy;
  }

  function paintBulkReceipt(r: BulkReceipt, undoable: boolean): void {
    if (!BRECEIPT || !BOUTCOME || !BUNDOBTN) return;
    const did = r.done === 1 ? 'one thing' : `${r.done} things`;
    let words: string;
    if (r.failed) {
      words = `Stopped part-way — ${r.failed} ${r.done > 0 ? `The first ${did} landed and the record shows exactly which.` : 'Nothing landed.'}`;
    } else {
      words = {
        'put-under': `Filed ${did}.`,
        'to-menu': `Sent ${did} to the Menu. Dates shed on the way do not come back with an undo — bring a thing back as real work to date it again.`,
        'park': `Parked ${did}.`,
        'let-go': `Let ${did} go. “Things you let go”, behind the ⓘ, can give any of them back.`,
        'bring-back': `Brought ${did} back as real work.`,
      }[r.verb];
      if (r.skipped > 0) {
        words += ` ${r.skipped === 1 ? 'One was' : `${r.skipped} were`} skipped — the world moved while this ran, and a stale write is worse than a smaller count.`;
      }
    }
    BOUTCOME.textContent = words;
    BUNDOBTN.hidden = !undoable || r.done === 0;
    BRECEIPT.hidden = false;
  }

  async function runBulkNow(): Promise<void> {
    if (busy || !bulkVerb || !activeChoice || !activeItems || !BGO) return;
    const st = session.state();
    const params = bulkParams();
    const preview = BPREVIEW?.textContent ?? '';
    const plan = planBulk(st, activeItems(), bulkVerb, params,
      `${preview} (${activeChoice.words})`);
    if (plan.itemIds.length === 0) return;
    busy = true;
    BGO.disabled = true;
    UNDO.replaceChildren();
    try {
      if (bulkVerb === 'let-go') {
        // The copy FIRST, delivered before anything is trashed — and if the
        // copy cannot be delivered, nothing is: a promise kept or no act.
        if (BSTATUS) BSTATUS.textContent = 'Saving a copy of everything first…';
        await deliverCopy(session, 'before-letting-go', 'json');
      }
      if (BSTATUS) BSTATUS.textContent = 'Working…';
      const receipt = await runBulk(session, plan, done => {
        if (BSTATUS) BSTATUS.textContent = `Working — ${done} written so far.`;
      });
      lastReceipt = receipt;
      if (BSTATUS) BSTATUS.textContent = '';
      paintBulkReceipt(receipt, true);
      say(BOUTCOME?.textContent ?? 'Done.');
    } catch (err) {
      if (BSTATUS) BSTATUS.textContent = `Couldn’t do that — ${(err as Error).message} Nothing was let go.`;
    } finally {
      busy = false;
    }
    try { onChange(); } catch { /* a render bug must not contradict landed writes */ }
    renderCard();
    paintBulkPreview();
  }

  actAll?.addEventListener('click', () => {
    if (!BULK) return;
    if (BULK.hidden) openBulk(); else closeBulk();
  });
  BCANCEL?.addEventListener('click', () => {
    closeBulk();
    restoreFocus();
  });
  BGO?.addEventListener('click', () => { void runBulkNow(); });
  BUNDOBTN?.addEventListener('click', () => {
    if (busy || !lastReceipt || !BUNDOBTN) return;
    busy = true;
    BUNDOBTN.disabled = true;
    void undoBulk(session, lastReceipt, done => {
      if (BSTATUS) BSTATUS.textContent = `Taking it back — ${done} so far.`;
    }).then(r => {
      if (BSTATUS) BSTATUS.textContent = '';
      if (BOUTCOME) {
        BOUTCOME.textContent = r.failed
          ? `The undo stopped part-way — ${r.failed}`
          : `Taken back — ${r.done === 1 ? 'one thing' : `${r.done} things`} restored.${r.skipped > 0 ? ` ${r.skipped} had moved on and were left as they are.` : ''}`;
      }
      say(BOUTCOME?.textContent ?? 'Taken back.');
      lastReceipt = null;
    }).finally(() => {
      busy = false;
      if (BUNDOBTN) { BUNDOBTN.disabled = false; BUNDOBTN.hidden = true; }
      try { onChange(); } catch { /* renders next pass */ }
      renderCard();
      paintBulkPreview();
    });
  });
  q<HTMLButtonElement>('#sort-bulk-export')?.addEventListener('click', () => {
    if (busy || !activeChoice || !activeItems) return;
    const items = activeItems();
    if (items.length === 0) { say('Nothing here to copy.'); return; }
    const scope = `${activeChoice.words} — ${items.length === 1 ? 'one thing' : `${items.length} things`}`;
    busy = true;
    void deliverRangeCopy(session, new Set(items.map(n => n.id)), scope)
      .then(() => say('A reading copy is on its way to your files — these things and their history. It is not a backup.'))
      .catch((err: Error) => say(`The copy failed — nothing left your device. (${err.message})`))
      .finally(() => { busy = false; });
  });
  BPFILTER?.addEventListener('input', () => { paintBulkParents(); paintBulkPreview(); });
  BPARENT?.addEventListener('change', paintBulkPreview);
  BCATEGORY?.addEventListener('change', paintBulkPreview);
  BDATE?.addEventListener('input', paintBulkPreview);
  BWORD?.addEventListener('input', paintBulkPreview);

  // Enter submits — the box says enterkeyhint="search" and a hint that lies is
  // worse than none (audit; the rename box learned this first).
  queryInput.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') { e.preventDefault(); queryGo.click(); }
  });
  queryGo.addEventListener('click', () => {
    const words = queryInput.value.trim();
    if (!words) { say('Type a word or two first.'); return; }
    const items = matchingQuery(session.state(), words);
    if (items.length === 0) { say('Nothing you are holding matches that.'); return; }
    enterRange({
      key: 'matching',
      words: `Things matching “${words}”`,
      count: items.length,
      items: () => matchingQuery(session.state(), words),
      family: 'runway',
    });
  });

  openBtn.addEventListener('click', () => {
    showPicker();
    LIVE.textContent = '';
    queryInput.value = '';
    if (!DLG.open) DLG.showModal();
  });
  q<HTMLButtonElement>('#sort-close')?.addEventListener('click', () => DLG.close());
  q<HTMLButtonElement>('#sort-back')?.addEventListener('click', showPicker);

  return {
    refresh(): void {
      // Re-render the current card against fresh state while open — a write
      // from another surface (the detail sheet is reachable from here) must be
      // reflected the moment it lands. The bulk preview re-counts too, except
      // mid-run: its own chunks fire this, and the receipt owns those words.
      if (DLG.open && activeItems) {
        renderCard();
        if (BULK && !BULK.hidden && !busy) paintBulkPreview();
      }
    },
  };
}
