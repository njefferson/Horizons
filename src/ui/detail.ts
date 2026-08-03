// The detail sheet — what turns a triage loop into a planner (Phase 3.5).
//
// Tap anything you are holding and you can give it a date, make it repeat, take
// back a completion, put it on the Menu or let it go. Before this, the only
// thing the app could do to an item was route it six ways once, and the decay
// primitive had no path into it at all.
//
// One sheet, one item, every control a real <button> at full target size. It is
// a native <dialog>, so the platform gives us the modal semantics, Esc, and the
// focus trap rather than us reimplementing them badly.
//
// Only what is POSSIBLE for this item is shown: offering "Bring back from the
// Menu" for something that is not on the Menu would be a button that either does
// nothing or does something surprising, and this audience is exactly the one for
// whom a surprising control is expensive.

import type { Session } from './session.ts';
import { noteOf, type NodeState } from '../fold.ts';
import { DEMAND_FREE_KINDS } from '../events.ts';
import { localDayKey } from '../time.ts';
import { pressureOf, pressureWords } from '../pressure.ts';
import {
  setDueEvents, clearDueEvents, makeRepeatEvents, stopRepeatEvents,
  undoneEvents, untrashEvents, promoteFromMenuEvents, toMenuEvents, renameEvents,
  setStartEvents, clearStartEvents, estimateEvents, createParentEvents, cleanTitle,
  cleanNote, noteEvents, chooseTodayEvents, releaseTodayEvents,
} from './detail-intents.ts';
import { normalize } from '../search.ts';
import { doneEvents } from './work.ts';
import { declareFeedsEvents, releaseFeedsEvents } from './detail-intents.ts';
import { makeContainerEvents, parentEvents, unparentEvents } from './detail-intents.ts';
import { linkPersonEvents, closeWaitingEvents } from './detail-intents.ts';
import { setTrackRoleEvents, setSuspenseEvents } from './detail-intents.ts';
import { setSaveForEvents } from './detail-intents.ts';
import { people as peopleNodes, withWhom, openDays, waitingWords, isOpenWaiting } from '../people.ts';
import { dependencyView, dependencyWords, wouldCycle } from '../dependencies.ts';
import { legalParents, childrenOf, placeWords, isContainer } from '../tree.ts';
import { eventWords, isCure } from '../log-words.ts';
import { choosable, chosenToday, composedFull, todayIsOn } from '../composed.ts';
import { canHold, legalMergeTargets, mergePlan, unmergeEvents } from './merge-intents.ts';
import { decisionsFor, foldedIntoDeep } from '../merged.ts';
import { carryEvents, declineEvents, parkToSlotEvents } from './request-intents.ts';
import { nextSlotOccurrence, slotDayWords, slotOf } from '../requests.ts';
import { personView, stakeholdersOf, type PersonLine } from '../people.ts';
import { logDecisionEvents, removeStakeholderEvents } from './detail-intents.ts';

/** The relation words the sheet shows. The stored values are the vocabulary's
 *  closed set; these are what a person reads. */
const RELATION_WORDS: Record<string, string> = {
  'waiting-on': 'they owe me this',
  'requested-by': 'they asked for it',
  'opr': 'they are running it',
  'stakeholder': 'they care about it',
  'mentioned': 'they came up',
};

export interface DetailUI { open(node: NodeState): void }

export function mountDetail(session: Session, now: () => number, onChange: () => void): DetailUI {
  const q = <T extends HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);
  const dlg = q<HTMLDialogElement>('#detail');
  const title = q('#detail-title');
  const state = q('#detail-state');
  const date = q<HTMLInputElement>('#detail-date');
  const name = q<HTMLInputElement>('#detail-name');
  const every = q<HTMLInputElement>('#detail-every');
  const slack = q<HTMLInputElement>('#detail-slack');
  const live = q('#detail-live');
  const hint = q('#detail-repeat-hint');
  const feedsSel = q<HTMLSelectElement>('#detail-feeds');
  const leadInput = q<HTMLInputElement>('#detail-lead');
  const feedsList = q('#detail-feeds-list');
  const parentSel = q<HTMLSelectElement>('#detail-parent');
  const parentFilter = q<HTMLInputElement>('#detail-parent-filter');
  const parentCreate = q<HTMLButtonElement>('#detail-parent-create');
  const startInput = q<HTMLInputElement>('#detail-start');
  const estimateInput = q<HTMLInputElement>('#detail-estimate');
  const noteInput = q<HTMLTextAreaElement>('#detail-note');
  const mergeFilter = q<HTMLInputElement>('#detail-merge-filter');
  const mergeSel = q<HTMLSelectElement>('#detail-merge');
  const mergedList = q<HTMLElement>('#detail-merged-list');
  const personInput = q<HTMLInputElement>('#detail-person');
  const relationSel = q<HTMLSelectElement>('#detail-relation');
  const peopleData = q<HTMLDataListElement>('#detail-people');
  const peopleList = q('#detail-people-list');
  const stakeList = q('#detail-stakeholder-list');
  const decisionInput = q<HTMLTextAreaElement>('#detail-decision');
  const decisionList = q('#detail-decision-list');
  const decisionCount = q('#detail-decision-count');
  const placeLine = q('#detail-place');
  const kidsList = q('#detail-children');
  const personCount = q('#detail-person-count');
  const personOwes = q('#detail-person-owes');
  const personInvolves = q('#detail-person-involves');
  if (!dlg || !title || !state || !date || !name || !every || !slack || !live || !hint) {
    return { open() {} };
  }
  const NAME = name;
  const FEEDS = feedsSel, LEAD = leadInput, FEEDS_LIST = feedsList;
  const PARENT = parentSel, PLACE = placeLine, KIDS = kidsList;
  const PERSON = personInput, RELATION = relationSel, PEOPLE = peopleData, PEOPLE_LIST = peopleList;
  const DLG = dlg, TITLE = title, STATE = state, DATE = date, EVERY = every, SLACK = slack, LIVE = live;

  let current: NodeState | null = null;
  let busy = false;

  const btn = (sel: string): HTMLButtonElement | null => q<HTMLButtonElement>(sel);

  /**
   * The parent picker, painted against the filter box (1.3.0). At 45 imported
   * projects a bare select was a scroll test; typing narrows it, each option
   * names where IT sits ("Boy Scouts — in Volunteering") so same-named places
   * stay tellable apart, and when the typed words name no existing container
   * the create button offers to make the project AND file this under it in one
   * gated commit.
   */
  function paintParents(n: NodeState): void {
    if (!PARENT) return;
    const st = session.state();
    const legal = legalParents(st, n);
    const query = normalize(parentFilter?.value ?? '');
    const shown = query
      ? legal.filter(t => normalize(t.title || '').includes(query))
      : legal;
    const keep = PARENT.value;
    const lineage = (t: NodeState): string => {
      const p = t.parent ? st.nodes.get(t.parent) : undefined;
      const alive = p && !p.trashed && !p.mergedInto;
      return alive ? `${t.title || '(untitled)'} — in ${p.title || '(untitled)'}` : (t.title || '(untitled)');
    };
    PARENT.replaceChildren(...[
      Object.assign(document.createElement('option'), {
        value: '',
        // The empty option's words change with what is actually possible. A
        // fixed "pick one" over an empty list tells someone to do something
        // the app cannot let them do yet.
        textContent: legal.length === 0 ? 'nothing to put it under yet'
          : shown.length === 0 ? 'nothing matches that'
            : 'pick something',
      }),
      ...shown.map(t => Object.assign(document.createElement('option'), {
        value: t.id, textContent: lineage(t),
      })),
    ]);
    if (shown.some(t => t.id === keep)) PARENT.value = keep;
    PARENT.disabled = legal.length === 0;

    // Offer creation only when the typed words are a usable title that names no
    // existing container — an exact match means the place already exists and
    // the offer would mint a duplicate.
    if (parentCreate) {
      const raw = parentFilter?.value ?? '';
      const clean = cleanTitle(raw);
      // Over ALL live containers, not the LEGAL list: legalParents excludes the
      // node's CURRENT parent, so typing its title showed "nothing matches
      // that" plus an offer to mint an empty doppelganger and silently re-home
      // into it (audit). A place that exists is never offered as new.
      const exact = clean !== '' && [...st.nodes.values()]
        .filter(t => !t.trashed && !t.mergedInto && isContainer(t))
        .some(t => normalize(t.title || '') === normalize(clean));
      const offer = clean !== '' && !exact;
      parentCreate.hidden = !offer;
      if (offer) parentCreate.textContent = `New project named “${clean}” — put it under that`;
    }
  }

  /** The fold-into picker (1.7.0): the parent picker's manners — narrowed as
   *  you type, lineage named, the empty option honest about what is possible.
   *  Only legal targets are offered (never itself, never its own descendant,
   *  people only into people) — the recorded never-offer-then-refuse rule. */
  function paintMergeTargets(n: NodeState): void {
    if (!mergeSel) return;
    const st = session.state();
    const query = normalize(mergeFilter?.value ?? '');
    const legal = legalMergeTargets(st, n);
    const shown = query ? legal.filter(t => normalize(t.title || '').includes(query)) : legal;
    const lineage = (t: NodeState): string => {
      const p = t.parent ? st.nodes.get(t.parent) : undefined;
      const alive = p && !p.trashed && !p.mergedInto;
      return alive ? `${t.title || '(untitled)'} — in ${p.title || '(untitled)'}` : (t.title || '(untitled)');
    };
    const keep = mergeSel.value;
    mergeSel.replaceChildren(...[
      Object.assign(document.createElement('option'), {
        value: '',
        textContent: legal.length === 0 ? 'nothing else to fold into'
          : shown.length === 0 ? 'nothing matches that' : 'pick the one that stays',
      }),
      ...shown.map(t => Object.assign(document.createElement('option'), {
        value: t.id, textContent: lineage(t),
      })),
    ]);
    if (shown.some(t => t.id === keep)) mergeSel.value = keep;
    mergeSel.disabled = legal.length === 0;
  }

  /** Who cares how it goes, and what was decided (1.9.0, ADR-0057).
   *  Stakeholders come from `people[]` — the one home — so a link written
   *  any time since 0.15.0 appears with nothing re-entered. A decision row
   *  carries NO verb: the log is read-only, and the way back is to log the
   *  new decision. */
  const DECISIONS_SHOWN = 5;
  function paintMeeting(n: NodeState): void {
    const st = session.state();
    if (stakeList) {
      stakeList.replaceChildren(...stakeholdersOf(st, n).map(p => {
        const li = document.createElement('li');
        li.className = 'detail-feed';
        const label = document.createElement('span');
        const who = p.title || '(unnamed)';
        label.textContent = who;
        const off = document.createElement('button');
        off.type = 'button';
        off.className = 'ghost';
        off.textContent = 'Take them off';
        off.setAttribute('aria-label', `Take ${who} off the list`);
        off.addEventListener('click', () => {
          void run(ctx => removeStakeholderEvents(ctx, n.id, p.id),
            'Off the list. The record keeps that they were on it.');
        });
        li.append(label, off);
        return li;
      }));
    }
    // Through the fold (1.9.2): what was decided about this AND about
    // everything folded into it. Until then a fold silently took the source's
    // decision log off every surface. `decisionsFor` owns the total order.
    const rows = decisionsFor(st, n);
    if (decisionCount) {
      decisionCount.textContent = rows.length === 0 ? ''
        : rows.length === 1 ? 'One decision, kept.'
          : rows.length <= DECISIONS_SHOWN ? `${rows.length} decisions, newest first.`
            : `${rows.length} decisions — the ${DECISIONS_SHOWN} most recent are shown.`;
    }
    if (decisionList) {
      decisionList.replaceChildren(...rows.slice(0, DECISIONS_SHOWN).map(d => {
        const li = document.createElement('li');
        li.className = 'detail-feed';
        const text = document.createElement('span');
        text.textContent = d.text;
        const when = document.createElement('span');
        when.className = 'detail-when';
        const day = new Intl.DateTimeFormat('en-GB', {
          timeZone: session.zone, day: 'numeric', month: 'short',
        }).format(new Date(d.at));
        // Attributed when it was decided about something folded in — the
        // sheet already lists what folded in, so an unattributed row would
        // invite reconciling two lists that do not line up.
        const from = d.from ? st.nodes.get(d.from)?.title || '(untitled)' : null;
        when.textContent = [day, d.meeting, from ? `from ${from}` : null]
          .filter(Boolean).join(' · ');
        li.append(text, when);
        return li;
      }));
    }
  }

  /** Someone asked (1.8.0, ADR-0056): the fact line, the decline, the way
   *  back, and the slot button naming the REAL day it would come back —
   *  a control that says what it will do (the composed-cap rule). */
  function paintRequest(n: NodeState): void {
    const st = session.state();
    const fact = q<HTMLElement>('#detail-request-fact');
    const asked = [...n.people].reverse().find(p => p.relation === 'requested-by');
    if (fact) {
      const who = asked ? (st.nodes.get(asked.person)?.title || null) : null;
      fact.hidden = !who;
      if (who) fact.textContent = `${who} asked for this.`;
    }
    const declined = n.notNow !== null;
    const declineBtn = btn('#detail-decline');
    if (declineBtn) declineBtn.hidden = declined;
    const declinedBox = q<HTMLElement>('#detail-declined');
    if (declinedBox) declinedBox.hidden = !declined;
    const words = q<HTMLElement>('#detail-declined-words');
    if (words && n.notNow) {
      const day = localDayKey(n.notNow.at, session.zone);
      const who = n.notNow.person ? (st.nodes.get(n.notNow.person)?.title || null) : null;
      words.textContent = who
        ? `Declined ${day} — ${who} asked. It sits in the Not Now ledger.`
        : `Declined ${day}. It sits in the Not Now ledger.`;
    }
    const slotBtn = btn('#detail-slot-park');
    if (slotBtn) {
      const day = slotOf(st);
      const offer = !declined && day !== null && !n.clocks.park;
      slotBtn.hidden = !offer;
      if (offer && day) {
        const back = localDayKey(
          nextSlotOccurrence(day, new Date(now()).toISOString(), session.zone), session.zone);
        slotBtn.textContent = `Park it until the request slot — back ${back} (${slotDayWords(day)})`;
      }
    }
  }

  /** Say it where it can be seen AND where it can be heard. A failure reported
   *  only to a visually-hidden region is a failure a sighted user never learns
   *  about (F-08). */
  const say = (msg: string): void => { LIVE.textContent = msg; STATE.textContent = msg; };

  /** Commit, then re-read the node from fresh state — never from the stale copy
   *  the sheet was opened with, which would render yesterday's answer. */
  // `announce` may be a thunk so a handler can say what the batch actually did
  // — the merge names an edge that could not come across (1.9.2).
  const run = async (
    make: Parameters<Session['commit']>[0], announce: string | (() => string),
  ): Promise<void> => {
    if (!current || busy) return;
    busy = true;
    const id = current.id;
    try {
      await session.commit(make);
      LIVE.textContent = typeof announce === 'function' ? announce() : announce;
    } catch (err) {
      say(`Couldn’t do that — ${(err as Error).message}`);
    } finally {
      busy = false;
    }
    try { onChange(); } catch { /* a render bug must not contradict a landed write */ }
    const fresh = session.state().nodes.get(id);
    if (fresh) render(fresh);
  };

  function render(n: NodeState): void {
    current = n;
    TITLE.textContent = n.title || '(untitled)';

    // What is true about it now, in words — never a colour, never a badge.
    const p = pressureOf(n, new Date(now()).toISOString(), session.zone);
    const bits: string[] = [];
    if (n.trashed) bits.push('let go');
    if (n.mergedInto) {
      const survivor = session.state().nodes.get(n.mergedInto);
      bits.push(`folded into ${survivor?.title ? `“${survivor.title}”` : 'another thing'}`);
    }
    if (n.onMenu) bits.push('on the Menu');
    if (n.lastDone) bits.push('done');
    if (n.kind === 'upkeep' && n.intervalDays) bits.push(`repeats every ${n.intervalDays} days`);
    // The quiet fact line (1.4.0): where a sorted thing went, in the sorting's
    // own words — the sheet is where "it feels lost" gets its answer.
    if (n.route && n.route !== 'trash') bits.push(`sorted as ${String(n.route).replace(/-/g, ' ')}`);
    if (n.notNow) bits.push('in the Not Now ledger');
    const words = pressureWords(p);
    if (words) bits.push(words);
    const clock = n.clocks.due ?? n.clocks.review ?? n.clocks.start;
    if (clock) bits.push(`comes back ${localDayKey(clock.at, session.zone)}`);
    STATE.textContent = bits.length ? bits.join(' · ') : 'held';

    // Seed the date box with the date it already has, so "Set" is an edit rather
    // than a blank slate you have to re-derive.
    // Do NOT clobber something the user is part-way through typing. `render` runs
    // after every commit in this sheet, so setting a date used to silently eat an
    // in-progress rename — in an app whose capture line persists a draft per
    // keystroke precisely because interruption is the expected case (audit).
    if (document.activeElement !== NAME || NAME.value.trim() === '') NAME.value = n.title;
    DATE.value = n.clocks.due ? localDayKey(n.clocks.due.at, session.zone) : '';
    if (startInput) startInput.value = n.clocks.start ? localDayKey(n.clocks.start.at, session.zone) : '';
    // The note rides the same no-clobber rule as the rename box: `render` runs
    // after every commit here, and prose is the costliest thing to eat.
    if (noteInput && document.activeElement !== noteInput) noteInput.value = noteOf(n) ?? '';
    // The decision box obeys the same rule for the same reason — `render`
    // runs after every commit here, and prose is the costliest thing to eat.
    // It is cleared explicitly on a successful log, never by a repaint.
    if (n.intervalDays && n.intervalDays > 0) EVERY.value = String(n.intervalDays);
    if (n.comfortWindowDays && n.comfortWindowDays > 0) SLACK.value = String(n.comfortWindowDays);

    // Who it is with (the person lens's write side).
    if (PERSON && PEOPLE && PEOPLE_LIST) {
      const st = session.state();
      // The datalist offers names already in this vault, so the second thing you
      // link to Sam does not become a second Sam through a typo.
      PEOPLE.replaceChildren(...peopleNodes(st).map(p =>
        Object.assign(document.createElement('option'), { value: p.title || '' })));

      // Stakeholders render in their OWN group (1.9.0) — listing them here
      // too would put one link on the sheet twice, and a removal would leave
      // the stale copy contradicting the record (the OPR defect's shape).
      // DOORS, not dead text (1.12.0). A name here was a `<span>`, so the one
      // question a name raises — "what else is with them?" — had no way to be
      // asked from the place it was raised. Same fix 1.6.0 made for the other
      // lists, missed here; the fresh-node lookup is that pattern's own rule,
      // because a row built at paint time can be tapped much later.
      PEOPLE_LIST.replaceChildren(...n.people.filter(l => l.relation !== 'stakeholder').map(l => {
        const li = document.createElement('li');
        li.className = 'detail-feed';
        const who = st.nodes.get(l.person)?.title || '(unnamed)';
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'linklike';
        b.textContent = `${who} — ${RELATION_WORDS[l.relation] ?? l.relation}`;
        b.addEventListener('click', () => {
          const person = session.state().nodes.get(l.person);
          if (person) showNode(person);
        });
        li.append(b);
        return li;
      }));

      // WHAT IS WITH THEM (1.12.0) — the per-person half of build-plan item 33.
      // `personView` has been written, exported and unit-tested since the person
      // work landed, with NO caller anywhere: a projection with nowhere to
      // render, the same "complete and unreachable" shape `node.merged` had
      // before 1.7.0. A person is an ordinary node, so its own sheet is the
      // natural home and this costs no new surface on the landing page.
      // Shown only on a person, and shown even when nothing is with them —
      // 'nothing is with them just now' is an answer, and a group that vanishes
      // leaves the question looking unanswerable.
      const personGroup = q<HTMLElement>('#detail-person-group');
      if (personGroup) personGroup.hidden = !(n.kind === 'person' && !n.trashed);
      if (n.kind === 'person') {
        const view = personView(st, n.id, new Date(now()).toISOString(), session.zone);
        const owes = view?.owes ?? [];
        const involves = view?.involves ?? [];
        if (personCount) {
          // A count of what is WITH someone is a fact about work, not a score
          // about them (law 7: the app plots, the human interprets). It never
          // says "late", never ranks people, and never compares two of them.
          personCount.textContent = (view?.total ?? 0) === 0
            ? 'Nothing is with them just now.'
            : owes.length === 0
              ? 'Nothing is owed to you. They come up here:'
              : `${owes.length === 1 ? 'One thing is' : `${owes.length} things are`} owed to you.`;
        }
        const row = (line: { node: NodeState; relation: string; days: number | null }, owed: boolean): HTMLLIElement => {
          const li = document.createElement('li');
          li.className = 'detail-feed';
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'linklike';
          b.textContent = line.node.title || '(untitled)';
          const when = document.createElement('span');
          when.className = 'detail-when';
          // A duration, never a verdict — the same words the People surface
          // uses, so one fact reads identically wherever it appears.
          when.textContent = owed
            ? (waitingWords(line.days) ?? 'with them')
            : (RELATION_WORDS[line.relation] ?? line.relation);
          b.addEventListener('click', () => {
            const fresh = session.state().nodes.get(line.node.id);
            if (fresh) showNode(fresh);
          });
          li.append(b, when);
          return li;
        };
        personOwes?.replaceChildren(...owes.map((l: PersonLine) => row(l, true)));
        personInvolves?.replaceChildren(...involves.map((l: PersonLine) => row(l, false)));
      }

      // An open waiting-for says how long, in words, and offers the one action
      // that ends it. A duration, never a verdict: "for three weeks" is a fact
      // about a date, and this app keeps score on nobody's behalf.
      if (isOpenWaiting(n)) {
        const li = document.createElement('li');
        li.className = 'detail-feed';
        const label = document.createElement('span');
        const whom = withWhom(st, n);
        const how = waitingWords(openDays(n, new Date(now()).toISOString(), session.zone));
        label.textContent = [whom ? `With ${whom}` : 'With someone', how].filter(Boolean).join(' ') + '.';
        const got = document.createElement('button');
        got.type = 'button';
        got.id = 'detail-waiting-close';
        got.textContent = 'It arrived';
        got.addEventListener('click', () => {
          void run(ctx => closeWaitingEvents(ctx, n.id), 'Good — it is with you now.');
        });
        li.append(label, got);
        PEOPLE_LIST.append(li);
      }
    }

    // Containment (law 4). Where it sits, what may hold it, and what it holds.
    if (PARENT && PLACE && KIDS) {
      const st = session.state();
      paintParents(n);

      const place = placeWords(st, n);
      PLACE.textContent = place ?? '';
      PLACE.hidden = !place;

      // What it holds, shown on the sheet of the thing that holds it — because
      // "is anything actually under this" is the question Review answers from
      // the outside, and someone looking at the container deserves the same
      // answer without being sent anywhere.
      const kids = childrenOf(st, n.id);
      // Doors (1.6.0): a child row opens the CHILD's sheet — the same sheet,
      // re-rendered on the fresh node, which is how every list travels now.
      KIDS.replaceChildren(...kids.map(k => {
        const li = document.createElement('li');
        li.className = 'detail-feed';
        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'linklike detail-child-open';
        open.textContent = k.title || '(untitled)';
        open.addEventListener('click', () => {
          const fresh = session.state().nodes.get(k.id);
          if (fresh) { render(fresh); LIVE.textContent = ''; }
        });
        li.append(open);
        return li;
      }));
      if (isContainer(n) && kids.length === 0) {
        const li = document.createElement('li');
        li.className = 'detail-feed-words';
        li.textContent = 'Nothing is under this yet.';
        KIDS.append(li);
      }
    }

    // The dependency edge (build-plan item 27). The picker offers only nodes it
    // could legally feed — live, not itself, and not one that would close a
    // loop. Offering an illegal option and refusing it afterwards is a control
    // that lies about what it does.
    if (FEEDS && LEAD && FEEDS_LIST) {
      const st = session.state();
      const legal = [...st.nodes.values()]
        .filter(t => !t.trashed && !t.mergedInto && !t.lastDone && t.id !== n.id)
        .filter(t => !wouldCycle(st, n.id, t.id))
        .filter(t => !n.feeds.includes(t.id))
        .sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      const keep = FEEDS.value;
      FEEDS.replaceChildren(...[
        Object.assign(document.createElement('option'), { value: '', textContent: 'nothing yet' }),
        ...legal.map(t => Object.assign(document.createElement('option'), {
          value: t.id, textContent: t.title || '(untitled)',
        })),
      ]);
      if (legal.some(t => t.id === keep)) FEEDS.value = keep;

      const view = dependencyView(st, n, new Date(now()).toISOString(), session.zone);
      const words = dependencyWords(view);
      FEEDS_LIST.replaceChildren(...view.feeds.map(f => {
        const li = document.createElement('li');
        li.className = 'detail-feed';
        const label = document.createElement('span');
        label.textContent = f.node.title || '(untitled)';
        const drop = document.createElement('button');
        drop.type = 'button';
        drop.className = 'ghost';
        drop.textContent = 'Unlink';
        drop.setAttribute('aria-label', `Unlink ${f.node.title || '(untitled)'}`);
        drop.addEventListener('click', () => {
          void run(ctx => releaseFeedsEvents(ctx, n.id, f.node.id), 'Unlinked.');
        });
        li.append(label, drop);
        return li;
      }));
      // The arithmetic, in words, only when every term is really there.
      if (words) {
        const p = document.createElement('li');
        p.className = 'detail-feed-words';
        p.textContent = words;
        FEEDS_LIST.append(p);
      }
      if (n.leadDays && n.leadDays > 0) LEAD.value = String(n.leadDays);
    }

    // Only offer what this item can actually do.
    const show = (sel: string, on: boolean): void => {
      const b = btn(sel);
      if (b) b.hidden = !on;
    };
    const repeats = n.kind === 'upkeep' && (n.intervalDays ?? 0) > 0;
    // No temporal controls on a Menu item OR on a demand-free kind — and the
    // second clause was MISSING until 1.17.2, which was a shipped instance of
    // offered-then-refused (the 1.9.2 audit's F-B, a fourth time). The comment
    // here even named the gap while the code walked into it: it said "the
    // gate's law-6 check guards demand-free KINDS, not Menu membership" and then
    // tested only Menu membership. So the sheet offered "Not before ⟨day⟩" on a
    // person or an anchor reached through search — and an off-Menu aspiration in
    // the todo list — and the gate refused all of it after the tap. The repeat
    // verb too: `makeRepeatEvents` carries a `clock.set`, refused the same way.
    //
    // Both clauses still matter. Menu membership is not a kind — a
    // someday-routed action keeps kind 'action', so without the first clause a
    // date on a wish would be ACCEPTED and then unrenderable (the Menu group
    // wins every surface). Dating a wish goes through "Bring back as real work"
    // first, which is the deliberate act law 6 wants it to be.
    const temporal = !n.onMenu
      && !(DEMAND_FREE_KINDS as readonly string[]).includes(n.kind);
    const grp = (sel: string, on: boolean): void => {
      const g = q<HTMLElement>(sel);
      if (g) g.hidden = !on;
    };
    grp('#detail-date-group', temporal);
    grp('#detail-start-group', temporal);
    grp('#detail-repeat-group', temporal);
    // The estimate is about DOING the thing: meaningless on a wish, a person,
    // or something let go — and junk rows would pollute the one dataset that
    // can never be backfilled (audit).
    grp('#detail-estimate-group', !n.onMenu && !n.trashed
      && !['person', 'aspiration', 'pebble'].includes(n.kind));
    // A note is NOT a demand, so unlike the temporal groups it stays for Menu
    // items and people — anything you hold can carry words. Only a thing let
    // go loses the editor; "Keep it after all" is the door back.
    grp('#detail-note-group', !n.trashed);
    // The meeting furniture (1.9.0, ADR-0057): a container's people and its
    // decisions. Shown for containers off the Menu — and for anything that
    // ALREADY carries one, so a stakeholder or a decision can never become
    // invisible because the thing it is attached to changed kind.
    {
      const stakes = stakeholdersOf(session.state(), n);
      const container = isContainer(n) && !n.trashed && !n.onMenu;
      grp('#detail-stakeholder-group', container || stakes.length > 0);
      // Visibility asks the SAME reader as the content (1.9.2). `n.decisions`
      // alone would hide the group on a survivor whose only decisions came
      // from something folded into it — the list full and the group closed.
      grp('#detail-decision-group', container || decisionsFor(session.state(), n).length > 0);
      // The editor goes when a thing is let go; the record stays readable.
      show('#detail-decision-set', !n.trashed);
      if (decisionInput) decisionInput.hidden = n.trashed;
      paintMeeting(n);
    }
    // Someone asked (1.8.0, ADR-0056). Hidden on Menu items — park is a
    // demand clock and the gate's belt refuses it on a wish, so the verb is
    // never offered where it cannot land — and on people and resume cards.
    {
      const canDecline = !n.trashed && !n.mergedInto && n.onMenu === null
        && !['person', 'resume-card'].includes(n.kind);
      grp('#detail-request-group', canDecline);
      if (canDecline) paintRequest(n);
    }
    // The fold verb (1.7.0): only for a thing that is its own thing. A merged
    // node shows the way BACK instead, and the survivor lists what it holds.
    grp('#detail-merge-group', !n.trashed && !n.mergedInto);
    grp('#detail-unmerge-group', Boolean(n.mergedInto));
    if (!n.trashed && !n.mergedInto) paintMergeTargets(n);
    {
      // TRANSITIVE (1.9.2): in a chain A -> B -> C, one hop left A's "split it
      // back out" reachable from no surface at all. ADR-0053 says the way back
      // must outlive the sitting — for every node in the chain, not just the last.
      const folded = foldedIntoDeep(session.state(), n.id);
      grp('#detail-merged-group', folded.length > 0);
      if (mergedList) {
        mergedList.replaceChildren(...folded.map(f => {
          const li = document.createElement('li');
          li.className = 'detail-feed';
          const label = document.createElement('span');
          label.textContent = f.title || '(untitled)';
          const split = document.createElement('button');
          split.type = 'button';
          split.className = 'ghost';
          split.textContent = 'Split it back out';
          split.setAttribute('aria-label', `Split ${f.title || '(untitled)'} back out`);
          split.addEventListener('click', () => {
            void run(ctx => unmergeEvents(ctx, f.id), 'Split back out — its own thing again.');
          });
          li.append(label, split);
          return li;
        }));
      }
    }
    // Composed Today's verb (1.6.0): only when the module is on, only for
    // choosable things. At the cap the button says so and disables — a
    // control that would fail after the tap is a control that lies.
    {
      const stNow = session.state();
      const on = todayIsOn(stNow) && choosable(n);
      grp('#detail-today-group', on);
      if (on) {
        const iso = new Date(now()).toISOString();
        const chosenNow = chosenToday(stNow, n.id, iso, session.zone);
        show('#detail-today-add', !chosenNow);
        show('#detail-today-remove', chosenNow);
        const add = btn('#detail-today-add');
        if (add && !chosenNow) {
          const full = composedFull(stNow, iso, session.zone);
          add.disabled = full;
          add.textContent = full ? 'Today is full — a hand fits five' : 'Put it in today';
        } else if (add) {
          add.disabled = false;
          add.textContent = 'Put it in today';
        }
      }
    }
    show('#detail-date-clear', Boolean(n.clocks.due));
    show('#detail-start-clear', Boolean(n.clocks.start));
    show('#detail-repeat-stop', repeats);
    show('#detail-done', !n.lastDone && !n.trashed);
    show('#detail-undone', Boolean(n.lastDone));
    show('#detail-menu', !n.onMenu && !n.trashed);
    show('#detail-promote', Boolean(n.onMenu));
    show('#detail-trash', !n.trashed);
    show('#detail-untrash', n.trashed);
    // "On its own" only when there is something to come out of, and the promote
    // to a container only when it is not one already — the same rule as every
    // other control here: never offer what this item cannot do.
    // Save-for numbers, only for a Menu item in that category — a target on
    // something you are not saving for is a field with nothing to mean.
    const saveGroup = q('#detail-savefor-group');
    if (saveGroup) {
      const isSaveFor = n.onMenu === 'save-for';
      saveGroup.hidden = !isSaveFor;
      if (isSaveFor) {
        const t = q<HTMLInputElement>('#detail-save-target');
        const v = q<HTMLInputElement>('#detail-save-saved');
        // Do NOT clobber what someone is part-way through typing — the same
        // rule the rename box already carries, for the same reason.
        if (t && document.activeElement !== t) t.value = n.saveTarget != null ? String(n.saveTarget) : '';
        if (v && document.activeElement !== v) v.value = n.saveSaved != null ? String(n.saveSaved) : '';
      }
    }

    show('#detail-unparent', Boolean(n.parent));
    show('#detail-make-project', !isContainer(n) && !n.trashed);
    // History stays live while its disclosure is open — a commit from this
    // sheet should show its own line the moment it lands.
    if (historyEl?.open) buildHistory(n.id);
    // The track role and the answer-owed date belong to containers only: a role
    // on a single action would be a label with nothing under it to govern.
    // `!n.onMenu`: a Menu-resident container must not offer the answer-owed
    // date — the gate's Menu belt would refuse it, and offering a choice the
    // gate refuses is the recorded anti-pattern (audit; ADR-0038).
    const container = isContainer(n) && !n.trashed && !n.onMenu;
    const trackRow = q('#detail-track-row');
    const suspRow = q('#detail-suspense-row');
    if (trackRow) trackRow.hidden = !container;
    if (suspRow) suspRow.hidden = !container;
    show('#detail-track', container && n.role !== 'track');
    show('#detail-untrack', container && n.role === 'track');
    const susp = q<HTMLInputElement>('#detail-suspense');
    if (susp && n.clocks.suspense) susp.value = localDayKey(n.clocks.suspense.at, session.zone);
  }

  /** A positive whole number, or null. A blank or nonsense box must not become
   *  NaN in the log — a NaN cadence made an item shout the loudest phrase in the
   *  app and, worse, could make it un-completable (audit). */
  const positiveInt = (el: HTMLInputElement): number | null => {
    const v = Number(el.value);
    return Number.isFinite(v) && Number.isInteger(v) && v > 0 ? v : null;
  };

  const doRename = (): void => {
    const next = NAME.value.trim();
    if (!next) { say('It needs to say something.'); return; }
    if (next === current?.title) { say('That is what it already says.'); return; }
    void run(ctx => renameEvents(ctx, current!.id, next), `Now reads "${next}".`);
  };
  btn('#detail-rename')?.addEventListener('click', doRename);
  NAME.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') { e.preventDefault(); doRename(); }
  });

  btn('#detail-date-set')?.addEventListener('click', () => {
    const key = DATE.value;
    // A date input yields '' when empty or invalid; nothing is a legal answer.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) { say('Pick a date first.'); return; }
    void run(ctx => setDueEvents(ctx, current!.id, key), `Due ${key}.`);
  });
  btn('#detail-date-clear')?.addEventListener('click', () => {
    void run(ctx => clearDueEvents(ctx, current!.id), 'Date removed — it comes back to you today.');
  });
  btn('#detail-start-set')?.addEventListener('click', () => {
    const key = startInput?.value ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) { say('Pick a day first.'); return; }
    void run(ctx => setStartEvents(ctx, current!.id, key),
      `Out of the way until ${key} — it comes back on its own.`);
  });
  btn('#detail-start-clear')?.addEventListener('click', () => {
    void run(ctx => clearStartEvents(ctx, current!.id),
      'Cleared — it is back with you today.');
  });
  btn('#detail-estimate-set')?.addEventListener('click', () => {
    if (!estimateInput) return;
    const v = Number(estimateInput.value);
    if (!Number.isInteger(v) || v < 1) { say('Whole minutes, at least 1.'); return; }
    void run(ctx => estimateEvents(ctx, current!.id, v), 'Noted — nothing checks up on it.');
  });
  btn('#detail-merge-set')?.addEventListener('click', () => {
    if (!mergeSel || !current) return;
    const targetId = mergeSel.value;
    if (!targetId) { say('Pick the one that stays first.'); return; }
    // Fresh on BOTH sides — the sheet can sit open while the world moves.
    const st = session.state();
    const source = st.nodes.get(current.id);
    const target = st.nodes.get(targetId);
    if (!source || source.trashed || source.mergedInto
      || !target || target.trashed || target.mergedInto) {
      say('One of them changed while this was open — pick again.');
      paintMergeTargets(current);
      return;
    }
    // The SECOND lock (1.9.2). Legality was computed when the list was built,
    // but the sheet can sit open while the world moves — the target may have
    // gone onto the Menu since. Ask the gate's own predicate again rather than
    // hand it a batch it must refuse.
    if (!canHold(target, source)) {
      say('That one is on the list of wishes now — a wish holds no demands.');
      paintMergeTargets(current);
      return;
    }
    const title = target.title || '(untitled)';
    // Built once so the words can name what could not come across. A skip
    // nobody is told about is the silent swallow this release exists to end.
    let skippedFeeds = 0;
    void run(ctx => {
      const plan = mergePlan(ctx, session.state(), source, target);
      skippedFeeds = plan.skipped.feeds.length;
      return plan.events;
    }, () => skippedFeeds === 0
      ? `Folded into “${title}”. Splitting it back out is right below.`
      : `Folded into “${title}”. One thing it fed could not come across — `
        + 'that would have made two things each wait for the other.');
  });
  btn('#detail-unmerge')?.addEventListener('click', () => {
    void run(ctx => unmergeEvents(ctx, current!.id),
      'Split back out — its own thing again, with a clock of its own.');
  });
  // Someone asked (1.8.0). Fresh on commit — the node the batch is built from
  // is live state's, never the stale copy the sheet opened with.
  btn('#detail-decline')?.addEventListener('click', () => {
    void run(ctx => {
      const st = session.state();
      const fresh = st.nodes.get(current!.id);
      return fresh ? declineEvents(ctx, st, fresh) : [];
    }, 'Declined — kept in the Not Now ledger. Nothing will chase you.');
  });
  btn('#detail-carry')?.addEventListener('click', () => {
    void run(ctx => carryEvents(ctx, current!.id),
      'Carried after all — its own thing again, back with you today.');
  });
  // What was decided (1.9.0). Empty writes nothing — unlike a note, an empty
  // decision is not the honest removal of anything.
  btn('#detail-decision-set')?.addEventListener('click', () => {
    if (!decisionInput || !current) return;
    if (!cleanNote(decisionInput.value)) { say('It needs to say something.'); return; }
    const text = decisionInput.value;
    void run(ctx => logDecisionEvents(ctx, current!.id, text), 'Logged. It stays as written.')
      .then(() => { decisionInput.value = ''; });
  });
  btn('#detail-slot-park')?.addEventListener('click', () => {
    void run(ctx => parkToSlotEvents(ctx, session.state(), current!.id),
      'Parked until the request slot.');
  });
  mergeFilter?.addEventListener('input', () => {
    if (current && !current.trashed && !current.mergedInto) paintMergeTargets(current);
  });

  btn('#detail-today-add')?.addEventListener('click', () => {
    void run(ctx => chooseTodayEvents(ctx, current!.id), 'Chosen for today.');
  });
  btn('#detail-today-remove')?.addEventListener('click', () => {
    void run(ctx => releaseTodayEvents(ctx, current!.id), 'Out of today — nothing is counted.');
  });
  btn('#detail-note-set')?.addEventListener('click', () => {
    if (!noteInput || !current) return;
    const clean = cleanNote(noteInput.value);
    // No event for no change — the log must not carry claims about changes
    // that did not happen (the same rule makeRepeatEvents follows).
    const had = noteOf(session.state().nodes.get(current.id) ?? current) ?? '';
    if (clean === had) { say(clean ? 'Already kept.' : 'Nothing to keep yet.'); return; }
    void run(ctx => noteEvents(ctx, current!.id, noteInput.value),
      clean ? 'Kept with it.' : 'Note removed.');
  });
  btn('#detail-repeat-set')?.addEventListener('click', () => {
    const i = positiveInt(EVERY), c = positiveInt(SLACK);
    if (i === null || c === null) { say('Both numbers need to be whole days, at least 1.'); return; }
    void run(ctx => makeRepeatEvents(ctx, current!.id, current!.kind, i, c), `Repeats every ${i} days.`);
  });
  btn('#detail-repeat-stop')?.addEventListener('click', () => {
    void run(ctx => stopRepeatEvents(ctx, current!.id), 'It no longer repeats.');
  });
  btn('#detail-done')?.addEventListener('click', () => {
    void run(ctx => doneEvents(ctx, current!.id), 'Done.');
  });
  btn('#detail-undone')?.addEventListener('click', () => {
    void run(ctx => undoneEvents(ctx, current!.id), 'Back on the list.');
  });
  btn('#detail-menu')?.addEventListener('click', () => {
    void run(ctx => toMenuEvents(ctx, current!.id), 'On the Menu — no clock, no demand.');
  });
  btn('#detail-promote')?.addEventListener('click', () => {
    void run(ctx => promoteFromMenuEvents(ctx, current!.id), 'Brought back as real work.');
  });
  btn('#detail-trash')?.addEventListener('click', () => {
    void run(ctx => [{
      id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
      kind: 'node.trashed', node: current!.id, payload: { reason: 'detail' },
    } as never], 'Let go. You can still keep it after all.');
  });
  btn('#detail-untrash')?.addEventListener('click', () => {
    void run(ctx => untrashEvents(ctx, current!.id), 'Kept.');
  });
  btn('#detail-feeds-set')?.addEventListener('click', () => {
    if (!FEEDS || !LEAD || !current) return;
    const target = FEEDS.value;
    if (!target) { say('Pick what this holds up first.'); return; }
    const lead = positiveInt(LEAD);
    if (lead === null) { say('How many days does this take? A whole number, at least 1.'); return; }
    const title = session.state().nodes.get(target)?.title || 'it';
    void run(ctx => declareFeedsEvents(ctx, current!.id, target, lead), `Linked to ${title}.`);
  });

  btn('#detail-parent-set')?.addEventListener('click', () => {
    if (!PARENT || !current) return;
    const target = PARENT.value;
    if (!target) { say('Pick what it is part of first.'); return; }
    const title = session.state().nodes.get(target)?.title || 'it';
    const prior = current.parent;
    void run(ctx => parentEvents(ctx, current!.id, target, prior), `Now part of ${title}.`);
  });
  btn('#detail-unparent')?.addEventListener('click', () => {
    if (!current) return;
    const prior = current.parent;
    void run(ctx => unparentEvents(ctx, current!.id, prior),
      'On its own again — it still comes back to you.');
  });
  // Narrowing repaints the options live; creating makes the typed place real
  // and files this under it, one gated commit — the gate cures the fresh
  // container with a same-day clock exactly as it cures any creation.
  parentFilter?.addEventListener('input', () => { if (current) paintParents(current); });
  parentCreate?.addEventListener('click', () => {
    if (!current || !parentFilter) return;
    const title = cleanTitle(parentFilter.value);
    if (!title) return;
    const prior = current.parent;
    parentFilter.value = '';
    void run(ctx => createParentEvents(ctx, current!.id, title, prior),
      `Made “${title}” and put this under it.`);
  });
  btn('#detail-make-project')?.addEventListener('click', () => {
    if (!current) return;
    void run(ctx => makeContainerEvents(ctx, current!.id, current!.kind),
      'It can hold other things now.');
  });

  btn('#detail-person-set')?.addEventListener('click', () => {
    if (!PERSON || !RELATION || !current) return;
    const name = PERSON.value.trim();
    if (!name) { say('A name first — or leave it, nobody has to be named.'); return; }
    const relation = RELATION.value;
    const st = session.state();
    // Match an existing person by name before minting a second node for the same
    // human. Case-insensitive, because "sam" and "Sam" are one person and a
    // duplicate here would split what you are owed across two rows for ever.
    const existing = peopleNodes(st).find(p => (p.title || '').toLowerCase() === name.toLowerCase());
    PERSON.value = '';
    void run(ctx => {
      const id = existing?.id ?? ctx.id();
      return linkPersonEvents(ctx, current!.id, id, relation, {
        ...(existing ? {} : { createNamed: name }),
        openWaiting: relation === 'waiting-on',
        forWhat: current!.title,
      });
    }, `With ${name}.`);
  });

  btn('#detail-track')?.addEventListener('click', () => {
    void run(ctx => setTrackRoleEvents(ctx, current!.id, 'track'),
      'You are carrying this, not doing it. Nothing under it will be offered as your next step.');
  });
  btn('#detail-untrack')?.addEventListener('click', () => {
    void run(ctx => setTrackRoleEvents(ctx, current!.id, 'execute'), 'Back to yours to do.');
  });
  btn('#detail-suspense-set')?.addEventListener('click', () => {
    const key = q<HTMLInputElement>('#detail-suspense')?.value ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) { say('Pick a date first.'); return; }
    void run(ctx => setSuspenseEvents(ctx, current!.id, key), `Answer owed by ${key}.`);
  });

  btn('#detail-save-set')?.addEventListener('click', () => {
    if (!current) return;
    // An empty box means "not said", not zero. `Number('')` is 0, which would
    // silently record that a thing costs nothing.
    const read = (sel: string): number | null => {
      const el = q<HTMLInputElement>(sel);
      const raw = (el?.value ?? '').trim();
      if (raw === '') return null;
      const num = Number(raw);
      return Number.isFinite(num) && num >= 0 ? num : null;
    };
    void run(ctx => setSaveForEvents(ctx, current!.id, read('#detail-save-target'), read('#detail-save-saved')),
      'Noted.');
  });

  btn('#detail-close')?.addEventListener('click', () => DLG.close());

  // --- what happened to this (1.4.0) ----------------------------------------
  // The log filtered to this one node, in the shared plain words, cures
  // indented under their cause. Built on first open of the disclosure and
  // rebuilt after each commit while it stays open — never before: reading the
  // whole log for a closed <details> would be the coverage-list bug again.
  const historyEl = q<HTMLDetailsElement>('#detail-history');
  const historyLines = q<HTMLElement>('#detail-history-lines');
  const buildHistory = (id: string): void => {
    if (!historyLines) return;
    void session.store.all().then(all => {
      // The sheet may have moved on while the read was in flight.
      if (!current || current.id !== id) return;
      const st = session.state();
      const titleOf = (x: string): string | null => st.nodes.get(x)?.title || null;
      historyLines.replaceChildren(...all.filter(e => e.node === id).map(e => {
        const li = document.createElement('li');
        li.className = isCure(e) ? 'log-line log-cure' : 'log-line';
        const day = new Date(e.at).toLocaleDateString(undefined, {
          weekday: 'short', day: 'numeric', month: 'short', timeZone: session.zone,
        });
        li.textContent = `${eventWords(e, session.zone, titleOf)} — ${day}.`;
        return li;
      }));
    });
  };
  historyEl?.addEventListener('toggle', () => {
    if (historyEl.open && current) buildHistory(current.id);
  });

  /** Show a node in this sheet. Named so the sheet's own rows can walk to
   *  another node — a person, a folded twin — without leaving it (1.12.0). */
  function showNode(node: NodeState): void {
    // A different item starts with its history folded away — leaving the
    // last item's lines under a fresh title would be the sheet lying.
    if (historyEl && current?.id !== node.id) {
      historyEl.open = false;
      historyLines?.replaceChildren();
    }
    render(node);
    LIVE.textContent = '';
    if (!DLG.open) DLG.showModal();
  }

  return { open: showNode };
}
