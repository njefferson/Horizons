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
import type { NodeState } from '../fold.ts';
import { localDayKey } from '../time.ts';
import { pressureOf, pressureWords } from '../pressure.ts';
import {
  setDueEvents, clearDueEvents, makeRepeatEvents, stopRepeatEvents,
  undoneEvents, untrashEvents, promoteFromMenuEvents, toMenuEvents, renameEvents,
} from './detail-intents.ts';
import { doneEvents } from './work.ts';
import { declareFeedsEvents, releaseFeedsEvents } from './detail-intents.ts';
import { makeContainerEvents, parentEvents, unparentEvents } from './detail-intents.ts';
import { linkPersonEvents, closeWaitingEvents } from './detail-intents.ts';
import { setTrackRoleEvents, setSuspenseEvents } from './detail-intents.ts';
import { setSaveForEvents } from './detail-intents.ts';
import { people as peopleNodes, withWhom, openDays, waitingWords, isOpenWaiting } from '../people.ts';
import { dependencyView, dependencyWords, wouldCycle } from '../dependencies.ts';
import { legalParents, childrenOf, placeWords, isContainer } from '../tree.ts';

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
  const personInput = q<HTMLInputElement>('#detail-person');
  const relationSel = q<HTMLSelectElement>('#detail-relation');
  const peopleData = q<HTMLDataListElement>('#detail-people');
  const peopleList = q('#detail-people-list');
  const placeLine = q('#detail-place');
  const kidsList = q('#detail-children');
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

  /** Say it where it can be seen AND where it can be heard. A failure reported
   *  only to a visually-hidden region is a failure a sighted user never learns
   *  about (F-08). */
  const say = (msg: string): void => { LIVE.textContent = msg; STATE.textContent = msg; };

  /** Commit, then re-read the node from fresh state — never from the stale copy
   *  the sheet was opened with, which would render yesterday's answer. */
  const run = async (make: Parameters<Session['commit']>[0], announce: string): Promise<void> => {
    if (!current || busy) return;
    busy = true;
    const id = current.id;
    try {
      await session.commit(make);
      LIVE.textContent = announce;
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
    if (n.onMenu) bits.push('on the Menu');
    if (n.lastDone) bits.push('done');
    if (n.kind === 'upkeep' && n.intervalDays) bits.push(`repeats every ${n.intervalDays} days`);
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
    if (n.intervalDays && n.intervalDays > 0) EVERY.value = String(n.intervalDays);
    if (n.comfortWindowDays && n.comfortWindowDays > 0) SLACK.value = String(n.comfortWindowDays);

    // Who it is with (the person lens's write side).
    if (PERSON && PEOPLE && PEOPLE_LIST) {
      const st = session.state();
      // The datalist offers names already in this vault, so the second thing you
      // link to Sam does not become a second Sam through a typo.
      PEOPLE.replaceChildren(...peopleNodes(st).map(p =>
        Object.assign(document.createElement('option'), { value: p.title || '' })));

      PEOPLE_LIST.replaceChildren(...n.people.map(l => {
        const li = document.createElement('li');
        li.className = 'detail-feed';
        const label = document.createElement('span');
        const who = st.nodes.get(l.person)?.title || '(unnamed)';
        label.textContent = `${who} — ${RELATION_WORDS[l.relation] ?? l.relation}`;
        li.append(label);
        return li;
      }));

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
      const legal = legalParents(st, n);
      const keep = PARENT.value;
      PARENT.replaceChildren(...[
        Object.assign(document.createElement('option'), {
          value: '',
          // The empty option's words change with what is actually possible. A
          // fixed "pick one" over an empty list tells someone to do something
          // the app cannot let them do yet.
          textContent: legal.length ? 'pick something' : 'nothing to put it under yet',
        }),
        ...legal.map(t => Object.assign(document.createElement('option'), {
          value: t.id, textContent: t.title || '(untitled)',
        })),
      ]);
      if (legal.some(t => t.id === keep)) PARENT.value = keep;
      PARENT.disabled = legal.length === 0;

      const place = placeWords(st, n);
      PLACE.textContent = place ?? '';
      PLACE.hidden = !place;

      // What it holds, shown on the sheet of the thing that holds it — because
      // "is anything actually under this" is the question Review answers from
      // the outside, and someone looking at the container deserves the same
      // answer without being sent anywhere.
      const kids = childrenOf(st, n.id);
      KIDS.replaceChildren(...kids.map(k => {
        const li = document.createElement('li');
        li.className = 'detail-feed';
        const label = document.createElement('span');
        label.textContent = k.title || '(untitled)';
        li.append(label);
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
    show('#detail-date-clear', Boolean(n.clocks.due));
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
    // The track role and the answer-owed date belong to containers only: a role
    // on a single action would be a label with nothing under it to govern.
    const container = isContainer(n) && !n.trashed;
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

  return {
    open(node: NodeState): void {
      render(node);
      LIVE.textContent = '';
      if (!DLG.open) DLG.showModal();
    },
  };
}
