// Every projection, over a set with everything in it (1.16.0, ADR-0067).
//
// A requirement: generate enough test data across every category and type to
// surface real data errors. This is the half that finds them unprompted.
//
// The unit tests in this repo are precise and narrow: each one stages the two or
// three nodes its subject needs. That is the right shape for proving a rule, and
// it is exactly the wrong shape for finding the class of defect that only shows
// up when a surface meets a kind of data its author never pictured — a journal
// entry with no title, a person with an apostrophe, a date four hundred days
// out, a merge three deep, a container with thirty-one children.
//
// So this does the opposite. One store with everything in it, every exported
// projection run over it, and the assertions are about what a person must never
// be shown: a number that is `NaN`, a date that is `Invalid Date`, a name that
// is `undefined`, an object rendered as `[object Object]`, a cap that states a
// total it does not have.
//
// It is deliberately not clever. Breadth is the whole contribution.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bigSampleEvents, bigSampleSummary, bigSampleWords, BIG_SAMPLE_PASSPHRASE } from '../src/big-sample.ts';
import { admit, coverageGauge, gateOptionsFor, heldNodes, heldWork, silentNodes, trashedNodes } from '../src/gate.ts';
import { fold, type State } from '../src/fold.ts';
import { heldGroups, placeWords, undatedCount } from '../src/held.ts';
import { nextUp, nextUpQueue, workSurface } from '../src/nextup.ts';
import { offerNow, offerWords } from '../src/offer.ts';
import { loadNow, loadWords, pebbleWords } from '../src/load.ts';
import { menuGroups, menuCount, saveFors, saveForWords } from '../src/menu.ts';
import { contextWords, replanAll } from '../src/replan.ts';
import { reviewExceptions } from '../src/review.ts';
import { searchHeld } from '../src/search.ts';
import { trackPortfolio, trackWords, portfolioWords } from '../src/portfolio.ts';
import { people, personView, waitingOnAnyone, personName, waitingWords, withWhom, stakeholdersOf, stakeholderWords } from '../src/people.ts';
import { dependencyView, dependencyWords } from '../src/dependencies.ts';
import { deltaBetween, periodWords, renderReport } from '../src/delta.ts';
import { moreWords, snapshotWords, todayCard } from '../src/today.ts';
import { composedFor } from '../src/composed.ts';
import { ledgerRowWords, notNowLedger } from '../src/requests.ts';
import { treeRows, roots } from '../src/tree-view.ts';
import { toCalendar, calendarCount } from '../src/ics.ts';
import { eventWords } from '../src/log-words.ts';
import { journalEntries, deriveKey, journalSeal } from '../src/journal.ts';
import { open } from '../src/seal.ts';
import { pressureOf, pressureWords } from '../src/pressure.ts';
import { serialiseState, deserialiseState } from '../src/snapshot.ts';
import { inspectExport, toJsonl } from '../src/portability.ts';
import { localDayKey } from '../src/time.ts';
import type { AppEvent } from '../src/events.ts';

const TZ = 'America/Denver';
const NOW = '2026-08-03T18:00:00.000Z';

/** Built ONCE. Deriving the journal key is PBKDF2 at 600,000 iterations, and
 *  paying that per test would make this file the slowest thing in the suite for
 *  no benefit — the set is deterministic, so one build is every build. */
let cached: { events: AppEvent[]; admitted: AppEvent[]; state: State } | null = null;
async function built(): Promise<{ events: AppEvent[]; admitted: AppEvent[]; state: State }> {
  if (cached) return cached;
  let n = 0, s = 0;
  const ctx = {
    at: NOW, device: 'big-sample', vault: 'personal', zone: TZ,
    seq: () => s++, id: () => `g${n++}`,
  };
  const events = await bigSampleEvents(ctx, NOW);
  const admitted = admit(events, fold([]), gateOptionsFor(TZ));
  cached = { events, admitted, state: fold(admitted) };
  return cached;
}

/**
 * The strings a person must never be shown.
 *
 * Every one of these is what a real defect looks like by the time it reaches a
 * surface: a missing field rendered rather than guarded, a date parsed from
 * something that was not one, an object where a name should be. `null` is
 * included as a WORD — the four characters in rendered text, not the value.
 */
const BROKEN = /\bundefined\b|\bNaN\b|Invalid Date|\[object Object\]|\bnull\b/;

/**
 * One thing a person is shown, with the name of what produced it.
 *
 * **Strings only, and that is a correction rather than a simplification.** The
 * first version of this stringified whole `NodeState` objects, and every one of
 * them legitimately contains `"parent":null` — so the sweep reported 94 hits, all
 * of them its own instrumentation, and none of them anything a person would ever
 * see. A check that flags its own scaffolding teaches you to ignore it. What
 * belongs here is RENDERED TEXT: the words a surface puts on the screen.
 */
const say = (label: string, value: string | number | null | undefined): { label: string; text: string } => ({
  label, text: value === null || value === undefined ? '' : String(value),
});

// --- the set itself ---------------------------------------------------------

test('big-sample: every event passes the real write boundary', async () => {
  const { events, admitted } = await built();
  for (const e of events) {
    assert.ok(admitted.some(a => a.id === e.id), `${e.kind} was refused`);
  }
  assert.ok(events.length > 1000, `only ${events.length} events`);
});

test('big-sample: it leaves nothing silent, so the file is importable at all', async () => {
  // `inspectExport` refuses a file that folds to even one silent node, so this
  // is not a nicety — a set that fails it cannot be brought in.
  const { state } = await built();
  assert.deepEqual(silentNodes(state).map(n => `${n.kind}:${n.title}`), []);
});

test('big-sample: the file it produces is one the app will accept', async () => {
  const { admitted } = await built();
  const file = {
    format: 'planner-log', version: 1, at: NOW, scope: 'sample-set',
    encrypted: false, logJsonl: toJsonl(admitted), snapshot: null,
  };
  const summary = inspectExport(file);
  assert.deepEqual(summary.refusals, [], 'the app refuses its own generated set');
  assert.ok(summary.items > 300, `only ${summary.items} things`);
});

test('big-sample: it is big enough to clear every cap in the app', async () => {
  const { state } = await built();
  // Each of these is 25 somewhere in the app, and a cap that is never reached is
  // a "N of M" line nobody has ever seen render.
  assert.ok(heldWork(state).length > 300, `only ${heldWork(state).length} held as work`);
  assert.ok(trashedNodes(state).length > 25, `only ${trashedNodes(state).length} trashed`);
  assert.ok(notNowLedger(state).length > 25, `only ${notNowLedger(state).length} declines`);
  assert.ok(searchHeld(state, 'the').total > 25, 'a common word does not exceed the search cap');
  const overCap = [...state.nodes.values()].filter(n =>
    [...state.nodes.values()].filter(c => c.parent === n.id).length > 25);
  assert.ok(overCap.length >= 1, 'no container holds more than the tree branch cap');
});

test('big-sample: two runs are identical, or a finding cannot be reproduced', async () => {
  let n = 0, s = 0;
  const mk = () => ({ at: NOW, device: 'd', vault: 'personal', zone: TZ, seq: () => s++, id: () => `x${n++}` });
  const a = await bigSampleEvents(mk(), NOW);
  n = 0; s = 0;
  const b = await bigSampleEvents(mk(), NOW);
  // Ciphertext differs by design — a fresh IV per seal — so compare everything
  // else. A generator that produced a different SHAPE twice would make every
  // failure below unreproducible.
  const shape = (xs: AppEvent[]) => xs.map(e => `${e.kind}:${e.node}`).join('|');
  assert.equal(shape(a), shape(b));
});

test('big-sample: generated a year apart it describes the same relative situation', async () => {
  // The property `sample.test.ts` pins for the small set, at this scale. A
  // fixture with a literal date in it exercises the wrong code paths.
  const mk = () => { let n = 0, s = 0; return { at: NOW, device: 'd', vault: 'personal', zone: TZ, seq: () => s++, id: () => `y${n++}` }; };
  const A = '2026-08-03T18:00:00.000Z', B = '2027-12-11T18:00:00.000Z';
  const one = fold(admit(await bigSampleEvents({ ...mk(), at: A }, A), fold([]), gateOptionsFor(TZ)));
  const two = fold(admit(await bigSampleEvents({ ...mk(), at: B }, B), fold([]), gateOptionsFor(TZ)));
  const shape = (st: State, at: string) => ({
    replan: replanAll(st, at, TZ).length,
    menu: menuGroups(st).reduce((n, g) => n + g.items.length, 0),
    waiting: waitingOnAnyone(st, at, TZ).length,
    gauge: coverageGauge(st).total,
  });
  assert.deepEqual(shape(one, A), shape(two, B));
});

// --- THE SWEEP --------------------------------------------------------------

test('big-sample: NO PROJECTION RENDERS A BROKEN STRING', async () => {
  const { state, admitted } = await built();
  const said: { label: string; text: string }[] = [];

  // Every list surface, and the words each row states about itself.
  for (const g of heldGroups(state, NOW, TZ)) {
    said.push(say(`heldGroups.${g.key}.title`, g.title));
    for (const n of g.items) {
      said.push(say(`held.${n.id}.pressure`, pressureWords(pressureOf(n, NOW, TZ))));
      said.push(say(`held.${n.id}.place`, placeWords(n, state, new Map())));
      said.push(say(`held.${n.id}.withWhom`, withWhom(state, n)));
    }
  }
  said.push(say('offer.words', offerWords(offerNow(state, NOW, TZ))));
  said.push(say('load.words', loadWords(loadNow(state))));
  for (const p of loadNow(state).pebbles) said.push(say(`pebble.${p.id}`, pebbleWords(state, p)));
  for (const q of nextUpQueue(state, NOW, TZ)) said.push(say(`nextup.${q.node.id}.words`, q.words));
  said.push(say('nextup.head', nextUp(state, NOW, TZ).head?.words ?? ''));
  for (const c of workSurface(state, NOW, TZ).chips) said.push(say(`chip.${c.node.id}`, c.words));
  said.push(say('undatedCount', undatedCount(state, NOW, TZ)));

  for (const g of menuGroups(state)) said.push(say(`menu.${g.category}`, g.title));
  for (const sf of saveFors(state)) said.push(say(`saveFor.${sf.node.id}`, saveForWords(sf)));
  said.push(say('menuCount', menuCount(state)));

  for (const c of replanAll(state, NOW, TZ)) {
    said.push(say(`replan.${c.node.id}.title`, c.node.title));
    said.push(say(`replan.${c.node.id}.context`, contextWords(c, TZ)));
  }
  for (const e of reviewExceptions(state, NOW, TZ).shown) said.push(say(`review.${e.node.id}`, e.words));

  for (const l of trackPortfolio(state, NOW, TZ)) said.push(say(`portfolio.${l.node.id}`, trackWords(l)));
  said.push(say('portfolioWords', portfolioWords(trackPortfolio(state, NOW, TZ).length)));

  for (const p of people(state)) {
    said.push(say(`personName.${p.id}`, personName(state, p.id)));
    const v = personView(state, p.id, NOW, TZ);
    for (const line of [...(v?.owes ?? []), ...(v?.involves ?? [])]) {
      said.push(say(`personView.${p.id}.row`, line.node.title));
      said.push(say(`personView.${p.id}.waited`, waitingWords(line.days)));
    }
  }
  for (const l of waitingOnAnyone(state, NOW, TZ)) {
    said.push(say(`waiting.${l.node.id}`, `${l.node.title} — ${waitingWords(l.days) ?? ''}`));
  }
  for (const n of heldWork(state)) {
    const st = stakeholdersOf(state, n);
    if (st.length) said.push(say(`stakeholders.${n.id}`, stakeholderWords(st.map(x => x.title))));
    said.push(say(`deps.${n.id}`, dependencyWords(dependencyView(state, n, NOW, TZ))));
  }

  for (const r of treeRows(state)) {
    said.push(r.kind === 'node'
      ? say(`tree.${r.node.id}`, r.node.title)
      : say(`tree.more.${r.parent.id}`, `${r.hidden} more`));
  }
  said.push(say('roots', roots(state).length));
  for (const r of notNowLedger(state)) {
    said.push(say(`ledger.${r.node.id}`, ledgerRowWords(r, id => state.nodes.get(id)?.title ?? null, TZ, NOW)));
  }
  for (const n of trashedNodes(state)) said.push(say(`trash.${n.id}`, n.title));
  for (const n of composedFor(state, NOW, TZ)) said.push(say(`composed.${n.id}`, n.title));
  const card = todayCard(state, NOW, TZ);
  said.push(say('todayCard.head', card.head ? `${card.head.title} — ${card.head.why}` : ''));
  for (const a of card.also) said.push(say('todayCard.also', a));
  for (const w of card.withOthers) said.push(say('todayCard.withOthers', `${w.title} — ${w.whom ?? ''} ${w.how ?? ''}`));
  said.push(say('todayCard.moreWords', moreWords(card.alsoTotal, card.also.length)));
  said.push(say('todayCard.snapshotWords', snapshotWords(card.day)));
  said.push(say('calendar', toCalendar(state, NOW, TZ)));
  said.push(say('calendarCount', calendarCount(state, NOW, TZ)));
  for (const hit of searchHeld(state, 'the').items) said.push(say('search.row', hit.title));

  // The one document that leaves the device, in all three formats.
  const report = deltaBetween(fold([]), state, null, NOW, TZ);
  said.push(say('report.period', periodWords(report.since, TZ)));
  for (const f of ['markdown', 'clipboard', 'csv', 'print'] as const) {
    said.push(say(`report.${f}`, renderReport(report, f, TZ)));
  }

  // And the log viewer, over every single event — the totality case.
  for (const e of admitted) {
    said.push(say(`eventWords.${e.kind}`, eventWords(e, TZ, id => state.nodes.get(id)?.title ?? null)));
  }

  const broken = said.filter(x => BROKEN.test(x.text));
  assert.deepEqual(
    broken.slice(0, 12).map(x => `${x.label}: ${x.text.slice(0, 120)}`), [],
    `${broken.length} projection(s) rendered a broken string`,
  );
  assert.ok(said.length > 2000, `the sweep only looked at ${said.length} things`);
});

test('big-sample: nothing throws, at scale, on any projection', async () => {
  const { state } = await built();
  // Separate from the sweep above on purpose: a throw stops that test at the
  // first bad projection and hides every one after it.
  const runs: [string, () => unknown][] = [
    ['heldGroups', () => heldGroups(state, NOW, TZ)],
    ['nextUp', () => nextUp(state, NOW, TZ)],
    ['offerNow', () => offerNow(state, NOW, TZ)],
    ['replanAll', () => replanAll(state, NOW, TZ)],
    ['reviewExceptions', () => reviewExceptions(state, NOW, TZ)],
    ['trackPortfolio', () => trackPortfolio(state, NOW, TZ)],
    ['waitingOnAnyone', () => waitingOnAnyone(state, NOW, TZ)],
    ['treeRows', () => treeRows(state)],
    ['todayCard', () => todayCard(state, NOW, TZ)],
    ['toCalendar', () => toCalendar(state, NOW, TZ)],
    ['notNowLedger', () => notNowLedger(state)],
    ['trashedNodes', () => trashedNodes(state)],
    ['searchHeld', () => searchHeld(state, 'e')],
    ['snapshot round trip', () => deserialiseState(serialiseState(state))],
  ];
  for (const [name, run] of runs) {
    assert.doesNotThrow(() => run(), `${name} threw on the full set`);
  }
});

test('big-sample: the snapshot round-trips the whole set unchanged', async () => {
  const { state } = await built();
  const back = deserialiseState(serialiseState(state));
  assert.equal(back.nodes.size, state.nodes.size);
  assert.deepEqual(coverageGauge(back), coverageGauge(state));
  assert.deepEqual(
    heldGroups(back, NOW, TZ).map(g => [g.key, g.items.length]),
    heldGroups(state, NOW, TZ).map(g => [g.key, g.items.length]),
  );
});

// --- the invariants, at a scale that can actually break them ----------------

test('big-sample: the gauge, its list and the todo list agree at scale', async () => {
  // 1.15.1's invariant, now with a journal entry, a settled weight, a spent
  // resume card and three live pebbles in the same store.
  const { state } = await built();
  const gauge = coverageGauge(state);
  assert.equal(gauge.total, heldWork(state).length);
  assert.equal(gauge.total, heldGroups(state, NOW, TZ).flatMap(g => g.items).length);
  assert.equal(gauge.silent, 0);
  assert.ok(heldNodes(state).length > gauge.total, 'the wider set really is wider');
});

test('big-sample: every cap states a total it actually has', async () => {
  const { state } = await built();
  const s = searchHeld(state, 'the');
  assert.equal(s.items.length, Math.min(25, s.total));
  assert.ok(s.total >= s.items.length, 'the stated total is smaller than what it showed');
  const rev = reviewExceptions(state, NOW, TZ);
  assert.equal(rev.shown.length, Math.min(3, rev.total));
  assert.ok(rev.total >= rev.shown.length);
});

test('big-sample: the journal is really sealed, and the stated passphrase opens it', async () => {
  const { admitted } = await built();
  const sealRec = journalSeal(admitted);
  assert.ok(sealRec, 'the set carries no journal seal');
  const key = await deriveKey(BIG_SAMPLE_PASSPHRASE, sealRec!.salt, sealRec!.iterations);
  const entries = journalEntries(admitted);
  assert.ok(entries.length >= 3, `only ${entries.length} entries`);
  const first = await open(key, entries[0]!.sealed) as { text: string };
  assert.ok(typeof first.text === 'string' && first.text.length > 0);
  // And the words tell the reader the passphrase, or the journal in this set
  // demonstrates the locked state and nothing else.
  assert.ok(bigSampleWords(bigSampleSummary(admitted)).includes(BIG_SAMPLE_PASSPHRASE));
});

test('big-sample: no readable journal text is anywhere in the log', async () => {
  const { admitted } = await built();
  const text = JSON.stringify(admitted);
  for (const phrase of ['kitchen was warm', 'end of the lane', 'slow day']) {
    assert.equal(text.includes(phrase), false, `"${phrase}" is in the log in the clear`);
  }
});

test('big-sample: today is chosen for TODAY, or the strip shows nothing', async () => {
  const { state } = await built();
  assert.ok(state.modules.has('today'), 'the module is not on, so the strip cannot render');
  const chosen = composedFor(state, NOW, TZ);
  assert.ok(chosen.length >= 1, 'nothing is chosen for today');
  for (const n of chosen) assert.equal(n.todayFor, localDayKey(NOW, TZ));
});

test('big-sample: the words beside it never call it a backup', async () => {
  const { admitted } = await built();
  const w = bigSampleWords(bigSampleSummary(admitted));
  assert.match(w, /replaces what is on this device/);
  assert.match(w, /take a copy of your own first/);
  for (const bad of ['backup', 'back up', 'safe', 'restore your']) {
    assert.doesNotMatch(w, new RegExp(bad, 'i'), `"${w}" says "${bad}"`);
  }
});

test('big-sample: nothing in the content is trigger-list material or a personality', async () => {
  // The published trigger lists are copyrighted, and the voice is civilian and
  // adult. Same list `sample.test.ts` holds the small set to.
  //
  // Over the WORDS SOMEBODY WROTE, not over the whole payload — and that is a
  // correction. The first version searched every payload, which includes the
  // journal's base64 ciphertext, and a fresh IV per seal means random base64:
  // one run produced "gtd" inside it and failed. The check would have been a
  // coin flip on every CI run for ever. Exactly the collision `journal.test.ts`
  // records from 1.15.0, where the substring 'bb' matched the word "pe-bb-le".
  const { events } = await built();
  const authored: string[] = [];
  for (const e of events) {
    const p = e.payload as Record<string, unknown>;
    for (const k of ['title', 'text', 'name', 'value', 'forWhat', 'outcome', 'cue', 'what', 'label', 'scope']) {
      if (typeof p?.[k] === 'string') authored.push(p[k] as string);
    }
  }
  assert.ok(authored.length > 400, `only ${authored.length} authored strings to check`);
  const text = authored.join(' | ').toLowerCase();
  for (const bad of [
    'getting things done', 'gtd', 'next actions list', 'tickler',
    'anxious', 'overwhelm', 'adhd', 'executive function', 'streak', 'reward',
    'mission', 'deploy', 'target audience', 'campaign',
  ]) {
    assert.equal(text.includes(bad), false, `the set contains "${bad}"`);
  }
});

test('big-sample: no shame vocabulary reaches any rendered surface (law 5)', async () => {
  const { state } = await built();
  const rendered = [
    ...heldGroups(state, NOW, TZ).map(g => g.title),
    offerWords(offerNow(state, NOW, TZ)),
    loadWords(loadNow(state)),
    ...replanAll(state, NOW, TZ).map(c => c.node.title),
    ...reviewExceptions(state, NOW, TZ).shown.map(e => e.words),
    ...trackPortfolio(state, NOW, TZ).map(trackWords),
  ].join(' | ');
  assert.doesNotMatch(rendered, /\b(overdue|late|missed|streak|behind schedule|failed)s?\b/i);
});
