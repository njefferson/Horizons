// Work mode: Next up, Upkeep chips, and the tappable coverage gauge
// (build-plan items 18–21). The first point the app is worth opening in the
// morning.
//
// One thing is offered. "Done" records it; "Not this" moves on and RECORDS
// NOTHING — no event, no penalty, no memory. Declining is not data. If it were,
// the surface would be keeping score, and a person who has to justify a skip
// stops opening the app.
//
// Everything a person reads here is set with textContent, states its reason in
// words (nothing depends on seeing a colour, B-01), and every control is a real
// <button> at full target size. Focus is moved deliberately after an action,
// because acting removes the control that was acted on.

import type { Session } from './session.ts';
import type { AppEvent } from '../events.ts';
import type { NodeState } from '../fold.ts';
import { heldWork } from '../gate.ts';
import { workSurface, type NextUpItem } from '../nextup.ts';
import { offerNow, offerWords } from '../offer.ts';
import { loadWords } from '../load.ts';
import { MENU_WORDS } from '../menu.ts';
import type { MenuCategory } from '../events.ts';
import { undatedCount } from '../held.ts';
import { pressureWords } from '../pressure.ts';
import { calendarDaysBetween } from '../time.ts';
import { biteEvents } from './work-intents.ts';
import { ulid } from '../ids.ts';
import { treeRows } from '../tree-view.ts';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/** Marking a thing done. Gated — completing a one-off can orphan its parent, so
 *  the gate may attach a cure, and it is the gate's business either way. */
export const doneEvents = (
  ctx: { id: () => string; vault: string; at: string; device: string; seq: () => number },
  node: string,
): AppEvent[] => [{
  id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
  kind: 'done.marked', node, payload: { at: ctx.at },
} as AppEvent];

export interface WorkUI { refresh(): void }

export function mountWork(
  session: Session, now: () => number, onChange: () => void,
  /** Opens the detail sheet (1.6.0 — the dead lists became doors). Optional,
   *  like clarify's: rows render regardless, doors need the sheet. */
  openDetail?: (n: NodeState) => void,
  /** Opens the load entry with this item attached (1.24.0). Optional and
   *  late-bound, because the load surface mounts after this one — the offer
   *  renders either way, and a missing load entry costs one control. */
  attachLoad?: (nodeId: string, title: string) => void,
): WorkUI {
  const q = <T extends HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);
  const region = q('#nextup');
  const heading = q('#nextup-heading');
  const title = q('#nextup-title');
  const why = q('#nextup-why');
  const doneBtn = q<HTMLButtonElement>('#nextup-done');
  const skipBtn = q<HTMLButtonElement>('#nextup-skip');
  const count = q('#nextup-count');
  const behind = q('#nextup-behind');
  const live = q('#nextup-live');
  const upkeepRegion = q('#upkeep');
  const chips = q('#upkeep-chips');
  const gauge = q<HTMLButtonElement>('#gauge');
  const coverage = q('#coverage');
  // Optional, like every other handle here: a missing element costs the panel
  // nothing rather than taking the surface down.
  const coverageCount = q('#coverage-count');
  if (!region || !heading || !title || !why || !doneBtn || !skipBtn || !count ||
      !behind || !live || !upkeepRegion || !chips || !gauge || !coverage) {
    return { refresh() {} };
  }
  const REGION = region, HEADING = heading, TITLE = title, WHY = why, COUNT = count,
    BEHIND = behind, LIVE = live, UPKEEP = upkeepRegion, CHIPS = chips,
    GAUGE = gauge, COVERAGE = coverage;
  // Soft, like LOADNOTE below: a missing place line costs one line of lineage,
  // never the work surface.
  const PLACE = q('#nextup-place');
  const APPROACH = q('#nextup-approach');
  const SITUATION = q('#nextup-situation');
  // NOT in the hard guard above, deliberately: a missing load note costs one
  // sentence, and taking Next up down with it would cost the app's whole
  // purpose. Same containment every optional element on this surface gets.
  const LOADNOTE = document.querySelector<HTMLElement>('#nextup-load');
  // The two things you can do when you cannot start (1.24.0). Soft-bound like
  // LOADNOTE and PLACE: a missing control costs that control, never the offer.
  const BITE = q('#nextup-bite');
  const BITE_FORM = q<HTMLFormElement>('#nextup-bite-form');
  const BITE_INPUT = q<HTMLInputElement>('#nextup-bite-input');
  const BITE_DONE = q<HTMLButtonElement>('#nextup-bite-done');
  const HEAVY = q<HTMLButtonElement>('#nextup-heavy');

  // "Not this" lives HERE, in memory, and nowhere else. It is deliberately not
  // persisted: a skip that survived a reload would be a record of a decision the
  // app promised not to keep.
  let cycle = 0;
  let current: NextUpItem | null = null;
  /** The first step named under the head, if there is one. Read from state on
   *  every render — never remembered across one, because the head can change
   *  under it and a bite belonging to yesterday's card is the worst thing this
   *  surface could show. */
  let bite: NodeState | null = null;
  // One write at a time. Without this a double-tap wrote done.marked twice for
  // the same node — the log recording an action the user took once, twice.
  // Capture solves the same double-tap by clearing its input synchronously
  // (app.ts); this surface has no input to clear, so it holds a flag.
  let busy = false;
  /** Ids declined this session. In memory only — nothing about a skip is ever
   *  written down, which is the whole point (ADR-0030). */
  const declined = new Set<string>();

  // Failures must be VISIBLE, not only announced. #nextup-live is
  // visually-hidden, so a sighted user tapped Done, saw nothing change, and had
  // no way to learn the write failed — while capture puts the identical failure
  // in the visible #status. Say it in both places.
  const say = (msg: string, alsoVisible = false): void => {
    LIVE.textContent = msg;
    if (alsoVisible) {
      const status = document.querySelector<HTMLElement>('#status');
      if (status) status.textContent = msg;
    }
  };

  const nowIso = (): string => new Date(now()).toISOString();

  /** Put focus somewhere real after an action removes the control it was on. The
   *  region hides precisely BECAUSE the last item was completed, so the guard has
   *  to have an else — without one, finishing the last thing stranded focus on
   *  <body> (WCAG 2.4.3). clarify.ts already did this correctly; this file did
   *  not copy it across, and neither did the a11y gate. */
  const restoreFocus = (): void => {
    if (!REGION.hidden) HEADING.focus();
    else document.querySelector<HTMLElement>('#capture')?.focus();
  };

  /**
   * The first step under the head, if one has been named (1.24.0).
   *
   * READ FROM STATE EVERY RENDER, never remembered. The head changes on a skip,
   * a completion, a clock arriving — and a bite left over from the previous
   * card would be this surface telling somebody the first step of a thing they
   * are no longer looking at.
   *
   * The FIRST live, unfinished child, not a list. If somebody names two, the
   * card shows the one they named first and the rest are in the sheet: a card
   * that grows a list of sub-steps has become the pile in miniature, on the one
   * surface whose promise is that it has already chosen.
   */
  const paintBite = (head: NodeState | null): void => {
    bite = null;
    if (head) {
      const st = session.state();
      for (const n of st.nodes.values()) {
        if (n.parent !== head.id) continue;
        if (n.trashed || n.mergedInto || n.lastDone) continue;
        bite = n;
        break;
      }
    }
    if (BITE) {
      BITE.textContent = bite ? `First step: ${bite.title || '(untitled)'}` : '';
      BITE.hidden = !bite;
    }
    if (BITE_DONE) BITE_DONE.hidden = !bite;
    // The form goes away once there is a step, and comes back when it is done.
    // Two open invitations to name a first step is a second decision on a
    // surface built to hold one.
    if (BITE_FORM) BITE_FORM.hidden = Boolean(bite) || head === null;
    if (HEAVY) HEAVY.hidden = head === null;
  };

  const markBiteDone = async (): Promise<void> => {
    if (!bite || busy) return;
    busy = true;
    const node = bite.id;
    const label = bite.title;
    try {
      await session.commit(ctx => doneEvents(ctx, node));
      say(`Done: ${label}.`);
    } catch (err) {
      say(`Couldn’t record that — ${(err as Error).message}`, true);
    } finally {
      busy = false;
    }
    try { onChange(); refresh(); } catch { /* the next load renders it */ }
    restoreFocus();
  };

  const markDone = async (): Promise<void> => {
    if (!current || busy) return;
    busy = true;
    const node = current.node.id;
    const label = current.node.title;
    try {
      await session.commit(ctx => doneEvents(ctx, node));
      say(`Done: ${label}.`);
    } catch (err) {
      say(`Couldn’t record that — ${(err as Error).message}`, true);
    } finally {
      busy = false;
    }
    // A render bug must not contradict a landed write (the lesson app.ts records).
    try { onChange(); refresh(); } catch { /* the next load renders it */ }
    restoreFocus();
  };

  const skip = (): void => {
    // Remember WHICH items were declined, not how many times. A numeric index
    // over a changing queue threw the user back to the top the moment anything
    // completed, and handed them the item they declined first.
    if (current) declined.add(current.node.id);
    cycle += 1;
    refresh();
    say(current ? `Showing ${current.node.title} instead.` : 'Nothing else is asking.');
    restoreFocus();
  };

  doneBtn.addEventListener('click', () => void markDone());
  BITE_DONE?.addEventListener('click', () => void markBiteDone());
  skipBtn.addEventListener('click', skip);

  // NAME A FIRST STEP (1.24.0, docs/nd-collisions.md entry 1). The whole act is
  // one field and a submit, on the card, because the moment this helps is the
  // moment leaving the surface to do it is more than somebody can spend.
  BITE_FORM?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!current || busy || !BITE_INPUT) return;
    const text = BITE_INPUT.value;
    // Said out loud rather than committing nothing quietly — capture's rule.
    if (!text.trim()) { say('It needs to say something.', true); BITE_INPUT.focus(); return; }
    busy = true;
    const parent = current.node.id;
    void session.commit(ctx => biteEvents(ctx, ulid(Date.parse(ctx.at)), parent, text))
      .then(() => {
        // Cleared only after the write has LANDED (ADR-0008), like capture: an
        // input that empties before the commit resolves can lose what you typed.
        BITE_INPUT.value = '';
        say('Put under it. It takes no date of its own.');
      })
      .catch((err: Error) => { say(`Couldn’t do that — ${err.message}`, true); })
      .finally(() => {
        busy = false;
        try { onChange(); refresh(); } catch { /* the next load renders it */ }
      });
  });

  // SAY IT IS HEAVY (entry 2). Not a second form — it opens the one under the
  // capture line with this item attached, so the weight is recorded exactly as
  // it always has been and finally says what it is about.
  HEAVY?.addEventListener('click', () => {
    if (!current || !attachLoad) return;
    attachLoad(current.node.id, current.node.title || '(untitled)');
  });

  GAUGE.addEventListener('click', () => {
    const open = COVERAGE.hidden;
    COVERAGE.hidden = !open;
    if (coverageCount) coverageCount.hidden = !open;
    GAUGE.setAttribute('aria-expanded', String(open));
    // Built at the moment of opening, not before — see buildCoverage.
    if (open) buildCoverage();
  });

  /** Plain words for when something returns — calendar days in the reader's
   *  zone, never a countdown and never a rebuke. */
  const returns = (iso: string): string => {
    const d = calendarDaysBetween(nowIso(), iso, session.zone);
    if (d < 0) return 'ready now';
    if (d === 0) return 'today';
    if (d === 1) return 'tomorrow';
    if (d < 7) return `in ${d} days`;
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: session.zone });
  };

  function refresh(): void {
    const state = session.state();
    const iso = nowIso();
    // workSurface removes the chip items from Next-up, so a ready upkeep is not
    // rendered twice on one screen with two Done buttons writing to one node.
    const { up: all, chips: ups } = workSurface(state, iso, session.zone, 0);
    // THE MENU SHAPE (1.11.0, ADR-0060). What is offered is a small set chosen
    // to be UNALIKE — at most one item per reason, plus one thing off the Menu
    // that owes nothing. `offerNow` owns that rule; this file only renders it.
    const offer = offerNow(state, iso, session.zone, cycle);
    // Prefer something not yet declined this session; if everything has been,
    // start again from the top rather than showing nothing.
    const fresh = offer.work.filter(i => !declined.has(i.node.id));
    const head = fresh[0] ?? offer.work[0] ?? all.head;
    const behind = (fresh.length > 1 ? fresh.slice(1) : offer.work.slice(1))
      .filter(i => i.node.id !== head?.node.id);
    const up = { head, behind, total: all.total };
    current = up.head;

    if (up.head) {
      REGION.hidden = false;
      // Restored explicitly: they are hidden in the no-head branch below, and a
      // control that disappears once and never returns is the worst of both.
      if (doneBtn) doneBtn.hidden = false;
      if (skipBtn) skipBtn.hidden = false;
      TITLE.textContent = up.head.node.title || '(untitled)';
      // Why this, in words. Pressure adds its own gentle phrase; neither ever
      // reaches for the shame word this app refuses — no such state exists here,
      // and the vocabulary that replaces it is in pressure.ts (ADR-0010).
      const p = up.head.pressure;
      const extra = up.head.reason === 'pressure' ? pressureWords(p) : up.head.words;
      WHY.textContent = extra;
      // WHERE, right under why (V2 stage 1). Silence for a loose item — "in
      // nothing" is not a location, and announcing bareness would make the flat
      // majority of a fresh store read as incomplete.
      if (PLACE) {
        PLACE.textContent = up.head.place ?? '';
        PLACE.hidden = !up.head.place;
      }
      // WHAT IT HOLDS UP, under where it sits (1.23.0). The head only: the
      // behind-rows already carry a why and a place, and a third line on each
      // turns the rest-of-offer from a glance into a paragraph — which is the
      // bounded-surface instinct law 8 applies to lists, applied to a card.
      //
      // Silent when null, the same rule PLACE follows, and null is the ORDINARY
      // case: it needs a declared downstream and a lead estimate, both set on
      // the detail sheet. An item with neither says nothing rather than being
      // given a schedule it never had.
      if (APPROACH) {
        APPROACH.textContent = up.head.approach ?? '';
        APPROACH.hidden = !up.head.approach;
      }
      // THE SITUATION, VERBATIM AND UNQUALIFIED. Not "you said you would…",
      // which reads the plan back as a commitment and turns a cue into a
      // reminder that you have not done it — this audience's whole problem with
      // being reminded. Just the sentence, in the words it was written in.
      //
      // Silent when there is none, the same rule PLACE and APPROACH follow. A
      // situation is offered and never required, so absence is the ordinary
      // case and must cost nothing.
      if (SITUATION) {
        SITUATION.textContent = up.head.situation ?? '';
        SITUATION.hidden = !up.head.situation;
      }
      paintBite(up.head.node);
      // NO NUMBER (1.11.0). "8 things are asking" is a count of pending work on
      // the landing surface, which is the nearest thing this app has to the
      // backlog headline law 8 names outright — and the coverage gauge already
      // states the honest totals a few lines up this same page.
      COUNT.textContent = offerWords(offer);
      // The visible reason ADR-0014 asks for, in the co-occurrence form law 7
      // requires. Read from the SAME offer the rows were built from, so the
      // sentence and the set can never disagree.
      if (LOADNOTE) {
        const lw = loadWords(offer.load);
        LOADNOTE.textContent = lw;
        LOADNOTE.hidden = lw === '';
      }
      // Doors, not words-in-a-paragraph (1.6.0): each row opens its sheet, on
      // the FRESH node — a row built at refresh time can be clicked later. What
      // sits here is now the REST OF THE OFFER rather than a queue tail: one
      // more piece of work of a different kind, and one thing you wanted.
      const rows = up.behind.map(item => ({
        id: item.node.id,
        title: item.node.title || '(untitled)',
        why: item.reason === 'pressure' ? pressureWords(item.pressure) : item.words,
        place: item.place,
        wish: false,
      }));
      // The wish rides last and says what it is. It owes nothing (law 6), so it
      // never carries a reason, a date, or a word that could read as asking.
      if (offer.wish && offer.wish.id !== head?.node.id) {
        rows.push({
          id: offer.wish.id,
          title: offer.wish.title || '(untitled)',
          why: `something you wanted · ${MENU_WORDS[offer.wish.onMenu as MenuCategory] ?? 'on the Menu'}`,
          // The wish line already says everything a wish owes anyone (law 6);
          // a location would dress it as filed work.
          place: null as string | null,
          wish: true,
        });
      }
      BEHIND.replaceChildren(...rows.map(row => {
        const li = el('li', row.wish ? 'behind-item behind-wish' : 'behind-item');
        const b = el('button', 'behind-open');
        b.type = 'button';
        b.append(el('span', 'behind-title', row.title));
        b.append(el('span', 'behind-why', row.why));
        if (row.place) b.append(el('span', 'behind-why behind-place', row.place));
        if (openDetail) b.addEventListener('click', () => {
          const node = session.state().nodes.get(row.id);
          if (node) openDetail(node);
        });
        li.append(b);
        return li;
      }));
    } else {
      // NOTHING IS ASKING — and if things are being held without dates, say that
      // too rather than simply vanishing.
      //
      // "Nothing is asking" is true and, on its own, unhelpful: a real import of 1,429
      // undated things and this surface correctly had nothing to offer, which reads
      // as an empty app rather than as a full one waiting on a decision. The section
      // stays, says the real number, and the two action buttons go — there is
      // nothing to be done to, and a live button with no subject is worse than none.
      const undated = undatedCount(session.state(), nowIso(), session.zone);
      BEHIND.replaceChildren();
      if (doneBtn) doneBtn.hidden = undated > 0;
      if (skipBtn) skipBtn.hidden = undated > 0;
      if (undated > 0) {
        REGION.hidden = false;
        TITLE.textContent = 'Nothing is asking today.';
        if (PLACE) { PLACE.textContent = ''; PLACE.hidden = true; }
        // Cleared beside PLACE, for its reason: this branch reuses the same
        // elements with a different sentence, so a line left over from the last
        // head would attach a previous item's downstream to "Nothing is asking".
        if (APPROACH) { APPROACH.textContent = ''; APPROACH.hidden = true; }
        paintBite(null);
        WHY.textContent = undated === 1
          ? 'One thing is here without a date. It is waiting on you to decide, not the other way round.'
          : `${undated} things are here without a date. They are waiting on you to decide, not the other way round.`;
        COUNT.textContent = '';
        if (LOADNOTE) { LOADNOTE.textContent = ''; LOADNOTE.hidden = true; }
      } else {
        REGION.hidden = true;
        TITLE.textContent = '';
      }
    }

    // Upkeep chips (item 20) — already computed above, and already removed from
    // the Next-up queue.
    UPKEEP.hidden = ups.length === 0;
    CHIPS.replaceChildren(...ups.map(item => {
      const li = el('li');
      const b = el('button', 'chip');
      b.type = 'button';
      b.append(el('span', 'chip-title', item.node.title || '(untitled)'));
      b.append(el('span', 'chip-why', pressureWords(item.pressure)));
      if (item.place) b.append(el('span', 'chip-why chip-place', item.place));
      b.addEventListener('click', () => {
        const node = item.node.id;
        void session.commit(ctx => doneEvents(ctx, node))
          .then(() => { LIVE.textContent = `Done: ${item.node.title}.`; })
          .catch((err: Error) => { LIVE.textContent = `Couldn’t record that — ${err.message}`; })
          .finally(() => { onChange(); refresh(); });
      });
      li.append(b);
      return li;
    }));

    // The coverage list (item 21) — built ONLY while it is on screen. It renders
    // one row per held node, and it was being rebuilt hidden on every refresh:
    // at 1,429 held things that is ~4,300 DOM elements constructed and thrown
    // away per keystroke-adjacent repaint, for a list nobody was looking at
    // (audit, measured). The gauge's click handler builds it at the moment of
    // opening, and refresh keeps it live only while open.
    // THE CLAIM IS ALWAYS CURRENT, even while it is hidden. The rows are built
    // only on open — at 1,429 held things, rebuilding them hidden on every
    // repaint is ~4,300 DOM elements thrown away for a list nobody is looking
    // at (audit, measured) — but one string is free, and a count that only
    // refreshes on open is a count that can be STALE the moment it is read,
    // which is worse than absent. Same `heldWork` set the rows come from.
    paintCoverageCount();
    if (!COVERAGE.hidden) buildCoverage();
    // The tree obeys the same rule, for the same measured reason.
    if (treeList && !treeList.hidden) buildTree();
  }

  /** How many the claim holds, stated where the reader asked for it. The gauge
   *  itself no longer carries a total: an aggregate on the landing surface is a
   *  number that only rises, and this one answers a question just asked. */
  function paintCoverageCount(): void {
    if (!coverageCount) return;
    const n = heldWork(session.state()).length;
    coverageCount.textContent = n === 1
      ? 'One thing, and when it comes back:'
      : `${n} things, and when each comes back:`;
  }

  /** The gauge's claim, itemised and checkable. Reads `heldWork` — the same
   *  definition the gauge counts — so opening the claim can never contradict it.
   *
   *  It read `heldNodes` until 1.15.1, which is one word wider and was the wrong
   *  set: every private journal entry has no title by design, so each one
   *  itemised here as "(untitled) — held". */
  function buildCoverage(): void {
    const state = session.state();
    const held = [...heldWork(state)].sort((a, b) => (a.id < b.id ? 1 : -1));
    COVERAGE.replaceChildren(...held.map(n => {
      const li = el('li', 'coverage-item');
      // A door (1.6.0), still lazily built — the row count is why this list
      // builds on open, and a listener per row does not change that rule.
      const b = el('button', 'coverage-open');
      b.type = 'button';
      b.append(el('span', 'coverage-title', n.title || '(untitled)'));
      const clock = n.clocks.due ?? n.clocks.review ?? n.clocks.start ?? n.clocks.suspense ?? n.clocks.park;
      b.append(el('span', 'coverage-when',
        clock ? `returns ${returns(clock.at)}` : n.onMenu ? 'on the Menu' : 'held'));
      if (openDetail) b.addEventListener('click', () => {
        const fresh = session.state().nodes.get(n.id);
        if (fresh) openDetail(fresh);
      });
      li.append(b);
      return li;
    }));
  }

  // --- the alignment tree, on request (1.6.0, ADR-0013/item 39) -------------
  // Queried SEPARATELY from the guard list above: a missing tree control must
  // cost the tree, never Next-up (the no-op-on-missing-selector trap).
  const treeOpen = q<HTMLButtonElement>('#tree-open');
  const treeList = q('#tree');
  /** Branches revealed past the cap THIS SITTING — memory only, like every
   *  reveal; the cap returns with the next visit. */
  const treeRevealed = new Set<string>();
  function buildTree(): void {
    if (!treeList) return;
    const rows = treeRows(session.state(), treeRevealed);
    treeList.replaceChildren(...rows.map(entry => {
      const li = el('li', 'tree-item');
      li.style.setProperty('--tree-depth', String(entry.depth));
      if (entry.kind === 'more') {
        const b = el('button', 'tree-more');
        b.type = 'button';
        b.textContent = entry.hidden === 1
          ? `1 more under ${entry.parent.title || '(untitled)'}`
          : `${entry.hidden} more under ${entry.parent.title || '(untitled)'}`;
        b.addEventListener('click', () => { treeRevealed.add(entry.parent.id); buildTree(); });
        li.append(b);
        return li;
      }
      const b = el('button', 'tree-open-row');
      b.type = 'button';
      b.append(el('span', 'tree-title', entry.node.title || '(untitled)'));
      if (openDetail) b.addEventListener('click', () => {
        const fresh = session.state().nodes.get(entry.node.id);
        if (fresh) openDetail(fresh);
      });
      li.append(b);
      return li;
    }));
    if (rows.length === 0) {
      treeList.append(el('li', 'tree-empty',
        'Nothing has a place inside anything else yet — the tree appears as things are filed.'));
    }
  }
  treeOpen?.addEventListener('click', () => {
    if (!treeList) return;
    const open = treeList.hidden;
    treeList.hidden = !open;
    treeOpen.setAttribute('aria-expanded', String(open));
    // Built at the moment of opening, not before — the coverage list's rule.
    if (open) buildTree();
  });

  refresh();
  return { refresh };
}
