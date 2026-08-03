// Membership: which kinds belong where, written down (1.17.2, ADR-0070).
//
// Three of the last four shipped defects were the same defect: a kind on a
// surface it did not belong on. Journal entries itemised in the coverage list
// (1.15.1). Every person ever named sitting in the todo list (1.17.0). The
// detail sheet offering date controls on demand-free kinds that the gate then
// refused (1.17.2 — and the comment beside the code named the rule while the
// code broke it). Each was found by READING, none by a test, because nothing
// asked the question "does this kind belong here?" anywhere.
//
// This file is that question, asked of every list surface at once, over the
// 1.16.0 set-of-everything — the one store that contains every kind. It is the
// `MERGE_DISPOSITION` idiom: one declared table, a written reason per surface,
// and totality both ways. A kind that starts appearing somewhere new fails
// until somebody either allows it with a sentence or excludes it in the code.
//
// TWO-SIDED, deliberately. `actual ⊆ allowed` alone goes green on an empty
// surface (the fixture-not-result lesson, hub LESSONS 7g), so each surface also
// declares `expect`: kinds that MUST be present in the big sample. Between the
// two, the table cannot rot in either direction.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bigSampleEvents } from '../src/big-sample.ts';
import { admit, gateOptionsFor, heldWork, trashedNodes } from '../src/gate.ts';
import { fold, type NodeState, type State } from '../src/fold.ts';
import { DEMAND_FREE_KINDS, NODE_KINDS, type NodeKind } from '../src/events.ts';
import { heldGroups } from '../src/held.ts';
import { nextUpQueue, workSurface } from '../src/nextup.ts';
import { offerNow } from '../src/offer.ts';
import { searchHeld } from '../src/search.ts';
import { replanAll } from '../src/replan.ts';
import { reviewExceptions } from '../src/review.ts';
import { treeRows } from '../src/tree-view.ts';
import { menuGroups } from '../src/menu.ts';
import { trackPortfolio } from '../src/portfolio.ts';
import { choosable, composedFor } from '../src/composed.ts';
import { notNowLedger } from '../src/requests.ts';
import { loadNow } from '../src/load.ts';
import { anchors } from '../src/anchors.ts';
import { people } from '../src/people.ts';
import type { AppEvent } from '../src/events.ts';

const TZ = 'America/Denver';
const NOW = '2026-08-03T18:00:00.000Z';

let cached: State | null = null;
async function store(): Promise<State> {
  if (cached) return cached;
  let n = 0, s = 0;
  const ctx = { at: NOW, device: 'member', vault: 'personal', zone: TZ, seq: () => s++, id: () => `mb${n++}` };
  cached = fold(admit(await bigSampleEvents(ctx, NOW), fold([]), gateOptionsFor(TZ)));
  return cached;
}

/** Kinds that are work when held: everything except the demand-free kinds and
 *  the residue/lens kinds each of which has a surface of its own. Named once so
 *  the table below reads as decisions rather than repetition. */
const WORK: NodeKind[] = ['action', 'outcome', 'project', 'area', 'goal', 'waiting-for', 'upkeep', 'bother', 'resume-card'];

interface SurfaceRule {
  /** Why this surface admits what it admits — the sentence is the gate. */
  why: string;
  /** Every kind that may appear. A kind outside this set failing is the point. */
  allowed: readonly NodeKind[];
  /** Kinds that MUST appear in the big sample, so the check is never vacuous. */
  expect: readonly NodeKind[];
  /** The surface's rows, computed from the sample state. */
  rows(st: State): NodeState[];
}

const SURFACES: Record<string, SurfaceRule> = {
  'todo list (heldGroups)': {
    why: 'The list you work from. Work plus off-Menu aspirations (a wish taken off the Menu is still yours and must be SOMEWHERE — its row is how you find it to promote it). Never a person, journal entry, pebble or anchor: each has its own surface, and a row here is what "becoming a task" looks like (ADR-0061/0065/0068, 1.15.1/1.17.0).',
    allowed: [...WORK, 'aspiration'],
    expect: ['action', 'project', 'upkeep', 'waiting-for', 'aspiration', 'resume-card'],
    rows: st => heldGroups(st, NOW, TZ).flatMap(g => g.items),
  },
  'coverage list / gauge total (heldWork)': {
    why: 'The gauge\'s number itemised. One definition with the todo list by construction since 1.15.1 — so the same table row, restated to pin that they cannot drift apart again.',
    allowed: [...WORK, 'aspiration'],
    expect: ['action', 'project', 'upkeep', 'aspiration'],
    rows: st => heldWork(st),
  },
  'search (searchHeld)': {
    why: 'Answers "where did that go" — so wider than work: people and anchors are findable because each opens a sheet that can say something true about it. Pebbles are excluded (their sheet is all verbs the gate refuses — 1.15.1) and a journal entry cannot match (no title, by design).',
    allowed: [...WORK, 'aspiration', 'person', 'anchor'],
    expect: ['action', 'person', 'anchor', 'aspiration'],
    rows: st => searchHeld(st, 'e', 100000).items,
  },
  'next-up queue': {
    why: 'What the app offers to DO next. Actionable work only — upkeep arrives via chips but the queue may rank it; a bother mid-flow may surface if it carries a live demand clock (the mine-to-track park returning is the flow bringing it back). Never demand-free kinds, never a spent card.',
    allowed: ['action', 'outcome', 'project', 'area', 'goal', 'upkeep', 'bother', 'resume-card'],
    expect: ['action'],
    rows: st => nextUpQueue(st, NOW, TZ).map(q => q.node),
  },
  'the offer (offerNow work)': {
    why: 'Up to OFFER_CAP pieces of work, chosen so picking is a preference (ADR-0060). Same actionable bound as the queue it draws from.',
    allowed: ['action', 'outcome', 'project', 'area', 'goal', 'upkeep', 'bother', 'resume-card'],
    expect: ['action'],
    rows: st => offerNow(st, NOW, TZ).work.map(w => w.node),
  },
  'upkeep chips': {
    why: 'Rhythms above threshold. Upkeep is the only kind that HAS a rhythm.',
    allowed: ['upkeep'],
    expect: ['upkeep'],
    rows: st => workSurface(st, NOW, TZ).chips.map(c => c.node),
  },
  'replan cards': {
    why: 'A passed hard date is a present decision (law 3). Anything that can carry a hard clock can raise one — which demand-free kinds structurally cannot.',
    allowed: WORK,
    expect: ['action', 'waiting-for'],
    rows: st => replanAll(st, NOW, TZ).map(c => c.node),
  },
  'review exceptions': {
    why: 'Structural breaks in CONTAINERS: stalled, orphaned, dormant areas, unfed goals. Containers only, by each definition\'s own terms.',
    allowed: ['project', 'area', 'goal'],
    expect: ['project', 'area'],
    rows: st => reviewExceptions(st, NOW, TZ).shown.map(e => e.node),
  },
  'the tree': {
    why: 'How work hangs together: live containers and what sits under them. A person, pebble, journal entry or anchor has no place in a hierarchy of work.',
    allowed: WORK,
    expect: ['project', 'area', 'action', 'goal'],
    rows: st => treeRows(st).flatMap(r => (r.kind === 'node' ? [r.node] : [])),
  },
  'the Menu': {
    why: 'Wanted, never owed. Membership is `onMenu`, not kind — a someday-routed action sits here as a wish. Demand-free aspirations are its natural residents.',
    allowed: ['aspiration', 'action', 'outcome', 'project', 'area', 'goal', 'waiting-for', 'upkeep'],
    expect: ['aspiration', 'action'],
    rows: st => menuGroups(st).flatMap(g => g.items),
  },
  'portfolio (tracked)': {
    why: 'Projects somebody else runs that you carry. `project.role.set` only lands on containers.',
    allowed: ['project', 'area', 'goal'],
    expect: ['project'],
    rows: st => trackPortfolio(st, NOW, TZ).map(l => l.node),
  },
  'composed today': {
    why: 'What YOU chose for today. `choosable` excludes person/bother/pebble (never doable) and, since 1.17.2, journal and anchor — a private entry and a named period have no place in a hand of five. A resume-card stays choosable: picking a thread back up today is a real choice.',
    allowed: ['action', 'outcome', 'project', 'area', 'goal', 'waiting-for', 'upkeep', 'aspiration', 'resume-card'],
    expect: ['action'],
    rows: st => composedFor(st, NOW, TZ),
  },
  'Not Now ledger': {
    why: 'Standing declines. Anything somebody can ask you for can be declined — including a bother routed "not mine to carry" (ADR-0056, the flow\'s whole point).',
    allowed: [...WORK],
    expect: ['action', 'bother'],
    rows: st => notNowLedger(st).map(r => r.node),
  },
  'the load list (pebbles)': {
    why: 'What is ON you. Pebbles are the only kind that is weight (ADR-0065).',
    allowed: ['pebble'],
    expect: ['pebble'],
    rows: st => loadNow(st).pebbles,
  },
  'anchors list': {
    why: 'Named periods, for the report\'s "since when" (ADR-0068).',
    allowed: ['anchor'],
    expect: ['anchor'],
    rows: st => anchors(st),
  },
  'people picker': {
    why: 'The person lens\'s roster. People only, by its own definition.',
    allowed: ['person'],
    expect: ['person'],
    rows: st => people(st),
  },
  'trash view': {
    why: 'Things let go — an explicit decision about ANY kind is kept, including a settled pebble (ADR-0065 trashes on settle so the way back exists). The one deliberately total list.',
    allowed: [...NODE_KINDS],
    expect: ['action', 'pebble'],
    rows: st => trashedNodes(st),
  },
};

test('membership: every surface admits only what its written reason allows', async () => {
  const st = await store();
  const failures: string[] = [];
  for (const [name, rule] of Object.entries(SURFACES)) {
    const kinds = new Set(rule.rows(st).map(n => n.kind));
    for (const k of kinds) {
      if (!(rule.allowed as readonly string[]).includes(k)) {
        failures.push(`${name}: a "${k}" appeared, and the table does not allow it — allow it with a sentence or exclude it in the code`);
      }
    }
    for (const k of rule.expect) {
      if (!kinds.has(k)) {
        failures.push(`${name}: expected a "${k}" in the big sample and found none — the check is vacuous for that kind (LESSONS 7g)`);
      }
    }
  }
  assert.deepEqual(failures, []);
});

test('membership: every node kind is ruled on by at least one surface', async () => {
  // Totality in the other direction: a NEW kind cannot be added to NODE_KINDS
  // without some surface here claiming it — otherwise it exists nowhere this
  // table can see, which is how the journal and person defects were born.
  const ruled = new Set<string>(Object.values(SURFACES).flatMap(r => [...r.allowed]));
  for (const k of NODE_KINDS) {
    assert.ok(ruled.has(k), `node kind "${k}" appears in no surface's allowed set — where does it live?`);
  }
});

test('membership: OFFERED-THEN-REFUSED is structurally closed for dates', async () => {
  // The 1.17.2 defect, pinned at both ends. For every demand-free kind: the
  // gate refuses a clock, AND the sheet's visibility rule hides the date
  // controls. The predicate here restates detail.ts's `temporal` expression —
  // the sheet's copy is DOM-bound, so the two are tied by this test plus the
  // comment beside each naming the other. If detail.ts's rule changes, this
  // fails until they agree again.
  const st = await store();
  const temporalShown = (n: NodeState): boolean =>
    !n.onMenu && !(DEMAND_FREE_KINDS as readonly string[]).includes(n.kind);

  for (const kind of DEMAND_FREE_KINDS) {
    const n = [...st.nodes.values()].find(x => x.kind === kind && !x.trashed && !x.mergedInto);
    assert.ok(n, `the big sample holds no live "${kind}" — the case is absent (LESSONS 7g)`);
    assert.equal(temporalShown(n!), false,
      `the sheet would offer date controls on a ${kind}`);
    assert.throws(
      () => admit([{
        id: 'PROBE', vault: 'personal', at: NOW, device: 'd0', seq: 999999,
        kind: 'clock.set', node: n!.id,
        payload: { clockKind: 'due', at: '2026-09-01T12:00:00.000Z', source: 'me' },
      } as AppEvent], st, gateOptionsFor(TZ)),
      /cannot carry a clock/i,
      `the gate accepts a clock on a ${kind} — then the sheet is hiding a legal verb`,
    );
  }

  // And the inverse: a kind the sheet shows date controls for must be one the
  // gate accepts them on — otherwise this is the same defect mirror-imaged.
  const work = [...st.nodes.values()].find(x => x.kind === 'action' && !x.trashed && !x.mergedInto && !x.onMenu);
  assert.ok(work);
  assert.equal(temporalShown(work!), true);
  const got = admit([{
    id: 'PROBE2', vault: 'personal', at: NOW, device: 'd0', seq: 999998,
    kind: 'clock.set', node: work!.id,
    payload: { clockKind: 'due', at: '2026-09-01T12:00:00.000Z', source: 'me' },
  } as AppEvent], st, gateOptionsFor(TZ));
  assert.ok(got.some(e => e.id === 'PROBE2'), 'a date on an action was refused');
});

test('membership: choosable and the gate agree about what today can hold', async () => {
  // "Put it in today" must never be offered where choosing is meaningless.
  // Since 1.17.2 that includes journal and anchor.
  const st = await store();
  for (const kind of ['person', 'bother', 'pebble', 'journal', 'anchor'] as const) {
    const n = [...st.nodes.values()].find(x => x.kind === kind && !x.trashed && !x.mergedInto);
    if (!n) continue;    // bother may have all instances kind-changed; the table test covers presence
    assert.equal(choosable(n), false, `"Put it in today" is offered on a ${kind}`);
  }
});
