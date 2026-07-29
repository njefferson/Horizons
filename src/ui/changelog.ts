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
    triplet: '0.7.0',
    kind: 'CAPABILITY',
    date: '2026-07-29',
    notes: [
      'What you are holding is now sorted into plain groups — not sorted yet, ready now, coming up, later, on the Menu, and done — instead of one long list. Nothing is counted or scored; they are just headings, so you can see the shape of it at a glance.',
      'You can tick something off straight from the list, without opening it first.',
      'You can fix what you wrote. Open anything and correct the words — useful when a thought went down fast and came out sideways.',
      'Something you have finished now says so, rather than claiming it is coming back to you today.',
      'Fixed: after adding something from a link, the items in your list quietly stopped opening when tapped until the next change.',
    ],
  },
  {
    triplet: '0.6.0',
    kind: 'CAPABILITY',
    date: '2026-07-29',
    notes: [
      'Tap anything you are holding and you can now change it. Until now the app could only take a thought in and sort it once; now it can hold a plan.',
      'Give something a real date, or take the date off again — if you take it off, it comes back to you today rather than going quiet.',
      'Make something repeat: how often, and how long it can go before it asks again. A plant and a phone call do not need the same patience, so each thing keeps its own.',
      'Take back a “done” if you ticked the wrong thing, keep something you had let go, or put it on the Menu where it waits without asking anything of you.',
    ],
  },
  {
    triplet: '0.5.1',
    kind: 'ITERATION',
    date: '2026-07-29',
    notes: [
      'Fixed a fault that could stop Quietkeep opening at all. If a single date in your data was malformed, the app failed to start and — worse — anything you typed while it was in that state was lost silently. Your writing was always safe on the device; it just could not be reached. It now starts regardless, and refuses to record a broken date in the first place.',
      'Something you finished can no longer come back as though you had not done it, and an item can no longer get into a state where neither finishing nor dismissing it did anything.',
      'Work can no longer disappear from the day’s list because it had two dates on it.',
      'The same thing is never shown to you twice on one screen.',
      'Tapping to see everything you are holding now lists exactly as many things as the count claims.',
      'If saving fails, you are told so where you can see it, rather than only being told by a screen reader.',
      'Finishing the last thing on the list leaves the keyboard somewhere sensible instead of nowhere.',
      'Areas and goals are no longer offered as though they were a task you could tick off.',
    ],
  },
  {
    triplet: '0.5.0',
    kind: 'CAPABILITY',
    date: '2026-07-29',
    notes: [
      'Quietkeep now opens with one thing to do, chosen for you, and says why it picked it. Behind it is a short list — never the whole pile.',
      '“Not this” moves on and keeps no record of it. Skipping something is not held against you, because nothing about it is written down at all.',
      'Things you do regularly come back on their own rhythm, and each one has its own idea of what “a while” means — the plant and the phone call are not held to the same patience.',
      'Nothing is ever marked late. When something comes round again it simply says so, and it keeps saying so gently rather than louder.',
      'Tapping what you are holding now opens the full list, with the day each thing comes back — so the count is something you can check rather than take on trust.',
      '“Today” now means today where you are. Anything you put down in the evening comes back that same evening, not the following afternoon.',
    ],
  },
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
