# Changelog

What changed, written for the person using Quietkeep rather than for whoever
wrote it (Doctrine §5). Patch notes tell the truth: no absolutes the tests do
not back (§14).

Numbering is `version.capability.iteration` (§7). Each release is exactly one
kind — **VERSION** changes what the app is, **CAPABILITY** means it can do
something it could not, **ITERATION** refines something that already exists.

**Releases do not have names.** No monikers, no codenames — a release is its
triplet and what it did for you.

> Generated from `src/ui/changelog.ts`, which is what the app itself shows in
> its (i) panel. Edit that, then run `npm run changelog`. Don't edit this file.

## 1.6.0 — CAPABILITY

*2026-08-01*

- **&ldquo;How it hangs together&rdquo; &mdash; the whole shape, when you ask for it.** A tap opens the tree: every area, goal, and project with what sits under it, indented. It is a way of seeing, not a place to work &mdash; a row opens the thing itself, big branches say truthfully how much more they hold, and it never becomes the front page.
- **Every list is a door now.** The &ldquo;also asking&rdquo; rows under Next up, every row of &ldquo;What you are holding&rdquo;, and the things listed under a project on its sheet &mdash; all open the thing itself with a tap. Nothing on screen is words you can only look at.
- **Review finishes its four questions.** Alongside stalled projects and orphaned items, it now notices a goal nothing is feeding, and an area holding work where nothing has finished in a month &mdash; said calmly, three at a time, with the true count. Rest is legitimate; the question is only whether it is rest.
- **A quiet close to a working session.** Finishing or stopping now ends on what was true: what happened to the thing you were on, and that everything you hold is covered &mdash; in words. No timer totals, no score. And if a thread from earlier is still waiting, it asks the one question: have a look, or let it go.
- **Composing your day &mdash; optional, and off until you ask.** Turn it on under Extras and anything you hold can be chosen for today from its own sheet, up to five, sitting quietly above Next up. At midnight the choosing simply lapses &mdash; nothing counts what was chosen and not done, and the app never picks for you. Turn it off and it is gone.

## 1.5.0 — CAPABILITY

*2026-08-01*

- **Act on a whole batch at once.** Inside &ldquo;Sort things out&rdquo;, any batch now takes wholesale acts: file them all under a place, send them all to the Menu, park them all until a day, or let them all go. You see the exact sentence of what will happen &mdash; counted from the real changes, including anything that cannot take the act and why &mdash; before anything is written, and one tap takes the whole act back.
- **Nothing is ever swallowed on the way.** Sending dated things to the Menu sheds their dates visibly, letting things go saves a copy of everything first &mdash; before anything is touched, checked by machine &mdash; and the record explains every wholesale act in one line: what you did, to how many, in the very words you agreed to.
- **Fixed: &ldquo;You can still keep it after all&rdquo; is now always true.** Letting something go used to be final the moment its sheet closed &mdash; the button that promised a way back was unreachable. &ldquo;Things you let go&rdquo;, behind the &#9432; panel, now lists everything you let go, newest first; open one and keep it after all. It is recovery, not an archive: nothing there nags, decays, or counts.
- **Wishes get their own wholesale door.** Batches like &ldquo;On the Menu &mdash; read&rdquo; appear in the picker now, offering exactly what a wish can take: bring them all back as real work, or let them go. No dates, no filing &mdash; a wish holds no demands.
- Also: &ldquo;Export a copy of these&rdquo; on any batch &mdash; a reading copy of those things and their history, honestly named as not-a-backup (the whole-store export remains the real one).

## 1.4.0 — CAPABILITY

*2026-08-01*

- **Notes on things.** Anything you hold can now carry words &mdash; details, links, half-thoughts &mdash; edited on its own sheet and shown only there, so lists stay one calm line each. Clearing the box removes the note, and that is recorded honestly too.
- **Imports bring their notes along.** A file from another planner now arrives with every note attached to its item, and the summary says how many came &mdash; the loss this app once inflicted silently, then admitted, is now simply over.
- **&ldquo;What happened to this&rdquo; &mdash; every item can explain itself.** Open anything and unfold its history: when it arrived, where you sent it, what date it was given, and every time the app stepped in &mdash; each of the app&rsquo;s own moves saying why (&ldquo;so it would not go silent&rdquo;). The permanent answer to &ldquo;where did it go?&rdquo;.
- **You can read the record itself.** Behind the &#9432; panel: the append-only record everything is worked out from, every line in plain words, newest day first, with its true size stated. Reading changes nothing, and no line ever shows a note&rsquo;s or journal&rsquo;s contents &mdash; it says one was written, not what it said.
- Also: an item&rsquo;s sheet now quietly says how it was sorted (&ldquo;sorted as reference&rdquo;), and typing a year below 1000 anywhere no longer lands you in the wrong millennium.

## 1.3.1 — ITERATION

*2026-07-31*

- **Fixed: sending a dated thing to Someday no longer swallows the date.** A due date, a &ldquo;not before&rdquo;, or a parked return date on something you shelve to the Menu is now cleared as part of the same act &mdash; visibly, in the record &mdash; instead of riding along invisibly where no screen could ever show it again. The app now refuses outright to leave a Menu item carrying a date, however the attempt is made.
- **Fixed: sorting cannot act on a card that just changed.** If the thing on screen was completed, shelved, or let go while you had it open &mdash; the sheet is one tap away &mdash; tapping a route now says so and shows the fresh card, instead of quietly filing a decision you had just contradicted.
- **&ldquo;Leave it&rdquo; always moves on.** When everything left in a batch has been left once, the round starts over instead of showing the same card again while claiming it was left &mdash; and with one card remaining, it says exactly that.
- **Two dates on one day tell the truth.** Something due the same day it opens now reads as the obligation it is, not as &ldquo;not before&rdquo; &mdash; a deadline is the louder fact.
- Also: a place created mid-filing can no longer collide with an existing project&rsquo;s name whatever screen it is on; estimates and date fields stay hidden on Menu items where they could never mean anything; keyboard focus lands somewhere real after every sorting action; a typed year below 1000 stays the year you typed; and the machinery that checks every write got a set of stricter refusals with the tests to hold them there.

## 1.3.0 — CAPABILITY

*2026-07-31*

- **&ldquo;Sort things out&rdquo; &mdash; a triage that can finally reach everything.** Pick a batch in your own words &mdash; the loose things a big import brought in, everything under one project, whatever matches a word &mdash; and work through it one card at a time with the same six choices triage has always had. Nothing gets rendered as a wall, there is no countdown and no score, and leaving is always one tap that records nothing. The batch is simply smaller when you come back.
- **Tap any triage card to open it.** Renaming, a real date, filing it somewhere, naming who it is with &mdash; all reachable mid-sort now, on both triage surfaces, without losing your place.
- **&ldquo;Not before&rdquo; &mdash; the date that opens instead of asking.** Give something a day and it stays out of the way until then, comes back ready on its own, and nothing happens if the day passes &mdash; a door opening, not a deadline. Defer dates imported from another planner finally show up here too, editable at last.
- **Filing got fast.** The &ldquo;what is this part of&rdquo; list narrows as you type, each place says where it sits, and typing a place that does not exist yet offers to create the project and file under it in one go.
- Also: an optional &ldquo;about how long?&rdquo; minutes note on anything (kept for a future version that learns how long things really take &mdash; nothing checks up on it), and the machinery underneath got two orders of magnitude faster at taking in large batches, which the coming wholesale actions will stand on.

## 1.2.3 — ITERATION

*2026-07-31*

- **Fixed: naming who is running a tracked project now actually shows their name.** Saying &ldquo;they are running it&rdquo; on a project recorded the person but the carrying report went on saying &ldquo;nobody named yet&rdquo; forever. The names you already entered come back on their own &mdash; nothing to redo.
- **The import summary now tells you about notes.** Notes are not carried across yet, and the summary used to imply a file had none when it was full of them. It now says how many notes were in the file and that they do not come across &mdash; plainly, before anything is written. Carrying them in is on the roadmap.
- And the app does less invisible work: a long list it builds behind a closed panel is now built only when you open it, which keeps big planners quick.

## 1.2.2 — ITERATION

*2026-07-31*

- **Things you are holding now say where they sit.** An item that belongs to a project shows &ldquo;in &lt;project&gt;&rdquo; right on its row, and a project shows how many things are under it. Before, an imported action that already had a home looked exactly like a loose one &mdash; so a big import (say, from OmniFocus) arrived as one flat pile with no way to tell what was already filed from what still needs sorting. Now the loose ones are the ones with nothing beside them, which is what makes a backlog possible to work through.

## 1.2.1 — ITERATION

*2026-07-31*

- **Sending something to &ldquo;Do now&rdquo; no longer feels like a trap.** The offer that follows now says which thing it is asking about by name, and adds &ldquo;Leave it for now&rdquo; &mdash; so you can agree it is for today without being made to either mark it done or start a timer. It stays on your list under Next up either way.
- **The &ldquo;also asking&rdquo; list under Next up reads as a list again.** Each thing is on its own line with its name in full, above a quiet note of why &mdash; instead of name and note run together on one line, which read like a paragraph rather than a set of separate things.

## 1.2.0 — CAPABILITY

*2026-07-31*

- **Undo, for when a card moves and you want it back.** Triage is meant to be quick &mdash; one tap and the card is gone &mdash; but quick can feel like lost. Now, right after you sort a card, it says where it went and offers to take it back. One tap returns it to your inbox, exactly as it was, whichever way you had sent it.
- **Search: find anything you are holding.** Type a word and everything that matches is there, each one saying where it is now, and tapping it opens it. It only searches what you are actively holding, it never changes anything, and it keeps no record of what you looked for.

## 1.1.0 — CAPABILITY

*2026-07-31*

- **A short walkthrough the first time you open Quietkeep.** Four calm steps on what it is and how it works &mdash; put something down, it sorts and times itself, it is all on your device. You can Skip at any point, and it never interrupts again.
- Want it back? &ldquo;Show the walkthrough again&rdquo; is under the ⓘ, beside how to use the app.
- **A Help section under the ⓘ** &mdash; short, tap-to-open answers to the things people ask: getting a thought out of your head, what happens after, how it picks what is next, dates that have gone by, reminders, privacy, backups, and two devices.
- And, for the curious, &ldquo;Why does it work this way?&rdquo; opens the full reasoning behind Quietkeep &mdash; a readable page right here in the app on how memory, attention and motivation actually work, with every source named and tagged by how well established it is.

## 1.0.1 — ITERATION

*2026-07-31*

- **The ⓘ panel now opens with what Quietkeep is, how to use it, and how to add it to your home screen** &mdash; not with the storage details. The first thing you see is the app explaining itself, and the install steps are there for iPhone, iPad, Android and computer.
- Everything else in the panel is grouped into named areas &mdash; your data, extras, and about &mdash; instead of one long run of tools, and it points back to the rest of the free apps at noahjefferson.pages.dev.

## 1.0.0 — VERSION

*2026-07-31*

- **This is version one.** Every capability the planner was built to have is in place and in daily use &mdash; friction-free capture, triage, a single Next-up, dates and repeats, the Review that surfaces only what has stalled, the person lens, the carrying report, and calendar reminders. Nothing here is a preview any more.
- It stays exactly what it always was: yours, on your device, with no account, no telemetry, and no server holding your data. Keeping two devices in step is a separate edition you opt into; the planner itself still cannot reach anything at all.

## 0.27.3 — ITERATION

*2026-07-31*

- **Two devices now catch up on their own — no need to press Sync.** While a device is open it quietly keeps in step with the other, and it checks the moment you switch to it. Before, a full catch-up could take a few taps of &ldquo;Sync now&rdquo; because each tap did only one leg of the back-and-forth; now opening both is enough.
- A single &ldquo;Sync now&rdquo; also finishes the whole exchange in one go, rather than one step of it, and tells you the total it moved.

## 0.27.2 — ITERATION

*2026-07-31*

- **Fixed: work synced from your other device now appears straight away.** When a device received a planner from its pair, the items landed but the screen could stay blank until you closed the app and reopened it &mdash; which looked exactly like sync doing nothing. Now the moment anything arrives, what you are looking at updates to show it, with no restart.

## 0.27.1 — ITERATION

*2026-07-30*

- **Dropping a device now actually clears its access.** &ldquo;Replace the key&rdquo; used to stop only new work from reaching a device you let go; the last few weeks already waiting at the handover point could still be collected. Now, if this device is online, it empties that too &mdash; and says plainly when it could not, so you are never told a device is cut off when it is not.
- **A page you can open to see the handover point&rsquo;s health.** If your other device is not catching up, you can now check in plain words whether the handover point is up, and what a hold-up most likely means &mdash; it is almost always a daily limit that resets on its own, with nothing lost.
- **Taking a key in now carries a warning, where before only giving one out did.** A key someone hands you lets them read this planner, so the app now says so at the moment you paste or open one, and tells you to check the pairing name against your other device&rsquo;s screen.
- Several places where the app described its own safety more confidently than it should have are now corrected to say exactly what is and is not protected &mdash; what leaves the device, what a handover point can tell, and what replacing a key can and cannot undo.
- Fixed: a device whose key was replaced could stay quiet until you next wrote something, instead of bringing a fresh device fully up to date straight away.

## 0.27.0 — CAPABILITY

*2026-07-30*

- **Two devices can keep each other up to date &mdash; in a separate app called Quietkeep Sync.** Pair them once, and from then on each brings the other up to date when you open it. No account, nothing to sign in to.
- Pairing shows a code and a key. Scan the code with your other device, or paste the key into it &mdash; nothing is written to a file unless you ask for one, so there is no copy of it left in a downloads folder afterwards.
- You can see which devices have written here, and when each one last did. If you want to drop one, replacing the key stops it receiving anything from this device from that moment on &mdash; though whatever it already holds, it keeps.
- Your writing is sealed on your device before any of it leaves, with a key only your devices hold. The handover point in between stores something it cannot read and is never given the key.
- Both devices show the same short pairing name. If one shows something different they are not a pair &mdash; worth being able to see, rather than working it out from the fact that nothing ever arrives.
- **Quietkeep itself still cannot reach anything at all, and that does not change.** It is the more private of the two and stays the one you get by default; the browser refuses to let it contact anything, whatever it is asked to do. Moving your work across is an export and an import, once.
- Taking in another device&rsquo;s work only ever adds. It never replaces and never removes, so neither side can lose anything to the other.

## 0.26.0 — CAPABILITY

*2026-07-30*

- **When a newer version is ready, it says so and offers you a copy first.** A line above the app, not something over it, with &ldquo;Save a copy&rdquo;, &ldquo;Reload now&rdquo; and &ldquo;Not now&rdquo;. Ignore it and nothing changes.
- It does not pretend anything is at risk, because nothing is — this app only ever adds to its record and an update cannot rewrite it. A copy is a point to come back to, and that is all it claims to be.
- It appears once. Declining is an answer, not a question to ask again.

## 0.25.1 — ITERATION

*2026-07-30*

- **&ldquo;Ready now&rdquo; means somebody set a date.** A thousand things you had never dated were being counted as ready today, and the number on the icon said so. What the app puts on something to make sure it comes back is not a date you chose, and it no longer pretends to be.
- **When nothing is asking, it says what is actually going on** — how many things are here without a date, waiting on you to decide — instead of the section quietly vanishing.
- A card you were interrupted in the middle of now carries its own return, so it is offered back whatever else changes.

## 0.25.0 — CAPABILITY

*2026-07-30*

- **A date that already went by in your old planner does not arrive as something asking today.** Importing a long-running planner used to turn years of passed dates into that many things needing a new plan on the morning of the import. They come in without a date instead, and the app tells you how many and why before you press anything.
- **No heading shows more than 25 things at once.** It says exactly how many it is holding back, and one tap shows them. A list of a thousand rows is the pile in a new coat.
- Anything already finished in the other planner arrives finished.

## 0.24.1 — ITERATION

*2026-07-30*

- **Buttons stay with the thing they belong to.** On a long title, &ldquo;Done&rdquo; used to wrap onto a line of its own and sit directly above the *next* item — so it looked like it belonged to that one instead. The box is now drawn around the whole row, including its buttons, at every width and text size.
- A gate now measures this, so it cannot come back quietly.

## 0.24.0 — CAPABILITY

*2026-07-30*

- **The number on the app icon is optional.** One button in here turns it off, and it goes off straight away rather than at the next reload. Nothing is lost — the app still holds everything and still tells you inside.
- **You can bring work in from another planner.** An OmniFocus export — TaskPaper or CSV — or anything else TaskPaper-shaped. Projects keep their contents, and dates you set over there arrive as dates you set here, so they are the sort a calendar can carry.
- It reads the file and tells you what it found *before* anything is written, including what will not come with it: flags, contexts, estimates and repeats stay behind, because this app has no priority field on purpose.
- It goes in beside whatever is already there. Saving a copy and starting again from empty first is one section down, if you want a clean run.

## 0.23.2 — ITERATION

*2026-07-30*

- **Your calendar only gets days you chose.** It was also being offered every date Quietkeep sets for itself — the “back with you tomorrow” it puts on anything you route — so routing nine things in one afternoon offered nine all-day events on a single day, with alarms, none of which you had dated. Those stay here now, where they belong.
- If nothing has a date you set, it says so and says why, instead of looking broken.
- **The number on the app icon is findable.** It is how many things are ready now, it is stated beside what you are holding in the same words, and the panel explains it. Before, it was a number that appeared nowhere inside the app.

## 0.23.1 — ITERATION

*2026-07-30*

- **The build number is on the main screen now,** at the bottom, small. It was only inside this panel’s title, so a screenshot of the app could not say which build it was — which is exactly how you end up looking for something your device does not have yet.

## 0.23.0 — CAPABILITY

*2026-07-30*

- **You can clear things out, two different ways.** *Clear what I’m holding* empties your surfaces and keeps every record of what happened, so a copy you export afterwards still has all of it. *Start again from empty* replaces the lot, history included, and cannot be undone from inside the app. The panel says which is which before you choose.
- **Neither can be done by accident.** Each asks you to type a short word first — a different word for each, so a word typed for one can never authorise the other — and switching between them clears what you typed.
- **It recommends saving a copy, with the button right there,** and the sentence above the go-ahead says plainly whether you have saved one.
- It tells you the real count of what is about to go, never a rounded one.

## 0.22.0 — CAPABILITY

*2026-07-30*

- **You can put some sample work in.** An empty planner is hard to judge, so there is now a button that adds a small set of ordinary work dated around today — a job with two steps, something whose date has already gone by, something you are waiting on someone else for, a couple of things nobody is asking of you, and two notes not yet sorted. It goes in beside anything you already have and behaves exactly like your own work.
- There is no button that takes only the sample work back out again, and the panel says so before you press it.
- **Files you export now carry your own date, not the world’s.** In the evening an exported calendar was named with tomorrow’s date while saying inside that it was made today. Same day in both places now.

## 0.21.1 — ITERATION

*2026-07-29*

- **The X on the (i) panel stays where you can reach it.** It was pinned to the top of the panel, and on the iPad it scrolled away with everything else — so both ways out ended up at the very top and the very bottom of a panel thousands of pixels long. It no longer moves at all, because it is no longer inside the part that scrolls.
- **And the panel is not thousands of pixels long any more.** It was showing every release note ever written, all at once. Now it shows what changed this time, with everything older one tap away.
- Escape closes it too, on a keyboard.
- Sorry — you told me about this one twice.

## 0.21.0 — CAPABILITY

*2026-07-29*

- Today, on one page. The thing to do next, what else is ready, what is with other people, and what is coming up — for a meeting where a screen is rude, or a day the battery is going to lose.
- It says on the page that it is a snapshot, and that ticking something off on paper does not reach Quietkeep. Paper cannot update, and you should not have to remember that at four in the afternoon.
- It is one page on purpose. What it leaves off, it counts — "and 34 more" — so you always know what is not in your hand.
- **And "Print it" now prints the right thing.** It used to hand your printer the whole app: the panel you pressed it in, everything behind that panel, and the page layout doing its best. The button worked and what came out was unusable. Fixed for the status report as well.

## 0.20.0 — CAPABILITY

*2026-07-29*

- You can now put down something that is on your mind but **is not a task** — "the thing with the roof" — without first inventing a next step for it. Being made to write a worry as a task is how you end up with steps you will never do, on a list you are supposed to trust.
- **The first question is whose it is, not what you are going to do about it.** Asking for a next action first is what makes people make one up.
- Three answers: mine to do something about, mine to keep an eye on, or **not mine to carry**.
- "Not mine to carry" is a real answer and it is honoured completely. It is let go, it is not parked, and **it does not come back "just to check"**. An app that quietly re-raises what you released is one that did not believe you.
- "Mine to do something about" sends it to your inbox, and only then are you asked what the actual next step is.
- "Mine to keep an eye on" parks it and brings it back in a week. Nothing to do in the meantime, and nothing carried in your head either.
- One at a time. It says how many are there and shows you exactly one — a list of worries is a worse thing to look at than any single worry on it.
- Nothing here calls it a problem, or you a worrier, and letting something go gets the plainest sentence in the app rather than a congratulation.

## 0.19.0 — CAPABILITY

*2026-07-29*

- The Menu is a place now, not just a heading. Things you have put there are grouped by what they are for — Read, Try, Go, Make, Look into, Save for — instead of sitting in one undifferentiated pile.
- **It is behind a button and it is closed when you arrive.** A list of things you want that greets you every morning is a list of things you owe. The button says how many, and says plainly that none of them are asking.
- A category you have nothing in is not shown. An empty "Go" is not a gap to fill; it is a thing you have not wished for.
- Something you are saving for can now hold two numbers: what it costs and what you have put by. "£120 put by of £300. £180 to go."
- **There is no bar, no percentage, and no date worked out from how fast you are saving.** A bar is a machine for implying you are behind, and this is the one part of Quietkeep that structurally cannot ask you for anything.
- Both numbers are yours to set and either can be left empty. Clearing one unsays it rather than recording that something costs nothing.
- Nothing on the Menu carries a clock, and putting a number on a wish does not turn it into a deadline.

## 0.18.0 — CAPABILITY

*2026-07-29*

- Come back after a week or more away and Quietkeep says so plainly — how long you were gone, and that everything you put down is still here. That is the whole greeting. It does not present you with a bill.
- **It cannot show you the pile.** Not after a fortnight, not after a year, not with a thousand things waiting. What you get is one thing to do next, at most three to sort, and the count — and there is no setting, no length of absence and no amount of work that changes that.
- It says how many are waiting and then says "a few at a time". A number is a fact; a list is a demand.
- If dates went by while you were away, you can move them all to the Menu in one go. **Nothing is deleted and nothing is marked done** — everything is still there and you can bring any of it back whenever you want.
- What that actually removes is not the work. It is the twenty separate decisions standing between you and being able to start, which is the real cost of coming back.
- You can decline and take them one at a time instead. Saying no is not recorded as anything.
- Nothing here says you are behind, and nothing apologises on your behalf. Being away is not something that happened to your list — it is something you did, and it was allowed.

## 0.17.1 — ITERATION

*2026-07-29*

- "Worth a look" was staying quiet about a stalled piece of work when the only thing left under it was the leftovers of a finished focus session. That is exactly the failure it exists to catch, and it was hidden by residue.
- A status report could be made to say "Nothing to report." when there was plenty to report — anything you had written down on more than one line could break the shape of the document. It is a page you hand to another person, so it now says only what is true.
- Work brought in from your other device is now included in the next report. It was being left out for being older than your last one, even though you had never seen it and had certainly never told anyone about it.
- Somebody you have let go is no longer named as running something. It was still showing their name, confidently, which is worse than showing none.

## 0.17.0 — CAPABILITY

*2026-07-29*

- Messages arrive all day and attention does not divide. If you want it, Quietkeep now offers a single pass through them **at the moment you come out of working on something** — when looking costs least.
- **Never while you are in the middle of anything.** A prompt that can turn up at any moment is a notification wearing different clothes, and it would be the exact interruption this is meant to replace.
- It is off unless you ask for it, in the (i) panel. A planner that arrives having decided you should check your messages twice a day has made a decision about your working life it was not asked to make.
- Saying "not now" writes nothing at all. Not a record, not a mark, nothing — it comes round again exactly as if it had never asked.
- It counts nothing. Quietkeep cannot see your messages and never will, and there is no number here for anyone to feel bad about.
- Turning it on does not immediately interrupt you for having turned it on. The rhythm starts from that moment.

## 0.16.0 — CAPABILITY

*2026-07-29*

- Some work you do; some work you **carry**. Open anything you have made bigger than one step and say "someone else is doing this", and it moves to a new "Carrying" — who is running it, when you owe an answer, and what is outstanding.
- **Quietkeep stops offering you their work.** Nothing under something you are only carrying will be handed to you as your next step. It stays on your list, because it is still real — it just stops being your job.
- Nothing is graded. No "at risk", no amber, no colour that means anything about how someone else is getting on. It states who and when and lets you decide, because it does not have the evidence to do anything else.
- You can now say when you owe somebody an answer, and that date behaves like any other — when it goes by it asks you what to do about it rather than sitting there.
- And there is now a report. What has changed since the last time you told anyone — finished, come back, now with someone else — plus what is still outstanding and what is coming up.
- Copy it, save it as Markdown, save it as a spreadsheet, or print it. Nothing is sent anywhere; it is written for you to hand over yourself.
- It is worked out from your own history, so **nothing has to be kept up to date for it to be right**. There is no second list to maintain and no chance of the two disagreeing.
- The next report starts where the last one ended. It will not tell you the same thing twice.
- If your browser will not let Quietkeep use the clipboard, it shows you the text instead of losing it with an apology.

## 0.15.0 — CAPABILITY

*2026-07-29*

- Quietkeep can now answer "what am I waiting on Sam for". A new "With other people" shows everything that is with someone else, longest-waiting first — the one worth mentioning when you next see them.
- **Things nobody has named show up too.** Sending something to "Waiting for" is one tap and never asks who, so most of what you are owed has no name on it. A list that quietly left those out would be worse than wrong, because you would trust it.
- You can put a name to something whenever you like, in its own sheet, and say how they are involved — they owe you it, they asked for it, they are running it, they care about it, or they just came up.
- Nobody has to be named. Ever. A thing you are owed works exactly the same without one.
- It says how long, in plain words — "with Sam for three weeks". That is a fact about a date and nothing more. Nothing here says anyone is late, and nothing counts how many times you have asked.
- When it arrives, say so. It comes off what you are owed and stays on your list, because a thing arriving is not a thing finished — it is usually the moment the actual work becomes possible.
- Typing "sam" when you already have a "Sam" links to the Sam you have. One person, one place, however you type it.

## 0.14.0 — CAPABILITY

*2026-07-29*

- You can now work on one thing. Tap "Work on this" and Quietkeep holds that one item in front of you, says how long you have been at it, and gets out of the way.
- When something else comes up, put it down without stopping. It goes into your inbox like anything else and you carry on — no dialog, no decision, no losing your place.
- **Your way back is saved the moment you write the interruption down**, not when you stop tidily. Close the app, get called away, let the battery die — come back and it still knows where you were. Being pulled away without getting to press a button is the whole reason this exists.
- When you do stop, you can leave yourself five words: "I was about to…". It is optional, saying nothing is completely ordinary, and nothing asks twice.
- What comes back is your own sentence, not the app’s. If you left five words, that is what it says.
- Switching to something else leaves a way back to what you put down. Swapping tasks is the most ordinary thing anyone does and it should not quietly cost you a thread.
- Finishing leaves no way back, because there is nothing to come back to. Nothing offers you a route into work you have already done.
- A thread you let go is let go. The work itself stays exactly where it was — nothing is deleted and nothing is marked done on your behalf.
- Being interrupted is not a failure here. It counts what you wrote down, which is a thing you did, and there is nothing that says you were distracted, late, or off track.

## 0.13.0 — CAPABILITY

*2026-07-29*

- Bigger things can now hold smaller ones. Open anything and say "this is bigger than one step", and it becomes something other work can sit under — the report, and the three things that actually make it happen.
- Nothing is filed away out of reach. Whatever you put under something else is still on your list and still comes back to you on its own. This app does not have a place where things go quiet.
- A new "Worth a look" appears when something is structurally broken — and only then. Most of the time it is not on the page at all, because most of the time nothing is wrong.
- The thing it catches is the expensive one: a bigger piece of work with no actual next step under it. That looks perfectly ordinary everywhere else in the app, and nothing happens for weeks.
- It also catches anything that lost what it belonged to, which can happen when you bring in a copy from another device.
- It shows at most three at a time and says how many there really are. Coming back after a fortnight should not be a wall.
- It is a count, never a score. Nothing here says you are late, and nothing here congratulates you for an empty list — an empty one simply is not there.
- You cannot put a thing inside itself, or inside something already under it. That is refused as you try, and the picker never offers it in the first place.

## 0.12.0 — CAPABILITY

*2026-07-29*

- You can now say that one thing holds up another, and how long it takes — and Quietkeep works out the last day it can start. Six days until the thing you promised, two days of work, so start it within four.
- A date that has gone by now tells you what it cost. Instead of only "that date was two days ago", it says which commitment it fed and that it needed starting two days ago — the part that is genuinely hard to work out in your head.
- Nothing is ever guessed. Without both a date on the other thing and a length on this one, it stays quiet rather than inventing a number.
- When the dates do not fit, it says so about the dates. Not about you — there is no "behind", no "late", and there never will be.
- You cannot make two things each wait for the other. That is refused as you try, because it has no meaning and no fix.
- Finishing or letting go of the thing downstream stops it pulling on anything. A commitment you are no longer under cannot make something else urgent.

## 0.11.0 — CAPABILITY

*2026-07-29*

- Two devices can now carry the same work. Export from one, and on the other choose "Take in what I don’t have" — anything the copy has and this device doesn’t is added, and nothing here is removed.
- It is opt-in and it is manual: nothing runs on its own and nothing is sent anywhere. There is still no account, no server and no telemetry, and the app is complete without ever using it.
- Taking in the same copy twice costs nothing and says so, because being unsure whether you already did is the ordinary case.
- Letting something go on one device lets it go on both once you have exchanged — this carries decisions across, not just new items.
- Replacing everything is still there, unchanged, for setting a device up again. The two are now separate buttons that say which is which, and the one that cannot lose anything is the one your keyboard lands on.
- If you edit the same thing on both devices before exchanging, the most recent edit wins and the other is quietly dropped. That is a real limit and it is said here rather than hidden.

## 0.10.1 — ITERATION

*2026-07-29*

- A "Do now" thing can now simply be marked done. Before, the only thing on offer was a two-minute timer, so a job you finished in forty seconds stayed on your list until you went looking for it.
- The two-minute timer is now something you choose, not something that starts on you. "Do now" is a category — the timer is a tool, and it is there if you want it.
- When the two minutes are up, Quietkeep asks whether you finished. It used to record that you had, without asking. Time running out is not the same as being done, and saying "not yet" is not a failure.
- The Do now panel no longer disappears when your inbox goes empty. Sorting your last item into it made the whole thing vanish, timer and all.
- The panel has a close button at the top that stays with you as you scroll. Closing it used to mean scrolling past every release note to reach the bottom.
- Sending to your calendar now confirms it where you can see it. The confirmation was appearing above the button, off the top of the screen — so it looked like nothing had happened.
- A damaged or joined-together copy is now refused before anything is replaced, and says what is wrong with it in a sentence.

## 0.10.0 — CAPABILITY

*2026-07-29*

- You can bring a copy back. Quietkeep could hand you everything it held and had no way to read it back, so moving to a new device meant starting again and the exported file was one nothing could open. Choose an export in the panel and it comes back.
- It tells you what is in the file before anything changes — how many things, and when the copy was made — so you can check it against what you remember rather than trusting a filename.
- Bringing a copy back replaces what is on this device. It is never merged, and the app says so plainly before you decide. Saving a copy of what is here now is offered first, and listed first.
- A file that is not a Quietkeep export, or one that has been damaged or cut short, is refused with a reason — and refused before anything of yours is touched.
- The panel and the main screen now count the same way. "Things held" in the panel was counting things you had let go, so it could read one higher than the number on the screen behind it.

## 0.9.0 — CAPABILITY

*2026-07-29*

- A date that has gone by now asks you what to do about it, instead of sitting in the list looking like something you could still get on with today. There is no list of things you did not do in this app, and there never will be.
- Five ways out, all of them forward-facing: do less of it, hand it to someone else, move the date, pick a new one, or decide it is not happening now. Choosing "not now" puts it on the Menu, where nothing is owed — and that is as easy to reach as any of the others.
- Whatever you choose, every date that had gone by goes with it, so the same thing does not come straight back asking again.
- At most three at a time, and it tells you how many there are altogether. Coming back after a fortnight away should not be a wall.
- Something waiting on a new plan is no longer offered as "next up" as well, asking to be done today — that was the one question its date had already ruled out. It still appears in the list of what you are holding, under its own heading, so nothing is hidden.

## 0.8.1 — ITERATION

*2026-07-29*

- The calendar file is now accepted by strict calendar apps. Text pasted from a PDF or a terminal could carry invisible characters that quietly made the file invalid.
- Something parked until a date now goes to your calendar too. The list said "parked until Friday" while the calendar quietly left it out.
- A reminder is never dated in the past, so it can actually go off — previously anything already waiting was sent with a moment that had been and gone.
- The panel no longer shows you a stale answer. Reopening it used to repeat whatever it said last time, however much had changed since.
- After sending to your calendar, the keyboard stays on the button and the result is announced, instead of silently jumping to the top of the page.

## 0.8.0 — CAPABILITY

*2026-07-29*

- Quietkeep can now tell you about something when it is closed. Send what you are holding to your calendar, and the calendar reminds you at 9am on the day — it already runs when this app does not, so you no longer have to remember to open anything.
- Repeating things go across as real repeats, so the calendar keeps asking on its own rather than needing a fresh copy every time.
- It is a snapshot of the moment you send it, and the app says so plainly. Change a date here afterwards and the calendar will not follow — send a fresh copy when it matters.
- Nothing you have finished, and nothing sitting on the Menu, is ever sent as a reminder.
- On devices that support it, the app icon now shows how many things are ready — and only those, so it is a number that can actually reach zero.

## 0.7.2 — ITERATION

*2026-07-29*

- Ticking something off twice by tapping quickly can no longer record it twice.
- After you tick something off, the keyboard stays with your list instead of jumping to the top of the page, and the app now says out loud what you just finished.
- Typing a new name for something is no longer thrown away if you change a date in the same panel before saving it.
- Things on the Menu no longer show a Done button. The Menu is the one place that asks nothing of you, and a row of completion buttons made it look like a list of things owed.

## 0.7.1 — ITERATION

*2026-07-29*

- A card could show one date while being filed under another — it now tells you about whichever date will actually bring it back to you.
- Something far in the future now says which year, so next September and September in ten years no longer look the same.
- Something set aside until a date now says when it comes back, instead of just “held”.
- Renaming refuses a title made only of invisible characters, which used to leave a blank card you could no longer identify, and very long titles are trimmed so one thing cannot bury the rest.

## 0.7.0 — CAPABILITY

*2026-07-29*

- What you are holding is now sorted into plain groups — not sorted yet, ready now, coming up, later, on the Menu, and done — instead of one long list. Nothing is counted or scored; they are just headings, so you can see the shape of it at a glance.
- You can tick something off straight from the list, without opening it first.
- You can fix what you wrote. Open anything and correct the words — useful when a thought went down fast and came out sideways.
- Something you have finished now says so, rather than claiming it is coming back to you today.
- Fixed: after adding something from a link, the items in your list quietly stopped opening when tapped until the next change.

## 0.6.0 — CAPABILITY

*2026-07-29*

- Tap anything you are holding and you can now change it. Until now the app could only take a thought in and sort it once; now it can hold a plan.
- Give something a real date, or take the date off again — if you take it off, it comes back to you today rather than going quiet.
- Make something repeat: how often, and how long it can go before it asks again. A plant and a phone call do not need the same patience, so each thing keeps its own.
- Take back a “done” if you ticked the wrong thing, keep something you had let go, or put it on the Menu where it waits without asking anything of you.

## 0.5.1 — ITERATION

*2026-07-29*

- Fixed a fault that could stop Quietkeep opening at all. If a single date in your data was malformed, the app failed to start and — worse — anything you typed while it was in that state was lost silently. Your writing was always safe on the device; it just could not be reached. It now starts regardless, and refuses to record a broken date in the first place.
- Something you finished can no longer come back as though you had not done it, and an item can no longer get into a state where neither finishing nor dismissing it did anything.
- Work can no longer disappear from the day’s list because it had two dates on it.
- The same thing is never shown to you twice on one screen.
- Tapping to see everything you are holding now lists exactly as many things as the count claims.
- If saving fails, you are told so where you can see it, rather than only being told by a screen reader.
- Finishing the last thing on the list leaves the keyboard somewhere sensible instead of nowhere.
- Areas and goals are no longer offered as though they were a task you could tick off.

## 0.5.0 — CAPABILITY

*2026-07-29*

- Quietkeep now opens with one thing to do, chosen for you, and says why it picked it. Behind it is a short list — never the whole pile.
- “Not this” moves on and keeps no record of it. Skipping something is not held against you, because nothing about it is written down at all.
- Things you do regularly come back on their own rhythm, and each one has its own idea of what “a while” means — the plant and the phone call are not held to the same patience.
- Nothing is ever marked late. When something comes round again it simply says so, and it keeps saying so gently rather than louder.
- Tapping what you are holding now opens the full list, with the day each thing comes back — so the count is something you can check rather than take on trust.
- “Today” now means today where you are. Anything you put down in the evening comes back that same evening, not the following afternoon.

## 0.4.0 — CAPABILITY

*2026-07-28*

- Quietkeep now helps you sort what you have put down. It brings up one thing at a time and asks a single question, so you never face the whole list at once.
- A quick first pass, if you want it: hot or cold — just a feel for what matters, two taps.
- Then a clear choice of where each thing goes: do it now, make it the next step, wait on someone else, keep it for someday, file it as reference, or let it go. Whatever you pick, the thing is looked after — it can never fall silent.
- Choosing “do it now” starts a calm two-minute timer for the small thing in front of you. You can stop it whenever; it is there to help, never to hurry you.

## 0.3.0 — CAPABILITY

*2026-07-28*

- You can now capture into Quietkeep from outside it: share a page or a note to it from any app, add a Capture shortcut to the app icon, or open a link that drops text straight in.
- Anything captured from a link shows a plain confirmation with an Undo, and never runs or trusts what the link contained.
- The app now ships a strict security policy that stops any code it did not author from running.

## 0.2.4 — ITERATION

*2026-07-28*

- The one-time welcome no longer flickers back if you reopen the app right after closing it.

## 0.2.3 — ITERATION

*2026-07-28*

- A held thought is never reported as lost. If anything goes wrong after it is saved, you are told the truth about it, and the thing you typed is never taken from you.
- Holding the same thought twice by tapping quickly can no longer make a duplicate.
- Exporting tells you plainly whether the file was made, and never records a copy that did not leave.
- Opening the app when the network is broken always shows the copy on your device, never an error page.
- Your writing reads correctly whatever your text size, and every control is reachable by keyboard with a clear focus outline.

## 0.2.2 — ITERATION

*2026-07-28*

- The storage details now read correctly to screen readers.

## 0.2.1 — ITERATION

*2026-07-28*

- Opening the app on a slow or stalling connection no longer waits on the network. After two seconds the copy already on your device appears, and any update quietly arrives for next time.
- Holding two thoughts in quick succession can no longer tangle the order they are recorded in.

## 0.2.0 — CAPABILITY

*2026-07-28*

- There is an ⓘ in the corner now. It holds these notes, the storage answer, and what Quietkeep is — and it introduces itself once, the first time you open the app.
- You can export a copy of everything to a file, whenever you like. It is plain text you can read without us, and it is yours.
- Every export is recorded in your own log, so your history also remembers when a copy left.

## 0.1.0 — CAPABILITY

*2026-07-28*

- Quietkeep can hold things now. Type a thought, and it comes back to you — you do not have to remember to look.
- What you type is kept as you type it. If you are interrupted mid-sentence and come back later, it is still there.
- Nothing is saved to a server, because there is no server. Your writing stays on this device.
- You can ask the browser to keep your data rather than treat it as disposable. The Storage panel says plainly whether it agreed.
