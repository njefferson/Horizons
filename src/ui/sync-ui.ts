// The pairing surface — Quietkeep Sync's only visible difference.
//
// It builds its own DOM rather than living in `public/index.html`, and that is
// load-bearing: the two editions ship the SAME shell (ADR-0036), so a section in
// the HTML would appear in the default build as dead controls promising a
// capability that build deliberately cannot have. Nothing here runs in the
// default edition because nothing there imports this file.
//
// ## What it must say
//
// ADR-0036: each build "states its own posture plainly… the variant saying
// exactly what leaves the device". That is not a disclaimer to bury. The default
// build's whole claim is that it cannot talk to anything; this one gives that up
// in exchange for a second device, and somebody choosing it is entitled to know
// precisely what the trade is — what travels, what it is sealed with, and what
// the relay can see. So the posture paragraph is the FIRST thing in the section,
// above the controls, not a footnote below them.
//
// ## Why the pairing name is shown so prominently
//
// It is the only way somebody can tell "paired" from "paired to the same thing".
// Two devices can each hold a perfectly good key and never exchange a byte if the
// keys differ — and the symptom is silence, which is indistinguishable from
// nothing having happened yet. Both screens showing the same eight characters is
// the check that turns that into something visible.

import { RELAY_HOST, relayIsSet } from '../relay-host.ts';
import {
  acceptPairing, beginPairing, currentPairing, forgetPairing,
  malformedPairing, pairingFilename, pairingWords,
} from './pairing.ts';
import { outcomeWords, runExchange } from './sync-run.ts';
import { deviceLine, deviceRecords, devicesWords, REPLACE_KEY_WORDS, REPLACED_KEY_WORDS } from '../devices.ts';
import type { Session } from './session.ts';

/** What this edition sends, in the plainest words available. Exported so a test
 *  can hold it to the promise rather than trusting that somebody read it. */
export const POSTURE_WORDS =
  'This edition sends your writing to a handover point on the internet so another device can pick it up. ' +
  'It is sealed on this device first, with a key only your devices hold — the handover point stores bytes it cannot read, ' +
  'and never sees the key. There is still no account and nothing about you is collected.';

/** Said before anything is paired, so the trade is understood before it is made
 *  rather than explained afterwards. */
export const FIRST_STEP_WORDS =
  'Pair this device to start. You will get a small file: open it on your other device and the two are a pair.';

/** The pairing file is the key. Somebody about to put it in a shared folder
 *  should know that, in the moment they are deciding where to put it. */
export const FILE_WARNING_WORDS =
  'That file is the key. Anyone who opens it can read this planner, so hand it over the way you would a password — ' +
  'and delete it once the other device has taken it in.';

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K, cls?: string, text?: string,
): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
};

/** Hand the pairing file over. Same shape as `deliverCopy`, deliberately not
 *  sharing it: this file records no event, because a key changing hands is not
 *  something to write into a log that itself gets synced. */
function deliverPairing(file: object, name: string): void {
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  // The same two-minute grace `deliverCopy` uses, for the same reason: iPadOS
  // holds the object URL open while the share sheet is up.
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

/**
 * Build the section and wire it up.
 *
 * Every control is contained: sync failing must never cost capture, so nothing
 * here throws upward. `main` contains it a second time, which is belt and braces
 * rather than duplication — this one can say what went wrong in the surface, and
 * that one only stops it being fatal.
 */
export async function mountSync(session: Session): Promise<void> {
  const anchor = document.querySelector('#export')?.closest('.about-actions');
  if (!anchor?.parentElement) return;

  const heading = el('h3', 'about-section', 'Keeping two devices in step');
  const posture = el('p', 'about-p', POSTURE_WORDS);
  const state = el('p', 'about-p');
  const actions = el('div', 'about-actions');
  const pairBtn = el('button', undefined, 'Pair this device');
  pairBtn.type = 'button';
  const syncBtn = el('button', 'ghost', 'Sync now');
  syncBtn.type = 'button';
  const forgetBtn = el('button', 'ghost', 'Forget this pairing');
  forgetBtn.type = 'button';
  const replaceBtn = el('button', 'ghost', 'Replace the key');
  replaceBtn.type = 'button';
  actions.append(pairBtn, syncBtn, replaceBtn, forgetBtn);

  // WHO HAS WRITTEN HERE. Noah asked whether a person can see how many devices
  // are syncing — the app has always known, from the device id on every event,
  // and had never shown it. An extra device in a pair is invisible until
  // something lists them, which makes listing them a security control and not a
  // statistic.
  const devicesP = el('p', 'about-p');
  const devicesList = el('ul', 'note-list');

  const openLabel = el('label', 'detail-label', 'Open a pairing file from your other device');
  const openFile = el('input');
  openFile.type = 'file';
  openFile.accept = 'application/json,.json';
  openLabel.htmlFor = openFile.id = 'pairing-file';

  const note = el('p', 'storage-note');
  note.setAttribute('role', 'status');
  note.setAttribute('aria-live', 'polite');

  const section = el('div');
  section.append(heading, posture, state, devicesP, devicesList, actions, openLabel, openFile, note);
  anchor.parentElement.insertBefore(section, anchor.nextSibling);

  const paint = async (): Promise<void> => {
    const pair = await currentPairing(session.store);
    state.textContent = pairingWords(pair);
    const paired = pair !== null;

    const records = deviceRecords(await session.store.all(), session.device);
    devicesP.textContent = devicesWords(records);
    const now = new Date().toISOString();
    devicesList.replaceChildren(
      ...records.map(r => el('li', undefined, deviceLine(r, now))));
    // Hidden rather than disabled when there is nothing to act on: a disabled
    // control still reads as a thing you have failed to earn, and there is no
    // failure here — this device simply has no pair yet.
    syncBtn.hidden = !paired;
    forgetBtn.hidden = !paired;
    replaceBtn.hidden = !paired;
    pairBtn.textContent = paired ? 'Replace this pairing' : 'Pair this device';
    if (!paired) note.textContent = FIRST_STEP_WORDS;
  };
  await paint();

  pairBtn.addEventListener('click', () => {
    void (async () => {
      pairBtn.disabled = true;
      try {
        if (!relayIsSet()) {
          note.textContent = 'This build has no handover point set, so pairing would have nowhere to send anything.';
          return;
        }
        const file = await beginPairing(session.store, RELAY_HOST, new Date().toISOString());
        deliverPairing(file, pairingFilename(file.id));
        await paint();
        note.textContent = `${FILE_WARNING_WORDS} Both devices should end up showing ${file.id.slice(0, 8)}.`;
      } catch (err) {
        note.textContent = `That did not work — ${(err as Error).message}`;
      } finally {
        pairBtn.disabled = false;
      }
    })();
  });

  openFile.addEventListener('change', () => {
    void (async () => {
      const chosen = openFile.files?.[0];
      if (!chosen) return;
      try {
        const parsed: unknown = JSON.parse(await chosen.text());
        // Checked before it is trusted, and named before it is refused: a file
        // from a newer version is a device that is ahead, not a bad file.
        const bad = malformedPairing(parsed);
        if (bad) { note.textContent = `That file could not be used — ${bad}.`; return; }
        // RELAY_HOST is what this build's CSP permits, so a file naming anything
        // else is refused with a sentence rather than failing silently later.
        const { id } = await acceptPairing(session.store, parsed, RELAY_HOST);
        await paint();
        note.textContent = `Paired. Check the other device also shows ${id.slice(0, 8)}. `
          + 'Nothing has moved yet — that happens next time either device opens, or now if you press Sync.';
      } catch (err) {
        note.textContent = `That file could not be used — ${(err as Error).message}`;
      } finally {
        // Cleared so choosing the SAME file again re-fires `change`; without it a
        // second attempt after a failure silently does nothing.
        openFile.value = '';
      }
    })();
  });

  syncBtn.addEventListener('click', () => {
    void (async () => {
      syncBtn.disabled = true;
      note.textContent = 'Exchanging…';
      try {
        note.textContent = outcomeWords(await runExchange(session, () => new Date().toISOString()));
      } catch (err) {
        note.textContent = `That exchange stopped — ${(err as Error).message} Nothing here was lost.`;
      } finally {
        syncBtn.disabled = false;
      }
    })();
  });

  // TWO STEPS, because it cuts another device off and the first press is where
  // somebody learns exactly what that does and does not mean. Not a typed word:
  // this is reversible by pairing again, unlike erasing, so the guard is
  // proportionate — read a sentence, then confirm.
  let replaceArmed = false;
  replaceBtn.addEventListener('click', () => {
    void (async () => {
      if (!replaceArmed) {
        replaceArmed = true;
        replaceBtn.textContent = 'Replace the key — press again';
        note.textContent = REPLACE_KEY_WORDS;
        return;
      }
      replaceArmed = false;
      replaceBtn.textContent = 'Replace the key';
      replaceBtn.disabled = true;
      try {
        // A fresh key, which is a fresh mailbox: whoever holds the old one is
        // talking to a place nothing arrives at any more.
        const file = await beginPairing(session.store, RELAY_HOST, new Date().toISOString());
        deliverPairing(file, pairingFilename(file.id));
        await paint();
        note.textContent = `${REPLACED_KEY_WORDS} ${FILE_WARNING_WORDS}`;
      } catch (err) {
        note.textContent = `That did not work — ${(err as Error).message} The key here has not changed.`;
      } finally {
        replaceBtn.disabled = false;
      }
    })();
  });

  forgetBtn.addEventListener('click', () => {
    void (async () => {
      await forgetPairing(session.store);
      await paint();
      // Said explicitly. Somebody unpairing is entitled to know it is not a way
      // to lose work, and the fear that it might be is what stops people using
      // a control they should feel free to use.
      note.textContent = 'This device is on its own again. Nothing you have written was touched.';
    })();
  });
}

/**
 * The whole edition, as `main` takes it: mount the surface, then exchange.
 *
 * Exchange runs AFTER the surface exists so its result has somewhere to be said,
 * and it never blocks first paint — the planner is usable while this is still in
 * flight, which is the same rule the service worker follows.
 */
export const syncEdition = (session: Session): Promise<void> =>
  mountSync(session).then(async () => {
    try {
      const outcome = await runExchange(session, () => new Date().toISOString());
      if (outcome.ran && (outcome.landed ?? 0) > 0) {
        // Only announced when something actually arrived. An exchange that moved
        // nothing is the ordinary case and does not deserve a line.
        const status = document.querySelector('#status');
        if (status) status.textContent = outcomeWords(outcome);
      }
    } catch {
      // Reported by the Sync now button if somebody asks; never fatal on open.
    }
  });
