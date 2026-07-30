// Quietkeep — the shell and the Dump surface.
//
// Phase 1 item 8: zero chrome, one line per card, drafts persisted per
// keystroke. Capture comes before anything that displays it, because an app
// that captures and does nothing else is already useful and the reverse is not
// (build-plan §3).
//
// This file reads state and emits intents. It never touches the log — every
// write goes through `session.commit`, which goes through the gate.

import { openSession, captureEvent, type Session } from './session.ts';
import type { AppEvent } from '../events.ts';
import { coverageGauge } from '../gate.ts';
import type { NodeState } from '../fold.ts';
import { mountAbout } from './about.ts';
import { loadBadgePreference, paintBadge } from './badge.ts';
import { CURRENT } from './changelog.ts';
import { mountTriage } from './clarify.ts';
import { mountWork } from './work.ts';
import { mountDetail } from './detail.ts';
import { mountFocus, type FocusUI } from './focus.ts';
import { mountReentry } from './reentry.ts';
import { mountBother } from './bother.ts';
import { mountPrint } from './print.ts';
import { mountReplan } from './replan.ts';
import { doneEvents } from './work.ts';
import { heldGroups, heldStatus } from '../held.ts';
import { reviewExceptions, reviewWords } from '../review.ts';
import { waitingOnAnyone, withWhom, waitingWords, peopleWords } from '../people.ts';
import { trackPortfolio, trackWords, portfolioWords } from '../portfolio.ts';
import { menuGroups, menuCount, menuWords, saveForWords, MENU_WORDS } from '../menu.ts';
import { calendarDaysBetween, isValidIso } from '../time.ts';

const now = () => Date.now();

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing element: ${sel}`);
  return el;
};

/**
 * What you are holding, grouped (src/held.ts). Each item is a row with two real
 * controls: open it, or check it off. The card used to be one big button, which
 * is why it could not gain a second one — a button inside a button is invalid.
 */
/** How many rows one heading renders before it says how many it is holding back.
 *  Generous on purpose: an ordinary planner never meets it, and the number is
 *  stated when it does. */
export const LIST_CAP = 25;

/** Headings the reader has asked to see in full. Outside `render` so the choice
 *  survives the re-render that showing them causes. Cleared on reload, which is
 *  right — a thousand rows is not a state to restore somebody into. */
const revealed = new Set<string>();

/** Set once at boot so "show them" can ask for a fresh pass without `render`
 *  needing to know how the app rerenders. */
let rerenderAll: (() => void) | null = null;

function render(session: Session, openDetail?: (n: NodeState) => void, onDone?: (id: string) => void,
                onFocus?: (n: NodeState) => void): void {
  const list = $('#cards');
  const nowIso = new Date(now()).toISOString();
  const groups = heldGroups(session.state(), nowIso, session.zone);

  // A real heading and a real list per group. The first version made the heading
  // an <li> with role="presentation", which strips the listitem role and leaves a
  // <ul> containing a non-listitem — axe flagged it as a serious `list` violation,
  // and it is one: the grouping would have been invisible to a screen reader.
  const rows: HTMLElement[] = [];
  for (const group of groups) {
    const head = document.createElement('h3');
    head.className = 'group-head';
    // A heading, not a badge and not a count of things undone (law 5).
    head.textContent = group.title;
    rows.push(head);

    const ul = document.createElement('ul');
    ul.className = 'cards-group';
    ul.setAttribute('aria-label', group.title);
    rows.push(ul);

    // CAPPED, with the true total stated and a way to see the rest.
    //
    // The dedicated replan surface has capped at three since it existed, on the
    // reasoning that "a wall of them is the pile in a new costume". The held list
    // never had a cap at all, which nobody noticed while the fixtures held eight
    // things. Noah imported 1,429 and got a scroll of well over a thousand rows
    // under one heading — the pile, in the main list, which is the thing this app
    // exists to prevent.
    //
    // The cap is generous, so an ordinary planner never meets it, and the number
    // held back is stated rather than hidden. `revealed` is per-heading and lives
    // outside this function, so pressing "show the rest" survives the re-render it
    // triggers.
    const shown = revealed.has(group.key) ? group.items : group.items.slice(0, LIST_CAP);
    for (const node of shown) {
      const li = document.createElement('li');
      li.className = 'card';

      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'card-open';

      const title = document.createElement('span');
      title.className = 'card-title';
      // textContent, never innerHTML: captured text is stored as text and never
      // interpreted, which is what makes /capture?text= safe from a hostile link
      // (ADR-0008).
      // `|| '(untitled)'` like every other surface — the held list was the one
      // place a blank title rendered as an unlabelled, unidentifiable card.
      title.textContent = node.title || '(untitled)';

      const when = document.createElement('span');
      when.className = 'card-when';
      // Every item states its own status in words — the text channel of B-01, so
      // nothing here depends on seeing a colour. A finished thing says "done"
      // rather than reporting the cure clock it happens to still carry.
      when.textContent = heldStatus(node, nowIso, session.zone);

      open.append(title, when);
      if (openDetail) open.addEventListener('click', () => openDetail(node));
      li.append(open);

      // The actions live in ONE wrapper, so they wrap as a group. As bare siblings
      // they wrapped independently: on a long title "Done" landed alone on the next
      // line while "Work on this" stayed beside the title. Moving the card's border
      // onto `.card` is what fixes the mis-tap (a stray button used to sit above a
      // DIFFERENT item); grouping is what stops the pair splitting up.
      const actions = document.createElement('div');
      actions.className = 'card-actions';

      // "Work on this" — the way into a focus session, on the row rather than
      // buried in the sheet. Starting work is the commonest thing anyone does
      // here and it should not cost two taps and a dialog.
      //
      // Not offered for what is already done, what triage still owns, or what is
      // on the Menu — the same three exclusions as Done directly below, because
      // the question "should this be offered as work right now" has one answer
      // per item, not one per button.
      if (onFocus && !node.lastDone && !node.onMenu && !(node.captured && node.route === null)) {
        const go = document.createElement('button');
        go.type = 'button';
        go.className = 'card-focus ghost';
        go.textContent = node.kind === 'resume-card' ? 'Pick it back up' : 'Work on this';
        go.setAttribute('aria-label',
          `${node.kind === 'resume-card' ? 'Pick back up' : 'Work on'} ${node.title || '(untitled)'}`);
        go.addEventListener('click', () => onFocus(node));
        actions.append(go);
      }

      // Check it off without opening anything — what makes this a todo list.
      //
      // NOT offered for: what is already done; what triage still owns (offering
      // two ways to dispose of one item in two surfaces is how the two come to
      // disagree); and NOT for anything on the Menu. Law 6 and ADR-0014 govern
      // clocks and demand rather than completability, so a Done button there
      // would be legal — but the Menu is the one surface described as
      // structurally incapable of nagging, and putting a completion control on
      // every row of it makes it look like a list of things owed. Promotion from
      // the Menu is deliberate (detail sheet); finishing something there should
      // be too.
      if (onDone && !node.lastDone && !node.onMenu && !(node.captured && node.route === null)) {
        const done = document.createElement('button');
        done.type = 'button';
        done.className = 'card-done';
        done.textContent = 'Done';
        done.setAttribute('aria-label', `Done: ${node.title || '(untitled)'}`);
        done.addEventListener('click', () => onDone(node.id));
        actions.append(done);
      }
      // Only when it has something in it: an empty div is a gap in a row of cards,
      // and a Menu row legitimately has no actions at all.
      if (actions.childElementCount > 0) li.append(actions);
      ul.append(li);
    }

    const heldBack = group.items.length - shown.length;
    if (heldBack > 0) {
      const li = document.createElement('li');
      li.className = 'card card-more';
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'card-open';
      // The real number, never "many". A cap that will not say what it is hiding
      // is a cap that has decided for you.
      more.textContent = `${heldBack} more under ${group.title.toLowerCase()} — show them`;
      more.addEventListener('click', () => {
        revealed.add(group.key);
        rerenderAll?.();
      });
      li.append(more);
      ul.append(li);
    }
  }

  list.replaceChildren(...rows);
  $('#empty').hidden = groups.length > 0;

  // The Menu (law 6). BEHIND A CONTROL — a wish list that greets you is a demand
  // list, and the Menu is the one surface in this app structurally incapable of
  // nagging. The button states the count and says plainly that none of it is
  // asking; the list itself only exists once you have opened it.
  try {
    const st = session.state();
    const total = menuCount(st);
    const openBtn = document.querySelector<HTMLButtonElement>('#menu-open');
    const region = document.querySelector<HTMLElement>('#menu');
    if (openBtn && region) {
      openBtn.hidden = total === 0;
      openBtn.textContent = menuWords(total);
      if (total === 0) {
        region.hidden = true;
        openBtn.setAttribute('aria-expanded', 'false');
      }
      const rows: HTMLElement[] = [];
      for (const g of menuGroups(st)) {
        const h = document.createElement('h3');
        h.className = 'menu-cat';
        h.textContent = `${g.title} · ${g.items.length}`;
        rows.push(h);
        const ul = document.createElement('ul');
        ul.className = 'menu-list';
        ul.setAttribute('aria-label', g.title);
        for (const n of g.items) {
          const li = document.createElement('li');
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'menu-item';
          const t = document.createElement('span');
          t.className = 'menu-title';
          t.textContent = n.title || '(untitled)';
          b.append(t);
          // Two numbers and their difference. No bar, no percentage, no
          // projected date — a bar is a machine for implying you are behind.
          const money = saveForWords({ node: n, target: n.saveTarget, saved: n.saveSaved });
          if (money) {
            const m = document.createElement('span');
            m.className = 'menu-money';
            m.textContent = money;
            b.append(m);
          }
          if (openDetail) b.addEventListener('click', () => openDetail(n));
          li.append(b);
          ul.append(li);
        }
        rows.push(ul);
      }
      region.replaceChildren(...rows);
    }
  } catch {
    // A surface. It must never take the list down with it.
  }

  // The track portfolio. What you carry rather than do — a name, a date you owe
  // an answer, and whether it has moved. No health word anywhere: "at risk" and
  // "slipping" are this app grading someone else's work on evidence it does not
  // have. It states the dates and lets you decide.
  try {
    const nowIso = new Date(now()).toISOString();
    const lines = trackPortfolio(session.state(), nowIso, session.zone);
    const region = document.querySelector<HTMLElement>('#portfolio');
    const count = document.querySelector<HTMLElement>('#portfolio-count');
    const list = document.querySelector<HTMLElement>('#portfolio-list');
    if (region && count && list) {
      region.hidden = lines.length === 0;
      count.textContent = portfolioWords(lines.length);
      list.replaceChildren(...lines.map(l => {
        const li = document.createElement('li');
        li.className = 'portfolio-item';
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'portfolio-open';
        const t = document.createElement('span');
        t.className = 'portfolio-title';
        t.textContent = l.node.title || '(untitled)';
        const w = document.createElement('span');
        w.className = 'portfolio-why';
        w.textContent = trackWords(l);
        b.append(t, w);
        if (openDetail) b.addEventListener('click', () => openDetail(l.node));
        li.append(b);
        return li;
      }));
    }
  } catch {
    // A surface. It must never take the list down with it.
  }

  // The person lens. Everything you are owed, longest first, INCLUDING the ones
  // nobody has put a name to — the route that creates a waiting-for is a single
  // tap that never asks who, so unattributed is the commonest kind, and dropping
  // them would make the one surface that lists what you are owed quietly
  // incomplete.
  try {
    const nowIso = new Date(now()).toISOString();
    const owed = waitingOnAnyone(session.state(), nowIso, session.zone);
    const region = document.querySelector<HTMLElement>('#people');
    const count = document.querySelector<HTMLElement>('#people-count');
    const list = document.querySelector<HTMLElement>('#people-list');
    if (region && count && list) {
      region.hidden = owed.length === 0;
      count.textContent = owed.length === 0 ? '' : peopleWords(owed.length);
      list.replaceChildren(...owed.map(line => {
        const li = document.createElement('li');
        li.className = 'people-item';
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'people-open';
        const t = document.createElement('span');
        t.className = 'people-title';
        t.textContent = line.node.title || '(untitled)';
        const w = document.createElement('span');
        w.className = 'people-why';
        const whom = withWhom(session.state(), line.node);
        const how = waitingWords(line.days);
        // "With Sam for three weeks." — a duration and never a verdict. When
        // nobody was named it says so plainly rather than inventing a name or
        // hiding the row.
        w.textContent = [whom ? `With ${whom}` : 'Nobody named yet', how].filter(Boolean).join(' ') + '.';
        b.append(t, w);
        if (openDetail) b.addEventListener('click', () => openDetail(line.node));
        li.append(b);
        return li;
      }));
    }
  } catch {
    // A surface. It must never take the list down with it.
  }

  // Review — exceptions only. Rendered from the same `render` pass as the list,
  // because it is a fact about the list and nothing else needs to co-ordinate.
  try {
    const rv = reviewExceptions(session.state());
    const region = document.querySelector<HTMLElement>('#review');
    const count = document.querySelector<HTMLElement>('#review-count');
    const list = document.querySelector<HTMLElement>('#review-list');
    if (region && count && list) {
      region.hidden = rv.total === 0;
      count.textContent = rv.total === 0 ? '' : reviewWords(rv.total, rv.shown.length);
      list.replaceChildren(...rv.shown.map(x => {
        const li = document.createElement('li');
        li.className = 'review-item';
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'review-open';
        const t = document.createElement('span');
        t.className = 'review-title';
        t.textContent = x.node.title || '(untitled)';
        const w = document.createElement('span');
        w.className = 'review-why';
        w.textContent = x.words;
        b.append(t, w);
        if (openDetail) b.addEventListener('click', () => openDetail(x.node));
        li.append(b);
        return li;
      }));
    }
  } catch {
    // A surface. It must never take the list down with it.
  }

  // The gauge reads as text first and the number is the information (B-02).
  const { silent, total } = coverageGauge(session.state());
  const readyNow = groups.find(g => g.key === 'ready')?.items.length ?? 0;
  // The gauge is a button: its number is a claim, and the claim opens into the
  // itemised list that backs it (build-plan item 21).
  //
  // `ready` is stated here because **the icon badge shows that same number**, and
  // until now no surface in the app said it anywhere. Noah came back to a red 1 on
  // the home screen and could not find a 1 inside — so the badge was an
  // unexplained demand, which is the one thing this app must never be. The group
  // headings deliberately carry no counts (a heading is not a score), so the
  // gauge is the honest place: it is already where numbers live, and it already
  // opens into the list that backs them.
  $('#gauge').textContent =
    total === 0
      ? 'nothing held yet'
      : `${total} held · ${readyNow} ready now · ${silent} silent · see each`;

  // T0's badge (ADR-0007): how many things are actually asking, on the app icon,
  // so a glance at the home screen is informative without opening anything.
  // Counts the READY group ONLY — a badge showing everything you hold is a number
  // that never falls, which is a nag rather than information. It is the SAME
  // variable the gauge states above, so the two cannot disagree. Optional, and the
  // switch lives in `./badge.ts` along with the reason it is a switch.
  paintBadge(readyNow);
}

/** Plain words, one idea, no idioms (B-09). Never a countdown, never a rebuke.
 *
 *  Counts CALENDAR days in the reader's zone. The first version divided elapsed
 *  milliseconds by 86_400_000, which says "today" at 23:00 about a clock two
 *  hours away — plainly tomorrow — and is an hour out on every DST day (V-13). */
function friendly(iso: string, zone: string): string {
  // A stored date that is not a real instant degrades to plain words rather than
  // throwing. Before the zone-aware path this divided milliseconds and produced
  // the harmless string "Invalid Date"; converting that degradation into a fatal
  // throw was a regression, and it killed capture (audit).
  if (!isValidIso(iso)) return 'held';
  const days = calendarDaysBetween(new Date(now()).toISOString(), iso, zone);
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 7) return `in ${days} days`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: zone });
}

async function main(): Promise<void> {
  const session = await openSession(now);
  const input = $<HTMLInputElement>('#capture');
  const status = $('#status');

  input.value = await session.draft();

  // Every surface is mounted through a mutable holder that starts as a no-op, so
  // one failing surface cannot take the others — or capture — down with it, and
  // no callback can close over a binding that is not initialised yet.
  //
  // CONTAINMENT IS LOAD-BEARING HERE, not defensive habit. These surfaces read
  // every stored date, and they are built BEFORE the submit listener below is
  // attached. One malformed date used to throw out of this stretch, leaving the
  // form with no handler at all — and a form with no submit handler does a
  // native GET navigation, which clears the input and destroys the typed thought
  // with no error whatsoever, permanently, while the data sits intact and
  // unreachable. Capture is the promise; everything else is a surface.
  let detail: { open(n: NodeState): void } = { open() {} };
  let work: { refresh(): void } = { refresh() {} };
  let triage: { refresh(): void } = { refresh() {} };
  let replan: { refresh(): void } = { refresh() {} };
  let focus: FocusUI = { refresh() {}, start() {} };
  let reentry: { refresh(): void } = { refresh() {} };
  let bother: { refresh(): void } = { refresh() {} };

  // ONE render closure, used everywhere. Two call sites used to invoke
  // `render(session)` bare — the URL-capture path and its undo — which silently
  // dropped `openDetail`, so after a link capture no card opened its sheet.
  // One write at a time, and focus goes somewhere real afterwards. Both defects
  // were fixed in clarify.ts and work.ts earlier and simply not carried across
  // when this control was added: without the guard a double-tap wrote the same
  // done.marked twice, and because ticking a row off REMOVES it from the group it
  // was in, focus fell to <body> every time (WCAG 2.4.3).
  let doneBusy = false;
  const markDone = (id: string): void => {
    if (doneBusy) return;
    doneBusy = true;
    // Remember where we were, so focus can land on the next thing in the list
    // rather than at the top of the document.
    const buttons = Array.from(document.querySelectorAll<HTMLElement>('#cards .card-done'));
    const at = buttons.findIndex(b => b === document.activeElement);
    const label = session.state().nodes.get(id)?.title || '(untitled)';
    void session.commit(ctx => doneEvents(ctx, id))
      .then(() => {
        // Say it. The other two surfaces announce a completion; this one was
        // silent, so a screen-reader user got no confirmation AND no focus
        // (WCAG 2.4.3 + 4.1.3). #status is a live region and is visible.
        status.textContent = `Done: ${label}.`;
      })
      .catch((err: Error) => { status.textContent = `Couldn’t record that — ${err.message}`; })
      .finally(() => {
        doneBusy = false;
        try { refreshAll(); } catch { /* renders on next load */ }
        const now = Array.from(document.querySelectorAll<HTMLElement>('#cards .card-done'));
        // The next row's control, or the one that took its place; the capture
        // line when nothing is left to tick off.
        const next = at >= 0 ? (now[at] ?? now[now.length - 1]) : now[0];
        (next ?? document.querySelector<HTMLElement>('#capture'))?.focus();
      });
  };
  const rerender = (): void => render(session, n => detail.open(n), markDone, n => focus.start(n));
  // The held list AND the replan surface. `workSurface` excludes every id with a
  // live card, so these two must never be refreshed apart from one another: if
  // only one re-rendered, resolving a card would return the item to Next-up
  // while its row was still on screen — one item, two questions, which is
  // exactly what the exclusion exists to prevent. This is what work.ts is handed
  // as its onChange, since work refreshes itself afterwards.
  const rerenderLists = (): void => { rerender(); replan.refresh(); focus.refresh(); reentry.refresh(); bother.refresh(); };
  rerenderAll = rerenderLists;
  const refreshAll = (): void => { rerenderLists(); work.refresh(); };

  try { rerender(); } catch { /* the shell still works; cards appear on next load */ }

  // The detail sheet: tap anything you hold to give it a date, make it repeat,
  // or take back a completion (Phase 3.5).
  try { detail = mountDetail(session, now, refreshAll); } catch { /* a surface */ }

  // Dates that have gone by (law 3). Mounted BEFORE work, because work's queue
  // is defined by what replan is not already asking about.
  try { replan = mountReplan(session, now, refreshAll); } catch { /* a surface */ }

  // Work mode: Next up, Upkeep chips, and the coverage list behind the gauge.
  try { work = mountWork(session, now, rerenderLists); } catch { /* a surface */ }

  // Focus: one thing, and a way to be interrupted without losing it. Mounted
  // after work so its own refresh can run inside `rerenderLists` — an interrupt
  // adds an inbox item, which changes triage, the list and the gauge.
  try { focus = mountFocus(session, now, refreshAll); } catch { /* a surface */ }

  // Naming a worry (v1.5). Mounted before re-entry, which must be last.
  try { bother = mountBother(session, refreshAll); } catch { /* a surface */ }

  // Today, on paper. No state of its own — it builds a card at the moment of
  // printing and empties the area afterwards.
  try { mountPrint(session, now); } catch { /* a surface */ }

  // Coming back after being away (law 8). Mounted LAST, because it measures the
  // absence from the state as loaded and must do so before any other surface has
  // had a chance to commit anything — a cure clock written by another mount
  // would be activity, and the greeting would report an absence of zero to
  // somebody who has been gone a fortnight.
  try { reentry = mountReentry(session, now, refreshAll); } catch { /* a surface */ }

  // The Menu opens and closes. Closed on arrival, every time — it is demand-free
  // and a surface that remembers it was open is a surface that greets you.
  const menuBtn = document.querySelector<HTMLButtonElement>('#menu-open');
  const menuRegion = document.querySelector<HTMLElement>('#menu');
  menuBtn?.addEventListener('click', () => {
    if (!menuRegion) return;
    const open = menuRegion.hidden;
    menuRegion.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
  });

  // The triage surface (heat pass + clarify). It re-renders the held list when
  // it moves an item, and capture refreshes it (a new item joins the inbox).
  try { triage = mountTriage(session, refreshAll); } catch { /* a surface */ }

  // Three URL entrances, all landing in the same capture (ADR-0008):
  //  - ?capture=1     the manifest shortcut — just focus the empty line
  //  - ?text=         the documented public endpoint (a hostile link can reach it)
  //  - share target   ?title=&text=&url= from the OS share sheet (Chromium)
  // Each is a public surface, so each does the ONE thing it may — create a single
  // unclarified item — with a visible confirm and undo; none can set a clock,
  // route, complete, or delete. Text is stored as text and shown with textContent.
  await handleUrlEntrances(session, status, input, rerender);
  triage.refresh();

  // Per keystroke. An interruption mid-capture is the EXPECTED case for this
  // audience, not the edge case (ADR-0008).
  input.addEventListener('input', () => { void session.setDraft(input.value); });

  $<HTMLFormElement>('#capture-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    // Clear SYNCHRONOUSLY, never disable. Disabling blurred the field for the
    // whole commit window — dropping keystrokes and, on iPadOS, dismissing the
    // keyboard with no guaranteed return — and the un-cleared text made a
    // double-tap capture the same thought twice (audit). With the input empty,
    // a second submit in the window reads '' and no-ops.
    input.value = '';

    let landed = false;
    try {
      // Commit BEFORE the UI confirms (ADR-0008).
      await session.commit(ctx => captureEvent(ctx, text, 'quick'));
      landed = true;
    } catch (err) {
      // The write failed: give the thought back, and say so.
      input.value = text;
      status.textContent = `Not saved — ${(err as Error).message}`;
      input.focus();
      return;
    }

    // From here the write IS in the log. Nothing below may un-say that: the
    // audit showed a post-commit throw landing in a shared catch and telling
    // the user "Not saved" about a thought that was saved — who then retypes
    // it and gets a duplicate. Confirmation first, housekeeping after, each
    // failure contained.
    status.textContent = 'Held. It will come back to you.';
    void session.setDraft('').catch(() => { /* stale draft self-heals on next keystroke */ });
    try {
      refreshAll();
      triage.refresh();
    } catch {
      // A render bug must not contradict a landed write; the card appears on
      // next load. landed stays the truth.
    }
    if (landed) input.focus();
  });

  // The build, painted BEFORE the panel and OUTSIDE its try/catch.
  //
  // It used to exist only in the (i) panel's title, which meant a screenshot of
  // the app could not say which build it was — and the panel is wrapped below
  // precisely because it is allowed to fail. A version stamp is a diagnostic, and
  // a diagnostic that disappears when something breaks is the wrong way round: it
  // is needed most in exactly the state that would have removed it.
  const build = document.querySelector<HTMLElement>('#build-version');
  if (build) build.textContent = CURRENT.triplet;

  // Read BEFORE the first render that paints the icon, so a device with the badge
  // switched off never flashes a number on the way to obeying the preference.
  await loadBadgePreference(session.store);

  // Opens itself on a first run — a new user has no way to know that storage
  // needs asking for — and never uninvited after that. Contained: a failure
  // here must not take capture down with it, or block readiness.
  try {
    await mountAbout(session);
  } catch {
    // The (i) failing is a lost nicety; capture still works.
  }

  // The store is open, state is folded, and the surface reflects it. Marked on
  // the document so the headless walk waits for the app rather than for `load`,
  // which fires while this function is still awaiting IndexedDB.
  document.body.dataset.ready = 'true';

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Offline support is an enhancement; failing to register is not a reason
      // to break capture, which is the one thing that must always work.
    });
  }
}

/** Compose one capture from whatever a share sheet handed over. Title, text and
 *  URL can each be present or absent; the result is the parts that exist, joined,
 *  trimmed — never the literal string "undefined" and never a blank line. */
function composeShared(title: string, text: string, url: string): string {
  return [title, text, url].map(s => s.trim()).filter(Boolean).join('\n').trim();
}

/** The three URL entrances. Captures at most once, offers an undo, and scrubs
 *  the query from the address bar so a refresh cannot re-fire it. */
async function handleUrlEntrances(session: Session, status: HTMLElement, input: HTMLInputElement, rerender: () => void): Promise<void> {
  const params = new URLSearchParams(location.search);
  const clean = location.pathname + location.hash;

  // The manifest shortcut: no capture, just land ready to type.
  if (params.get('capture') === '1') {
    history.replaceState(null, '', clean);
    input.focus();
    return;
  }

  const title = params.get('title') ?? '';
  const url = params.get('url') ?? '';
  const rawText = params.get('text') ?? '';
  const shared = Boolean(title || url);            // share sheet sends these; the bare endpoint does not
  const text = shared ? composeShared(title, rawText, url) : rawText.trim();
  if (!text) return;

  // Scrub first, so a failure or a refresh cannot fire it twice.
  history.replaceState(null, '', clean);

  const source = shared ? 'share-target' : 'url-endpoint';
  let capturedNode: string | null = null;
  try {
    await session.commit(ctx => {
      const events = captureEvent(ctx, text, source);
      capturedNode = events[0]!.node;
      return events;
    });
  } catch (err) {
    status.textContent = `Couldn’t hold that — ${(err as Error).message}`;
    return;
  }

  rerender();

  // Visible confirm with an undo — a drive-by capture is never silent and never
  // permanent. Undo trashes the one node this created and nothing else.
  status.replaceChildren();
  status.append(document.createTextNode('Held from a link. '));
  const undo = document.createElement('button');
  undo.type = 'button';
  undo.className = 'linklike';
  undo.textContent = 'Undo';
  undo.addEventListener('click', async () => {
    undo.disabled = true;
    try {
      await session.commit(ctx => [{
        id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
        kind: 'node.trashed', node: capturedNode,
        payload: { reason: 'undo url-capture' },
      } as AppEvent]);
      rerender();
      status.textContent = 'Undone.';
    } catch (err) {
      status.textContent = `Couldn’t undo — ${(err as Error).message}`;
    }
  });
  status.append(undo);
}

void main().catch((err: unknown) => {
  const status = document.querySelector('#status');
  if (status) status.textContent = `Quietkeep could not start — ${(err as Error).message}`;
});
