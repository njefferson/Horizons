// The Menu and the save-for gauges (v1.5).
//
// `menu.item.added` has carried a category from a closed list since the first
// draft and nothing read it — every Menu item went into one undifferentiated
// bucket, so the category was collected and discarded. `save-for.updated` was
// never folded at all, so the one category that carries numbers could not.
//
// Law 6 says the Menu is demand-free BY CONSTRUCTION, and the save-for gauge is
// the sharpest test of that anywhere in the app: a progress bar is a machine for
// implying you are behind. Most of these tests are about what this surface
// refuses to compute.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fold, type State } from '../src/fold.ts';
import { admit, GateRejection } from '../src/gate.ts';
import {
  menuGroups, menuCount, menuWords, saveFors, saveForWords,
  MENU_CATEGORIES, MENU_WORDS,
} from '../src/menu.ts';
import { setSaveForEvents, toMenuEvents } from '../src/ui/detail-intents.ts';
import type { AppEvent, MenuCategory } from '../src/events.ts';

const TZ = 'America/Denver';
const NOW = '2026-07-29T18:00:00.000Z';

let seq = 0;
const ev = (kind: string, node: string | null, payload: unknown): AppEvent =>
  ({ id: `e${seq}`, vault: 'personal', at: NOW, device: 'd0', seq: seq++, kind, node, payload } as AppEvent);
const st = (...e: AppEvent[]): State => fold(e);
const ctx = { id: () => `x${seq++}`, vault: 'personal', at: NOW, device: 'd0', seq: () => seq++, zone: TZ };
const apply = (s: State, e: AppEvent[]): State => (e.length ? fold(admit(e, s), s) : s);

const onMenu = (id: string, cat: MenuCategory, title = id): AppEvent[] => [
  ev('node.created', id, { nodeKind: 'aspiration', title }),
  ev('menu.item.added', id, { category: cat }),
];

// --- categories, finally read -----------------------------------------------

test('the category is finally used for something', () => {
  const s = st(...onMenu('a', 'read', 'a book'), ...onMenu('b', 'go', 'the coast'));
  const g = menuGroups(s);
  assert.deepEqual(g.map(x => x.category), ['read', 'go']);
  assert.deepEqual(g.map(x => x.title), ['Read', 'Go']);
  assert.deepEqual(g[0]!.items.map(n => n.title), ['a book']);
});

test('every category in the closed list has words a person can read', () => {
  for (const c of MENU_CATEGORIES) {
    assert.equal(typeof MENU_WORDS[c], 'string');
    assert.notEqual(MENU_WORDS[c], '', c);
  }
  assert.equal(MENU_CATEGORIES.length, 6, 'the vocabulary lists six');
});

test('an empty category is not shown', () => {
  // A heading with nothing under it reads as a gap to fill. An empty "Go" is not
  // a gap — it is a thing you have not wished for, and a wish list that prompts
  // you is a demand list.
  const s = st(...onMenu('a', 'read'));
  assert.deepEqual(menuGroups(s).map(x => x.category), ['read']);
});

test('the order is total, so the Menu is the same every time you open it', () => {
  const s = st(...onMenu('c', 'read'), ...onMenu('a', 'read'), ...onMenu('b', 'read'));
  assert.deepEqual(menuGroups(s)[0]!.items.map(n => n.id), ['a', 'b', 'c']);
});

test('something taken back off the Menu leaves it', () => {
  const s0 = st(...onMenu('a', 'read'));
  assert.equal(menuCount(s0), 1);
  const s1 = fold([ev('menu.item.promoted', 'a', { toKind: 'action' })], s0);
  assert.equal(menuCount(s1), 0);
  assert.deepEqual(menuGroups(s1), []);
});

test('a let-go item is not on the Menu', () => {
  const s = fold([ev('node.trashed', 'a', {})], st(...onMenu('a', 'read')));
  assert.equal(menuCount(s), 0);
});

test('the Menu says plainly that nothing on it is asking', () => {
  // The single most important sentence on this surface, and the thing most
  // likely to be dropped by whoever next edits it.
  assert.equal(menuWords(0), '');
  assert.match(menuWords(1), /Nothing here is asking\./);
  assert.match(menuWords(9), /Nothing here is asking\./);
  assert.match(menuWords(9), /whenever you want them/);
  for (const n of [1, 9, 40]) {
    for (const bad of ['still', 'yet', 'waiting', 'unread', 'left to', 'remaining', 'to do']) {
      assert.doesNotMatch(menuWords(n), new RegExp(bad, 'i'), `"${menuWords(n)}" makes no demand`);
    }
  }
});

// --- save-for ---------------------------------------------------------------

test('the two numbers are stored, and neither is required', () => {
  const s0 = st(...onMenu('s', 'save-for', 'a decent tripod'));
  const both = apply(s0, setSaveForEvents(ctx, 's', 300, 120));
  assert.deepEqual(saveFors(both).map(x => [x.target, x.saved]), [[300, 120]]);

  const wish = apply(s0, setSaveForEvents(ctx, 's', 300, null));
  assert.deepEqual(saveFors(wish).map(x => [x.target, x.saved]), [[300, null]]);

  const vague = apply(s0, setSaveForEvents(ctx, 's', null, null));
  assert.deepEqual(saveFors(vague).map(x => [x.target, x.saved]), [[null, null]],
    'a save-for with no numbers is an ordinary wish, not an incomplete record');
});

test('THE ONE THAT MATTERS: it states two numbers and refuses to score you', () => {
  const line = saveForWords({ node: {} as never, target: 300, saved: 120 })!;
  assert.equal(line, '£120 put by of £300. £180 to go.');
  // A percentage is a score. A bar is a machine for implying you are behind. A
  // projected date turns a wish into a commitment nobody made. On the one
  // surface in this app structurally incapable of nagging (law 6).
  for (const bad of ['%', 'percent', 'complete', 'progress', 'on track', 'behind',
    'weeks', 'months', 'at this rate', 'nearly', 'almost', 'only']) {
    assert.doesNotMatch(line, new RegExp(bad, 'i'), `"${line}" contains "${bad}"`);
  }
  // A PROJECTED DATE specifically — "by March", "by 2027". The first version of
  // this loop banned the bare string "by ", which matched the phrase "put by"
  // in the app's own correct output: a check that fires on the right answer is
  // not a stricter check, it is a broken one.
  assert.doesNotMatch(line, /\bby\s+(\d|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i,
    'no date is projected from somebody’s savings rate');
});

test('reaching the target says so and stops', () => {
  assert.equal(saveForWords({ node: {} as never, target: 300, saved: 300 }),
    '£300 put by — that is enough.');
  assert.equal(saveForWords({ node: {} as never, target: 300, saved: 450 }),
    '£450 put by — that is enough.',
    'over the target is not a separate celebration, and not an error');
});

test('a missing term is silence, never a guessed number', () => {
  assert.equal(saveForWords({ node: {} as never, target: null, saved: null }), null);
  assert.equal(saveForWords({ node: {} as never, target: 300, saved: null }), '£300.');
  assert.equal(saveForWords({ node: {} as never, target: null, saved: 40 }), '£40 put by.');
});

test('nonsense numbers do not get into the log as numbers', () => {
  const s0 = st(...onMenu('s', 'save-for'));
  for (const bad of [NaN, Infinity, -Infinity]) {
    const s = fold([ev('save-for.updated', 's', { target: bad, saved: bad })], s0);
    assert.equal(s.nodes.get('s')!.saveTarget, null, String(bad));
    assert.equal(s.nodes.get('s')!.saveSaved, null, String(bad));
  }
});

test('a save-for on the Menu still carries no clock — law 6 is not bent for it', () => {
  const s = apply(st(...onMenu('s', 'save-for')), setSaveForEvents(ctx, 's', 300, 10));
  assert.deepEqual(Object.keys(s.nodes.get('s')!.clocks), [],
    'putting a number on a wish does not turn it into a demand');
  assert.throws(
    () => admit([ev('clock.set', 's', { clockKind: 'due', at: NOW, source: 't' })], s),
    (e: unknown) => e instanceof GateRejection,
    'and the gate still refuses to give it one');
});

test('only save-for items carry numbers', () => {
  const s = apply(st(...onMenu('r', 'read')), setSaveForEvents(ctx, 'r', 300, 10));
  assert.deepEqual(saveFors(s), [], 'a book you want to read is not a thing you are saving for');
});

test('putting something on the Menu through the app’s own control lands it there', () => {
  const s0 = st(ev('node.created', 'A', { nodeKind: 'action', title: 'a thing' }),
    ev('clock.set', 'A', { clockKind: 'review', at: NOW, source: 't' }));
  const s1 = apply(s0, toMenuEvents(ctx, 'A'));
  assert.equal(menuCount(s1), 1);
  assert.equal(menuGroups(s1)[0]!.category, 'read', 'the default the control uses');
});
