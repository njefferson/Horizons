// The number on the app icon, and the switch that turns it off.
//
// It was required to be optional, after somebody came back to a red 1 they
// could not find anywhere inside the app. The tests that matter are that **off means off immediately** — a
// switch whose effect waits for the next render reads as a broken switch — and that
// the preference is device-local, because a badge is a property of an installation
// and not a fact about somebody's work.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BADGE_KEY, badgeToggleLabel, badgeWords, isBadgeOn, loadBadgePreference,
  paintBadge, resetBadgeForTests, setBadgeEnabled,
} from '../src/ui/badge.ts';

/** A store that records writes, so the tests can assert about persistence. */
function fakeStore(initial?: unknown) {
  const kv = new Map<string, unknown>();
  if (initial !== undefined) kv.set(BADGE_KEY, initial);
  return {
    kv,
    getKv: async <T,>(key: string): Promise<T | null | undefined> => kv.get(key) as T | undefined,
    setKv: async (key: string, value: unknown): Promise<void> => { kv.set(key, value); },
  };
}

/** Capture what the platform was told, in order. */
function fakeIcon() {
  const calls: (number | 'clear')[] = [];
  const n = globalThis.navigator as unknown as Record<string, unknown>;
  n['setAppBadge'] = (x?: number) => { calls.push(x ?? 0); return Promise.resolve(); };
  n['clearAppBadge'] = () => { calls.push('clear'); return Promise.resolve(); };
  return calls;
}

// --- THE ONE THAT MATTERS ---------------------------------------------------

test('THE ONE THAT MATTERS: switching it off clears the icon in the same breath', async () => {
  // A preference that only takes effect on the next render leaves the number
  // sitting there after somebody just asked for it to go. That reads as the switch
  // not working, and it is the kind of small betrayal that stops people trusting
  // any switch in the app.
  resetBadgeForTests();
  const store = fakeStore();
  const calls = fakeIcon();

  paintBadge(3);
  assert.deepEqual(calls, [3], 'on, so the icon carries the count');

  await setBadgeEnabled(store, false);
  assert.deepEqual(calls, [3, 'clear'], 'off, and the icon was cleared straight away');
  assert.equal(isBadgeOn(), false);
  assert.equal(store.kv.get(BADGE_KEY), false, 'and it was written down');
});

test('and switching it back on repaints the count without waiting for a render', async () => {
  resetBadgeForTests();
  const store = fakeStore();
  const calls = fakeIcon();
  paintBadge(2);
  await setBadgeEnabled(store, false);
  calls.length = 0;
  await setBadgeEnabled(store, true);
  assert.deepEqual(calls, [2], 'the number somebody last had is the number they get back');
});

test('while off, a render does not put the number back', async () => {
  resetBadgeForTests();
  const store = fakeStore();
  await setBadgeEnabled(store, false);
  const calls = fakeIcon();
  paintBadge(7);
  assert.deepEqual(calls, ['clear'], 'render obeys the preference, not the count');
});

// --- zero -------------------------------------------------------------------

test('zero clears rather than showing a nought', () => {
  // A badge reading 0 is a mark on the home screen saying nothing is asking, which
  // is a strange thing to keep shouting. It is also the one number that has to be
  // able to vanish, or the badge is a fixture rather than information.
  resetBadgeForTests();
  const calls = fakeIcon();
  paintBadge(0);
  paintBadge(-1);
  assert.deepEqual(calls, ['clear', 'clear']);
});

// --- the preference ---------------------------------------------------------

test('a store that has never been asked means ON, because that is what it did before', async () => {
  resetBadgeForTests();
  assert.equal(await loadBadgePreference(fakeStore()), true);
  assert.equal(isBadgeOn(), true);
});

test('only an explicit false turns it off — not a missing value, not a null', async () => {
  for (const stored of [undefined, null, true]) {
    resetBadgeForTests();
    assert.equal(await loadBadgePreference(fakeStore(stored)), true, `stored ${String(stored)}`);
  }
  resetBadgeForTests();
  assert.equal(await loadBadgePreference(fakeStore(false)), false);
});

test('a store that throws does not stop the app starting', async () => {
  resetBadgeForTests();
  const broken = {
    getKv: async <T,>(): Promise<T | null | undefined> => { throw new Error('no storage'); },
    setKv: async (): Promise<void> => {},
  };
  assert.equal(await loadBadgePreference(broken), true, 'and defaults to what it did before');
});

test('the key names the thing rather than the widget', () => {
  assert.equal(BADGE_KEY, 'badge.enabled');
  // Device-local on purpose: the same person may want this on the iPad and off on
  // the phone, so it must NOT be an event in the log, which syncs.
  assert.equal(BADGE_KEY.includes('.'), true, 'a kv key, not an event noun');
});

// --- words ------------------------------------------------------------------

test('the button says what pressing it DOES, not what the state is', () => {
  // A button labelled with its own state makes somebody guess whether pressing it
  // describes or changes — and nobody should have to run that experiment on their
  // own home screen.
  assert.equal(badgeToggleLabel(true), 'Stop showing a number on the icon');
  assert.equal(badgeToggleLabel(false), 'Show a number on the icon');
  assert.notEqual(badgeToggleLabel(true), badgeToggleLabel(false));
  for (const on of [true, false]) {
    assert.doesNotMatch(badgeToggleLabel(on), /^(on|off|enabled|disabled)\b/i);
  }
});

test('turning it off says nothing is lost, because nothing is', () => {
  assert.match(badgeWords(false), /Nothing is lost/);
  assert.match(badgeWords(false), /still holds everything/);
  for (const on of [true, false]) {
    for (const bad of ['enabled', 'disabled', 'toggle', 'setting', 'preference', '警']) {
      assert.doesNotMatch(badgeWords(on), new RegExp(bad, 'i'), `"${badgeWords(on)}" says "${bad}"`);
    }
  }
});
