// The number on the app icon, and the switch that turns it off.
//
// Noah: *"Make the badge optional as well, if you didn't already?"* — after coming
// back to a red 1 he could not find inside the app.
//
// ## Why it is a switch and not a removal
//
// A badge is the only thing this app can say while it is shut, and for somebody who
// opens a planner to find out whether anything is asking, "nothing is asking" is
// worth knowing from the home screen. But **an unrequested red number is the same
// shape as a red wall**, which this product structurally refuses, and one person's
// useful glance is another person's small alarm every time they unlock a device. So
// it stays, and it is theirs to switch off.
//
// ## Why the preference lives in `kv` and not in the log
//
// The log is the record of somebody's work and it syncs. A badge is a property of
// **this installation** — the same person may want it on the iPad and off on the
// phone — so putting it in the event log would make one device's preference follow
// them onto the other, and would add a noun to the vocabulary for something that is
// not a fact about their life. `kv` is device-local, which is exactly right.
//
// ## Why the flag is module state read synchronously
//
// `render` is synchronous and runs on every change; reading IndexedDB inside it
// would make painting the list wait on a preference. The value is loaded once at
// boot and held here, so `render` asks a variable. The alternative — an async
// render — would put a storage read on the path between a keystroke and a card
// appearing, which is the one path in this app that must never get slower.

/** `kv` key. Named for the thing, not for the widget. */
export const BADGE_KEY = 'badge.enabled';

/** Default ON, because that is what the app already did. Turning a badge off for
 *  somebody who had it, without being asked to, is its own small surprise. */
let enabled = true;

/** What the icon was last told, so the switch can repaint without a render pass. */
let lastCount = 0;

export const isBadgeOn = (): boolean => enabled;

interface BadgeStore {
  /** `null` as well as `undefined`, because the real store returns both and a
   *  narrower shape here would have to be satisfied by a cast at the call site. */
  getKv<T>(key: string): Promise<T | null | undefined>;
  setKv(key: string, value: unknown): Promise<void>;
}

/** Read the preference at boot. A missing value means ON. */
export async function loadBadgePreference(store: BadgeStore): Promise<boolean> {
  try {
    const v = await store.getKv<boolean>(BADGE_KEY);
    enabled = v !== false;
  } catch {
    // A preference that cannot be read is not a reason to fail to start.
    enabled = true;
  }
  return enabled;
}

const nav = (): {
  setAppBadge?: (n?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
} => navigator as Navigator & {
  setAppBadge?: (n?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

/**
 * Tell the icon. Called from `render` with the ready count.
 *
 * **Zero clears rather than showing a 0.** A badge reading zero is a mark on the
 * home screen that says nothing is asking, which is a strange thing to keep
 * shouting; and it is the one number that must be able to disappear entirely, or
 * the badge becomes a permanent fixture rather than information.
 */
export function paintBadge(readyCount: number): void {
  lastCount = readyCount;
  try {
    const n = nav();
    if (!enabled || readyCount <= 0) void n.clearAppBadge?.()?.catch(() => {});
    else void n.setAppBadge?.(readyCount)?.catch(() => {});
  } catch {
    // Unsupported on most platforms today, and never a reason to break a render.
  }
}

/**
 * Turn it on or off, persist it, and act on it NOW.
 *
 * Switching it off clears the icon in the same breath. A preference that only
 * takes effect on the next render would leave the number sitting there after
 * somebody had just asked for it to go — which reads as the switch not working,
 * and is the kind of small betrayal that stops people trusting any switch.
 */
export async function setBadgeEnabled(store: BadgeStore, on: boolean): Promise<void> {
  enabled = on;
  paintBadge(lastCount);
  await store.setKv(BADGE_KEY, on);
}

/** What the switch says about its own state. Never "enabled"/"disabled" — those
 *  are words about software, and this sentence is about somebody's home screen. */
export function badgeWords(on: boolean): string {
  return on
    ? 'The app icon shows how many things are ready now. Tap to stop it.'
    : 'The app icon stays plain. Nothing is lost — the app still holds everything and still tells you inside.';
}

/** The label on the control itself, which must say what pressing it DOES rather
 *  than what the current state is — a button labelled with its state is the
 *  oldest ambiguity in interface design. */
export const badgeToggleLabel = (on: boolean): string =>
  on ? 'Stop showing a number on the icon' : 'Show a number on the icon';

/** Test seam: reset module state between cases. */
export function resetBadgeForTests(): void {
  enabled = true;
  lastCount = 0;
}
