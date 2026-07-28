// The patch notes, and the single source of them.
//
// Doctrine §5: changelogs are written FOR THE END USER — what changed for them,
// not how. §14: patch notes tell the truth, with no absolutes the tests do not
// back. Both are why these read like sentences and not like commit subjects.
//
// Doctrine §7: the triplet is `version.capability.iteration`, one kind per
// release, and **the service-worker cache name carries the same triplet**. That
// is not a convention to remember — `tools/changelog.mjs` asserts it, and
// CHANGELOG.md is generated from this array so the two cannot drift.
//
// **Releases do not have names** (§7, Noah 2026-07-28). No monikers, no
// codenames, no name field — there is deliberately nowhere here to put one,
// because a slot that exists is a slot that generates the question. A release is
// its triplet and what it did for the person using the app.

export type ReleaseKind = 'VERSION' | 'CAPABILITY' | 'ITERATION';

export interface Release {
  /** version.capability.iteration */
  triplet: string;
  kind: ReleaseKind;
  /** ISO date. */
  date: string;
  /** What changed for the person using it. One idea per line (B-09). */
  notes: string[];
}

/** Newest first. The head of this array is the running version. */
export const RELEASES: readonly Release[] = [
  {
    triplet: '0.4.0',
    kind: 'CAPABILITY',
    date: '2026-07-28',
    notes: [
      'Quietkeep now helps you sort what you have put down. It brings up one thing at a time and asks a single question, so you never face the whole list at once.',
      'A quick first pass, if you want it: hot or cold — just a feel for what matters, two taps.',
      'Then a clear choice of where each thing goes: do it now, make it the next step, wait on someone else, keep it for someday, file it as reference, or let it go. Whatever you pick, the thing is looked after — it can never fall silent.',
      'Choosing “do it now” starts a calm two-minute timer for the small thing in front of you. You can stop it whenever; it is there to help, never to hurry you.',
    ],
  },
  {
    triplet: '0.3.0',
    kind: 'CAPABILITY',
    date: '2026-07-28',
    notes: [
      'You can now capture into Quietkeep from outside it: share a page or a note to it from any app, add a Capture shortcut to the app icon, or open a link that drops text straight in.',
      'Anything captured from a link shows a plain confirmation with an Undo, and never runs or trusts what the link contained.',
      'The app now ships a strict security policy that stops any code it did not author from running.',
    ],
  },
  {
    triplet: '0.2.4',
    kind: 'ITERATION',
    date: '2026-07-28',
    notes: [
      'The one-time welcome no longer flickers back if you reopen the app right after closing it.',
    ],
  },
  {
    triplet: '0.2.3',
    kind: 'ITERATION',
    date: '2026-07-28',
    notes: [
      'A held thought is never reported as lost. If anything goes wrong after it is saved, you are told the truth about it, and the thing you typed is never taken from you.',
      'Holding the same thought twice by tapping quickly can no longer make a duplicate.',
      'Exporting tells you plainly whether the file was made, and never records a copy that did not leave.',
      'Opening the app when the network is broken always shows the copy on your device, never an error page.',
      'Your writing reads correctly whatever your text size, and every control is reachable by keyboard with a clear focus outline.',
    ],
  },
  {
    triplet: '0.2.2',
    kind: 'ITERATION',
    date: '2026-07-28',
    notes: [
      'The storage details now read correctly to screen readers.',
    ],
  },
  {
    triplet: '0.2.1',
    kind: 'ITERATION',
    date: '2026-07-28',
    notes: [
      'Opening the app on a slow or stalling connection no longer waits on the network. After two seconds the copy already on your device appears, and any update quietly arrives for next time.',
      'Holding two thoughts in quick succession can no longer tangle the order they are recorded in.',
    ],
  },
  {
    triplet: '0.2.0',
    kind: 'CAPABILITY',
    date: '2026-07-28',
    notes: [
      'There is an ⓘ in the corner now. It holds these notes, the storage answer, and what Quietkeep is — and it introduces itself once, the first time you open the app.',
      'You can export a copy of everything to a file, whenever you like. It is plain text you can read without us, and it is yours.',
      'Every export is recorded in your own log, so your history also remembers when a copy left.',
    ],
  },
  {
    triplet: '0.1.0',
    kind: 'CAPABILITY',
    date: '2026-07-28',
    notes: [
      'Quietkeep can hold things now. Type a thought, and it comes back to you — you do not have to remember to look.',
      'What you type is kept as you type it. If you are interrupted mid-sentence and come back later, it is still there.',
      'Nothing is saved to a server, because there is no server. Your writing stays on this device.',
      'You can ask the browser to keep your data rather than treat it as disposable. The Storage panel says plainly whether it agreed.',
    ],
  },
];

export const CURRENT = RELEASES[0]!;
