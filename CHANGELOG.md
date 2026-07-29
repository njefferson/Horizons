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
