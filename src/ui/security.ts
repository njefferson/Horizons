// "How this works, and what it protects" — the panel for people who want to know.
//
// Noah: *"I want all security explained in the app in its own location, for people
// who want to know how it works, but not explaining how to hack it."*
//
// ## The line between explaining and arming
//
// The rule this file follows: **describe PROPERTIES and CONSEQUENCES, never
// PROCEDURES.** "Anyone who gets your pairing key can read this planner, so treat
// it like a password" protects a reader. "The handover point accepts writes
// without authentication, and N of them per minute will exhaust the daily quota"
// is a recipe, and it belongs in the repo's own records where the people fixing
// it can find it — not on a screen next to somebody's shopping list.
//
// So: no constants, no limits, no thresholds, no endpoint shapes, no named
// weaknesses with the conditions that trigger them. Everything here is either a
// guarantee, a limit of a guarantee, or an action the reader can take.
//
// ## Why it is honest about limits at all
//
// Because a security page that only lists strengths is marketing, and this
// audience is being asked to trust software with the things they are most afraid
// of forgetting. The limits below are the ones a person can ACT on: keep your
// device locked, treat the key like a password, know that erasing one device does
// not empty the other. A limit nobody can act on is noise; a limit somebody can
// act on and was not told about is a betrayal.
//
// ## Why it lives in a disclosure rather than a page
//
// The (i) panel already grew to twenty-odd thousand pixels once and had to be
// rescued. This is a `<details>`: its own place, one tap, and it costs nothing to
// anybody who does not open it. Native disclosure semantics also mean no focus
// trap, no second dialog, and a screen reader announces it correctly for free.

import { editionOf } from './sibling.ts';

export interface Passage {
  heading: string;
  paragraphs: string[];
}

/** True of both editions. The device is the same in each. */
const ON_YOUR_DEVICE: Passage = {
  heading: 'Where your writing lives',
  paragraphs: [
    'On this device, in storage that belongs to this app alone. Another website cannot reach it, and nothing is kept on a server for you to log into — there is no account to log into.',
    'It is held as ordinary readable data, not scrambled. That is a deliberate choice rather than an oversight: the lock on your phone or computer is what keeps other people out of it. Scrambling it as well would mean asking you for a passphrase every single time you opened the app, and would protect you only from somebody who already had your unlocked device — which is to say, hardly at all.',
    'The practical consequence is worth being plain about: if somebody can get into your unlocked device, they can read this planner, exactly as they could read your notes or your email. Your device lock is the thing protecting it.',
  ],
};

const NEVER_LOST: Passage = {
  heading: 'Why nothing here gets lost',
  paragraphs: [
    'This app only ever ADDS to its record. Nothing you write is edited over or deleted behind your back — a change is stored as a new entry, and what the app shows you is worked out from the whole record. An update cannot rewrite your history, because updates only ever add new kinds of entry.',
    'That is also why bringing a copy back always works, and why taking in a copy from another device only ever adds to what you have. It cannot replace or remove your work.',
    'The two exceptions are the ones you ask for by name: clearing what you are holding, and starting again from empty. Both make you type a word first, and each tells you what it will do before you do it.',
  ],
};

/** The default edition's whole claim, and it is a strong one. */
const CANNOT_REACH: Passage = {
  heading: 'What leaves this device',
  paragraphs: [
    'Nothing. This version of Quietkeep has no way to send your writing anywhere — not to us, not to anyone. There is no telemetry, no analytics, no error reporting, and no sync.',
    'That is not a promise about our good behaviour. Your browser is told, in a rule it enforces itself, that this app may not contact anything on the internet at all. Even if the app tried, the browser would refuse it. The rule is checked automatically every time a new version is built, so it cannot quietly disappear.',
    'A file only leaves when you choose to export one, and it goes where you send it.',
  ],
};

/** The sync edition's posture: the trade, stated in full. */
const WHAT_TRAVELS: Passage = {
  heading: 'What leaves this device',
  paragraphs: [
    'Only your writing, sealed, on its way to your other device — and only once you have paired them.',
    'Sealing happens here, before anything is sent, using a key that exists only on your own devices. What travels is unreadable without that key. It goes to a single handover point on the internet, which holds it briefly so your other device can collect it. Your browser is told that this app may contact that one place and nowhere else, and it enforces that itself.',
    'There is still no account, no sign-in, and nothing collected about you.',
  ],
};

const THE_HANDOVER: Passage = {
  heading: 'What the handover point can and cannot see',
  paragraphs: [
    'It cannot read your writing. It never receives the key, and what it stores is meaningless without one. It also cannot change anything: an entry that had been altered on the way would fail its check on your device and be refused, rather than quietly accepted.',
    'It is not blind, though, and it would be dishonest to say it were. Like any service on the internet, it can see that a request arrived, roughly when, and which network it came from. Over time that adds up to a rough sense of WHEN a set of devices sync and how often — never what they contain, never a single word of it.',
    'What it deliberately cannot tell is how MUCH: everything is padded to a fixed size before it is sealed, so a single note and fifty of them leave here looking identical. That also shuts a subtler door — without it, somebody could in principle send you a link that slipped chosen words into your planner and then watch how the size changed. They cannot, because it does not.',
    'It also forgets. What it holds is passed on and then expires by itself; it is a place work briefly rests on the way between your devices, not a copy of your planner. Your devices hold the real thing, and if the handover point vanished tomorrow you would lose nothing.',
  ],
};

const YOUR_KEY: Passage = {
  heading: 'The key, and why pairing matters',
  paragraphs: [
    'Pairing creates one key and puts it on both devices. That key is what makes your writing readable, so it is the single most sensitive thing this app produces — anyone who obtains it can read this planner. Treat it exactly as you would a password.',
    'It never travels over the internet. You carry it across yourself, which is the point: nothing in between ever holds it, so nothing in between could ever hand it over.',
    'If you pair using a file, that file IS the key. Delete it once your other device has taken it in, rather than leaving it in a downloads folder.',
    'Both devices show the same short pairing name once they are a pair. If the two names differ, they are not paired to each other — worth checking, because otherwise the only symptom is nothing ever arriving.',
  ],
};

const OTHER_PEOPLE: Passage = {
  heading: 'Other people using this',
  paragraphs: [
    'Everyone who pairs gets their own key, and their own separate space that only that key can reach. Two households using the same handover point cannot see each other, cannot reach each other, and are not listed anywhere together. There is no account system to get wrong, because there are no accounts.',
    'So somebody else installing this — a partner, your children — has no effect on your planner and no way into it, and you have no way into theirs.',
    'One thing to know if you run a handover point that other people use: you would be able to see that their devices sync and roughly how often, in the same limited way described above. Never their writing. Still worth knowing before you offer.',
  ],
};

/** True of the build that cannot sync. It has no key and no second device, so
 *  telling its readers to guard a pairing key would describe something they do
 *  not have — the exact confusion the edition split exists to prevent. */
const NOT_PROTECTED_PLAIN: Passage = {
  heading: 'What this does not protect you from',
  paragraphs: [
    'Somebody using your unlocked device. Everything here is readable to whoever is holding it, as with any app.',
    'Losing the device without a copy. Exporting one now and again is the whole of the backup story, and it is worth doing.',
  ],
};

const NOT_PROTECTED_SYNC: Passage = {
  heading: 'What this does not protect you from',
  paragraphs: [
    'Somebody using your unlocked device. Everything here is readable to whoever is holding it, as with any app.',
    'Somebody who obtains your key. That is why it is worth treating like a password, and why you can unpair at any time — after which your devices stop exchanging and your writing stays where it is.',
    'Erasing one device does not empty the other. Each keeps its own copy, and starting again from empty applies to the device you do it on — it also unpairs that device, so the other cannot fill it back up. To empty both, do it on both.',
  ],
};

/**
 * The passages, in reading order, for whichever edition is running.
 *
 * Pure and given the hostname, so a test can hold both editions to their own
 * promises without a browser — and so the DEFAULT edition can never accidentally
 * render the sync explanation, which would describe a capability it does not have.
 */
export function securityPassages(hostname: string): Passage[] {
  const syncs = editionOf(hostname) === 'sync';
  return syncs
    ? [ON_YOUR_DEVICE, WHAT_TRAVELS, THE_HANDOVER, YOUR_KEY, OTHER_PEOPLE, NEVER_LOST, NOT_PROTECTED_SYNC]
    : [ON_YOUR_DEVICE, CANNOT_REACH, NEVER_LOST, NOT_PROTECTED_PLAIN];
}

export const SECURITY_SUMMARY = 'How this works, and what it protects';

/**
 * Build the disclosure into the (i) panel.
 *
 * Contained by its caller like every other section: an explanation failing to
 * render must not cost anybody their planner.
 */
export function mountSecurity(anchor: Element | null): void {
  if (!anchor?.parentElement) return;

  const details = document.createElement('details');
  // Its OWN class, sharing the summary's 44px target styling but not the patch
  // notes' identity. Reusing `note-older` made the smoke walk's "older releases
  // are one tap away" check find two disclosures and fail — a selector that had
  // been exact for a reason.
  details.className = 'disclosure';
  details.id = 'security';

  const summary = document.createElement('summary');
  summary.textContent = SECURITY_SUMMARY;
  details.append(summary);

  for (const passage of securityPassages(location.hostname)) {
    const h = document.createElement('h4');
    h.className = 'about-section';
    h.textContent = passage.heading;
    details.append(h);
    for (const text of passage.paragraphs) {
      const p = document.createElement('p');
      p.className = 'about-p';
      p.textContent = text;
      details.append(p);
    }
  }

  anchor.parentElement.insertBefore(details, anchor);
}
