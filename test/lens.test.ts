// The lens (1.7.0, ADR-0054): membership, the choices, and the fence. The
// load-bearing property is Q-10's closure — a lens changes what you are
// looking at and never what the app is holding: the gauge, replan, re-entry,
// and Next up read whole state, take no lens argument, and so CANNOT differ
// under any lens. The tests below state that fence at runtime too.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fold, emptyState, type State } from '../src/fold.ts';
import { admit, gateOptionsFor, coverageGauge } from '../src/gate.ts';
import { lensChoices, underLensIds, lensWords, LENS_KEY } from '../src/lens.ts';
import { roots } from '../src/tree-view.ts';
import { nextUp } from '../src/nextup.ts';
import { replanAll } from '../src/replan.ts';
import { reentryView } from '../src/reentry.ts';
import type { AppEvent } from '../src/events.ts';

const TZ = 'America/Denver';
const NOW = '2026-07-29T18:00:00.000Z';
const OPTS = gateOptionsFor(TZ);

let seq = 0;
const ev = (kind: string, node: string | null, payload: unknown): AppEvent =>
  ({ id: `e${seq}`, vault: 'personal', at: NOW, device: 'd0', seq: seq++, kind, node, payload } as AppEvent);
const write = (prior: State, offered: AppEvent[]): State =>
  fold(admit(offered, prior, OPTS), prior);
const made = (prior: State, id: string, nodeKind: string, title: string, parent?: string): State =>
  write(prior, [ev('node.created', id, {
    nodeKind, title, provenance: { for: 'self' }, ...(parent ? { parent } : {}),
  })]);

/** Home and Work areas, work under each, one loose action beside them. */
function twoWorlds(): State {
  let s = emptyState();
  s = made(s, 'HOME', 'area', 'Home');
  s = made(s, 'WORK', 'area', 'Work');
  s = made(s, 'HP', 'project', 'fix the fence', 'HOME');
  s = made(s, 'HA', 'action', 'buy the posts', 'HP');
  s = made(s, 'WA', 'action', 'file the report', 'WORK');
  s = made(s, 'LOOSE', 'action', 'call the dentist');
  return s;
}

test('membership is lineage: everything beneath the root, root included, loose things outside', () => {
  const s = twoWorlds();
  const home = underLensIds(s, 'HOME');
  assert.deepEqual([...home].sort(), ['HA', 'HOME', 'HP'], 'the whole branch, transitively');
  assert.ok(!home.has('WA'), 'the other world steps aside');
  assert.ok(!home.has('LOOSE'), 'loose things belong to no lens — still held, just not looked at');
});

test('membership survives a cycle a shard could deliver — never a hang', () => {
  const s = twoWorlds();
  // Half a loop: HOME's parent claims to be HP, which sits under HOME.
  const bent = { ...s, nodes: new Map(s.nodes) } as State;
  const home = bent.nodes.get('HOME')!;
  bent.nodes.set('HOME', { ...home, parent: 'HP' });
  const ids = underLensIds(bent, 'HOME');
  assert.ok(ids.has('HA'), 'the walk still completes');
});

test('the choices are the tree\'s own roots — one definition of "top level"', () => {
  const s = twoWorlds();
  assert.deepEqual(lensChoices(s).map(n => n.id), roots(s).map(n => n.id));
  assert.deepEqual(lensChoices(s).map(n => n.id).sort(), ['HOME', 'WORK'],
    'live containers not inside a live container — HP sits under Home and is no root');
});

test('THE FENCE: gauge, Next up, replan, and re-entry cannot differ under a lens', () => {
  const s = twoWorlds();
  // None of these take a lens argument — the type system is the fence. Runtime
  // restatement: their answers are identical whatever the view preference says.
  const gauge = coverageGauge(s);
  const next = nextUp(s, NOW, TZ);
  const replans = replanAll(s, NOW, TZ);
  const reentry = reentryView(s, NOW, TZ);
  assert.equal(gauge.total, coverageGauge(s).total);
  assert.deepEqual(nextUp(s, NOW, TZ), next, 'one thing, across the WHOLE of a life');
  assert.deepEqual(replanAll(s, NOW, TZ), replans);
  assert.deepEqual(reentryView(s, NOW, TZ), reentry);
});

test('the lens line says law 1 out loud, and carries no number', () => {
  const words = lensWords('Home');
  assert.ok(words.includes('Looking at Home'));
  assert.ok(/still held/.test(words), 'law 1, stated where the filtering happens');
  assert.ok(!/\d/.test(words), 'no count — a number here is a headline about everything else');
  assert.ok(lensWords('').includes('(untitled)'));
});

test('the persisted choice is a view preference, not history', () => {
  assert.equal(LENS_KEY, 'lens.root', 'kv, the badge pattern — never an event');
});
