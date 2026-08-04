# The collision catalogue — how ND users collide with planning systems, and how Quietkeep routes each

> Commissioned by Noah, 2026-08-04: *"bring in everything you can find about how
> neurodivergent users typically collide with system problems, so they (I) can be
> properly and better routed."* Compiled from research and community knowledge,
> checked entry by entry against this repo's laws, ADRs and code. Routing marks:
> **V2-candidate** (buildable against the V2 plan), **later** (real, not yet),
> **refuse** (best served by NOT building — the refusals are load-bearing).
> Ranking proposals are held behind Q-11/Q-12 per NOTES.md's own rule.

How neurodivergent users typically collide with planning systems, and how Quietkeep routes — or could route — each collision. Sources are training knowledge of ADHD/autistic/AuDHD executive-function research and community practice; the researcher or coiner is named where one exists. Every routing proposal is written against the invariants: no "overdue", no streaks, no scores, no red walls, no shame surfaces, no prescriptive "should", rest is legitimate, one decay primitive, demand-free types, additive-only data model.

---

### 1. Task initiation cost — knowing exactly what to do and being unable to begin

- **WHAT HAPPENS** — The gap between intention and action is the core ADHD deficit Barkley locates "at the point of performance": the knowledge is intact, the launch mechanism is not. Activation cost is highest when the task is large, vague, or aversive, and the cost is paid before any progress exists to reward it. The person sits in front of the task, fully aware, unable to start — which observers misread as unwillingness.
- **HOW CONVENTIONAL SYSTEMS MAKE IT WORSE** — A long list raises the activation threshold of every item on it, and priority matrices demand a comparison at exactly the moment comparison is impossible.
- **WHAT QUIETKEEP ALREADY DOES** — The single computed Next-up card ("one thing, chosen for you"); the offer capped at two unalike options so choosing is preference, not comparison (ADR-0060); the do-now timer as a cheap entry price showing presence, never progress or countdown (ADR-0059); "Not this" cycles freely and records nothing. The azimuth check honestly names initiation as one of the thin halves.
- **ROUTING PROPOSAL** — **V2-candidate.** A "smaller bite" verb on the offer card itself: name a first physical action without leaving the surface, writing an ordinary `node.created` parented under the offered item (covered by clause (d)), and the offer then holds the bite. Same pattern as 1.19.0's `filed` route — put the act where the stuckness is, instead of a trip through the detail sheet.

### 2. The wall of awful — emotional debt accumulated on an avoided task

- **WHAT HAPPENS** — Brendan Mahan's wall of awful: every avoidance, failure, and disappointment attached to a task adds a brick, until what stands between the person and a ten-minute chore is a wall of feeling that must be climbed before the chore even starts. The task's difficulty is no longer the task; it is the history. This is why "it'll only take ten minutes" persuades nobody.
- **HOW CONVENTIONAL SYSTEMS MAKE IT WORSE** — Overdue-red and visible reschedule counts render the wall in the interface — "postponed 14 times" is the brick count read aloud — and each app-open adds mortar.
- **WHAT QUIETKEEP ALREADY DOES** — The load-bearing refusals: no "overdue" anywhere because shame produces the avoidance that made the thing late (ADR-0010); "Not this" and "Not now" are event-free forever, so the app structurally cannot recite your avoidance back to you (ADR-0056); a passed date becomes a replan card — a present decision, never a failure state (law 3); the amnesty never implies there was something to forgive (ADR-0043).
- **ROUTING PROPOSAL** — **V2-candidate.** Let the detail sheet raise a pebble whose `affects` names the item — "this one is heavy" said by the person, recorded as load, never inferred. The machinery exists end-to-end: `pebble.raised{magnitude, affects}` is vocabulary, and load already narrows the offer, never below one (ADR-0065). The app plots the co-occurrence; the human interprets. Explicitly **refuse** any avoidance *detection* — an inferred wall is the ledger this app exists to not keep.

### 3. Out of sight, out of mind — a thing that leaves the visual field leaves existence

- **WHAT HAPPENS** — Colloquially "no object permanence"; mechanically it is cue-dependent prospective memory failure (Einstein & McDaniel): intentions fire on external cues, and an item with no cue never fires. Filed means gone. The person keeps everything on the desk, the counter, and forty open tabs, because visible is the only kind of remembered.
- **HOW CONVENTIONAL SYSTEMS MAKE IT WORSE** — Filing and archiving are the *virtues* of conventional systems — inbox zero is literally the instruction to put everything where it can no longer cue you.
- **WHAT QUIETKEEP ALREADY DOES** — This collision is the thesis. Law 1's return engine: every node is on a surface, under a clock, on the Menu, or parented to something under a clock, and the write gate refuses anything else. The coverage gauge shows the proof ("everything returns · 0 silent"). 1.19.0's `filed` route makes the place, and the place carries the clock so its contents come back with it (ADR-0073).
- **ROUTING PROPOSAL** — **V2-candidate, and it is already named as owed.** When a place's review comes round, its return card carries a bounded view of contents (capped per law 8) — the 1.19.0 log entry records this exact question and says to ask Noah after he has used filing, not to guess. That sequencing is the proposal.

### 4. Time blindness — the future is not real until it is now

- **WHAT HAPPENS** — Barkley's temporal myopia: time exists as "now" and "not now", and things in "not now" carry no motivational weight until they cross the horizon and become an emergency. Duration estimation is also impaired in both directions. The person is not careless about deadlines; the deadline genuinely does not exist for them yet.
- **HOW CONVENTIONAL SYSTEMS MAKE IT WORSE** — A due date as the sole representation of time is a cliff: everything is silent until it is suddenly red, which is exactly the now/not-now boundary reproduced in software.
- **WHAT QUIETKEEP ALREADY DOES** — The decay primitive makes time continuous — pressure rises as a gradient with no cliff to print (ADR-0010). Dependency dates compute latest-start and buffer burn from lead estimates, and a miss auto-replans (0.12.0). `.ics` export with `VALARM` puts the alarming in the OS calendar, which fires with the app shut (T1). Duration estimates are logged from v1 by deliberate decision so the data exists before the learning does.
- **ROUTING PROPOSAL** — **later.** Speak approach the way decay is already spoken: where an offered item feeds a suspense, the card states the computed fact in words — "latest start is Thursday; two days of buffer" — a small approach vocabulary parallel to `pressureWords`. Facts, not urgency theatre; the fold already knows every number.

### 5. Interest-based motivation — importance does not start the engine; INCUP does

- **WHAT HAPPENS** — William Dodson's interest-based nervous system: activation follows Interest, Novelty, Challenge, Urgency, and Passion, not importance or consequence. A task can be acknowledged as critical and still produce nothing, while a fascinating trivial one produces hours. This is a different ignition system, not a values defect.
- **HOW CONVENTIONAL SYSTEMS MAKE IT WORSE** — The Eisenhower quadrant assumes importance activates — its entire top row is a dead letter for this nervous system — and "just prioritize" moralizes the mismatch.
- **WHAT QUIETKEEP ALREADY DOES** — The heat pass is a two-tap interest read (`heat.set`, ADR-0029); the Menu gives wants a home that owes nothing (law 6); a wish rides in every offer and structurally cannot become work (ADR-0060). But the azimuth check found that nothing about interest reaches `nextUp` — everything ranks on *when*.
- **ROUTING PROPOSAL** — **later, explicitly gated on Q-11 and Q-12.** The natural mechanism — heat informing which candidate fills the offer's `ready` slot — is a ranking change, and NOTES.md's own rule stands: *do not build past Q-11 on a guess*. Recorded here so that when Noah answers, the INCUP framing is on the table.

### 6. Autistic inertia and task-switching cost — hard to start, hard to stop, monotropism underneath

- **WHAT HAPPENS** — Murray, Lesser & Lawson's monotropism: attention pools deeply in few channels rather than spreading thinly across many, so entering and leaving a task are both expensive state changes (Buckle et al. documented inertia as difficulty starting *and* stopping, independent of willingness). A forced switch does not just cost minutes; it can end the day's capacity.
- **HOW CONVENTIONAL SYSTEMS MAKE IT WORSE** — Time-blocked calendars and pomodoro rotations slice the day into forced transitions, charging the switching toll a dozen times before lunch.
- **WHAT QUIETKEEP ALREADY DOES** — Focus is state-level; the resume card is written *at the interruption*, in the same transaction, because "you do not get to press a button on your way out of the room" (ADR-0039); the five-word cue is invited later, never required; the comms sweep appears only on the focus-exit ramp when its own decay has come round, consolidating the check habit instead of adding interruptions (ADR-0042).
- **ROUTING PROPOSAL** — **refuse** any scheduled-rotation or timeboxing feature: a planner that initiates switches is charging the toll the design exists to avoid. The exit side is well routed; the entry side is entry 1's proposal, not a second mechanism.

### 7. Hyperfocus — the gift that eats the day

- **WHAT HAPPENS** — Hyperfocus (reviewed by Ashinoff & Abu-Akel) is total absorption with collapsed time perception and suppressed interoception — meals, appointments, and the rest of the plan vanish. It is the same monotropic pull as entry 6 running in your favor, until the day is gone to one thing and the exit lands with guilt about everything unmoved.
- **HOW CONVENTIONAL SYSTEMS MAKE IT WORSE** — Conventional tools either spam interruptions (breaking the one genuinely productive state) or stay silent and let the dentist appointment die; none distinguish "a fact you must not miss" from noise.
- **WHAT QUIETKEEP ALREADY DOES** — The hard landscape leads `nextUp`, so real appointments outrank everything; `.ics`/`VALARM` export means the OS alarm fires even with the app shut (T1); the focus surface's elapsed clock is the one thing that runs on its own, ticks in minutes, and writes nothing (ADR-0039).
- **ROUTING PROPOSAL** — **V2-candidate.** One fact line on the focus surface: the next hard-landscape item today, in words — "Dentist at 3" — no countdown, because a countdown is a deadline and adds aversion (ADR-0059's own reasoning). The OS alarm remains the guarantee; the line is the ambient horizon the absorbed person can catch peripherally.

### 8. Demand avoidance — a demand, including your own, triggers refusal

- **WHAT HAPPENS** — PDA (Elizabeth Newson's coinage; the community reframe is "pervasive drive for autonomy"): a perceived demand produces visceral avoidance regardless of the task's appeal, and *self-imposed* demands count — writing "go for a walk" on a list can make the walk impossible. The threat is to autonomy, and the response is not chosen.
- **HOW CONVENTIONAL SYSTEMS MAKE IT WORSE** — Every conventional planner is a demand generator: due-dated everything, nagging reminders, "you should", a daily plan that is a wall of obligations by 9am.
- **WHAT QUIETKEEP ALREADY DOES** — This is the best-defended collision in the app. Demand-free kinds are enforced at the write gate — a clock on a Menu item or pebble is *rejected*, not hidden (ADR-0014); acting on a want is a deliberate promotion, never an obligation that accrued (law 6); "Not this"/"Not now" record nothing, forever; the app plots and never prescribes (law 7); rest mode puts the Menu forward.
- **ROUTING PROPOSAL** — **refuse** further building. The remaining ask — even Next up is technically an ask — is already answered by the Menu, the wish, and rest mode; softening the one offer the app makes would dismantle its purpose. The protection here is structural, and additions would only be copy.

### 9. Waiting mode — the 3pm appointment that consumes the whole day

- **WHAT HAPPENS** — Community-named "waiting mode": an upcoming fixed event makes the preceding hours unusable, because working memory must hold vigilance against missing it, and starting anything risks the hyperfocus of entry 7 swallowing the appointment. The hours exist on the clock and not in capacity.
- **HOW CONVENTIONAL SYSTEMS MAKE IT WORSE** — Calendars show the block but say nothing about the gap, and task lists keep offering two-hour work at 1:40 — reinforcing that nothing is startable, so nothing is started.
- **WHAT QUIETKEEP ALREADY DOES** — Nothing yet, honestly — though both halves of the answer exist as data: the hard landscape knows the appointment, and duration estimates have been logged since v1 precisely so a later feature would not start empty-handed.
- **ROUTING PROPOSAL** — **V2-candidate.** A pocket offer: when a hard date sits later today, the offer's work slots prefer items whose logged estimate fits the gap, and the surface states the fact — "About an hour before Dentist." No new vocabulary, no new events; a filter over the existing queue plus one honest sentence. The OS alarm already holds the vigilance, which is what makes the gap usable at all.

### 10. Spoon budgeting — capacity is finite, variable, and invisible to the plan

- **WHAT HAPPENS** — Christine Miserandino's spoon theory: energy is a small, countable, day-variable budget, and tasks draw it down unevenly. Overextension borrows from tomorrow at punitive interest. A plan built for the good-day self meets the actual day's self and loses.
- **HOW CONVENTIONAL SYSTEMS MAKE IT WORSE** — Rigid daily plans assume constant capacity; streaks and velocity metrics turn a low-capacity day into a visible failure rather than a fact about the body.
- **WHAT QUIETKEEP ALREADY DOES** — `capacity.declared` is believed on its own — the app has no standing to ask for evidence about how you are (law 7, ADR-0065); pebbles record load with magnitude, three small things or one boulder narrow the offer — never below one, and the wish stays; the note reads "Fewer things, while you have this much on", where *while* is load-bearing: co-occurrence, never causation.
- **ROUTING PROPOSAL** — **later.** The mechanism is built; the open question is reach — whether the declare verb sits where a heavy morning actually happens (the work surface) rather than down a sheet. A placement question for Noah after use, not a new mechanism.

### 11. All-or-nothing restart failure — one missed day reads as ruin

- **WHAT HAPPENS** — Burns' all-or-nothing distortion compounded by Marlatt's abstinence violation effect: a single break is experienced as the destruction of the whole endeavor, so the rational-feeling move is abandonment. Restarting means facing the accumulated pile, which is the highest-activation task imaginable, so the lapse becomes permanent.
- **HOW CONVENTIONAL SYSTEMS MAKE IT WORSE** — Streaks are this collision built as a feature — ADR-0010 says it exactly: a streak's real function is the moment it breaks — and the re-entry screen of a conventional app is a wall of red.
- **WHAT QUIETKEEP ALREADY DOES** — Re-entry is the *primary designed path* (law 8, ADR-0043): the greeting is bounded by its return type — counts only, no arrays, so no future surface can render the backlog; a weekend is not a lapse; the amnesty resolves every passed date to the Menu, marking nothing done and deleting nothing; Composed Today expires at midnight with no residue, and "what did I choose yesterday and not do" is structurally uncomputable (ADR-0051); a never-done item reads "ready again", never the loudest band (1.18.3).
- **ROUTING PROPOSAL** — **refuse.** This is the app's most completely routed collision. Anything added here — even a gentle "welcome back" flourish — risks becoming the record of absence the type system was built to make unwritable.

### 12. Novelty decay — every system works until it becomes familiar

- **WHAT HAPPENS** — Dodson's N: novelty itself supplies activation, so a new planner runs beautifully for three weeks on the dopamine of newness, then the newness is metabolized and the system joins the graveyard. Guilt about the abandoned system then blocks return to *any* system.
- **HOW CONVENTIONAL SYSTEMS MAKE IT WORSE** — Conventional systems depend on a daily tending ritual, so the moment novelty stops funding the ritual, the model collapses — and the return visit is greeted by the pile.
- **WHAT QUIETKEEP ALREADY DOES** — The thesis makes resurfacing *structural, not habitual* — the app cannot depend on the user remembering to review, because that is the capacity it compensates for; levels push down so no review ritual is load-bearing (ADR-0013); the `.ics` half keeps working from the OS calendar while the app sits unopened; and when interest returns, re-entry is the designed path, not a fire exit.
- **ROUTING PROPOSAL** — **refuse** manufactured novelty (themes, seasonal refreshes, gamified variety) — renting engagement from the mechanism that ends it. The honest residual risk is real, and the dogfood gate is already the instrument that measures whether the app survives familiarity.

### 13. Urgency addiction — only a closing door produces motion

- **WHAT HAPPENS** — Dodson's U, formalized in Steel's temporal motivation theory: motivation scales steeply with deadline proximity, so everything happens in the panic window and the person learns to manufacture crises to function. It works, at compounding cost to health and quality, and it is the only lever that has ever reliably worked.
- **HOW CONVENTIONAL SYSTEMS MAKE IT WORSE** — Fake urgency everywhere — everything red, everything "due today" — teaches the nervous system to ignore the signal entirely, destroying the one working lever.
- **WHAT QUIETKEEP ALREADY DOES** — It refuses to counterfeit urgency (no red walls, no cliff), and it computes *real* urgency honestly: latest-start from lead estimates, buffer burn, auto-replan on miss (0.12.0). The gradient never lies, so a rising signal stays credible.
- **ROUTING PROPOSAL** — **later**, folded into entry 4's approach vocabulary: real deadlines surfaced early and factually ("latest start Thursday") give an urgency-calibrated nervous system a *true* closing door at a survivable distance. The refusal to fabricate urgency is the mechanism; keeping the true signal legible is the work.

### 14. Transition costs between contexts — "just quickly" shreds the day

- **WHAT HAPPENS** — Task-switch costs (Monsell) are amplified several-fold in ADHD and autism: each context change pays a re-entry toll on the abandoned context, so five "quick" interruptions do not cost five minutes — they cost five re-immersions. The day ends with motion everywhere and progress nowhere.
- **HOW CONVENTIONAL SYSTEMS MAKE IT WORSE** — Notification-driven tools initiate switches by design, and context tags label the contexts without ever paying down the return cost.
- **WHAT QUIETKEEP ALREADY DOES** — The interruption *is* a capture (`interrupt.captured`) and the way back is written in the same transaction (ADR-0039); resume cards rank second, behind only a hard date; the comms sweep exists precisely because "each check is cheap, all of them together are the whole day" (ADR-0042); the lens changes what you look at, never what is held (ADR-0054).
- **ROUTING PROPOSAL** — **refuse** anything push-shaped beyond T0/T1. The routing here is subtractive: the app's job is to make interruption cheap to record and return cheap to find, both built — not to become another source of switches.

### 15. Rejection sensitivity meeting reminders — a nudge that lands as reproach

- **WHAT HAPPENS** — Dodson's rejection sensitive dysphoria: perceived criticism or disappointment produces disproportionate pain, and a machine's neutral reminder is read with the same raw nerve — "You still haven't…" from an app is a disappointed voice. The adaptive response is to stop opening the app, and then the system is dead.
- **HOW CONVENTIONAL SYSTEMS MAKE IT WORSE** — Overdue counts, red badges, and guilt-flavored nudge copy make every app-open an indictment; the badge number is a running tally of your failures on your home screen.
- **WHAT QUIETKEEP ALREADY DOES** — Voice is enforced, not intended: the banned-vocabulary CI gate; "ready again" and pressure gradients in place of accusation; the greeting states a fact and never apologises on your behalf — a test asserts the absence of eleven specific formulations (ADR-0043); "Stopped. It is waiting for you", never "abandoned"; the sweep says "Last pass through your messages was 6 days ago", never "you haven't checked since Tuesday" (ADR-0042).
- **ROUTING PROPOSAL** — **V2-candidate, as a constraint rather than a feature.** T2 push is on the v2 Could list, and a push notification is this collision's delivery mechanism: extend the voice gate to cover notification copy *before* T2 ships, so no sentence leaves the app unmeasured. Cheap now, impossible to retrofit after the first bad push.

### 16. Choice overload — twenty options produce zero actions

- **WHAT HAPPENS** — Iyengar & Lepper's classic finding, with Scheibehenne's meta-analytic caveat the thesis already records: the paralysis effect is real specifically where options are similar and stakes ambiguous — which describes every task list ever written. For someone already paying entry 1's activation cost, the comparison step is a second wall in front of the first.
- **HOW CONVENTIONAL SYSTEMS MAKE IT WORSE** — The list *is* the interface: forty comparable rows, each a small demand, presented as the precondition to doing anything.
- **WHAT QUIETKEEP ALREADY DOES** — Triage shows one card and asks one question, forced choice (ADR-0029); the offer is capped at two, at most one per reason, unalike by construction so choosing is preference rather than weighing (ADR-0060); even the timer's length options live in Extras, not at the point of starting, because "showing options to someone stuck at activation is choice overload where it costs most" (ADR-0059).
- **ROUTING PROPOSAL** — **refuse.** ADR-0060's own overturn clause holds the line: a third and fourth offer class is a comparison again. Routed; the work is to keep it routed.

### 17. Working-memory loss between capture and action — "why did I write this"

- **WHAT HAPPENS** — Working memory (Baddeley) holds the context that made a captured fragment meaningful, and it drops that context within hours. The capture succeeds; the retrieval cue rots. At triage, "call about the thing" is a stranger's note, so the item is routed blind, or trashed, or — worse — kept out of vague guilt.
- **HOW CONVENTIONAL SYSTEMS MAKE IT WORSE** — Inbox-zero pressure demands fast processing of exactly these stale fragments, and the interface shows the bare text as if the words were ever the whole message.
- **WHAT QUIETKEEP ALREADY DOES** — Capture is zero-chrome and demands nothing at write time, which is correct — the moment of capture cannot afford questions. Interrupt captures pair automatically with the focus they interrupted (ADR-0039), which is context by construction; the note field and the resume card's five-word cue exist for deliberate context. An ordinary dump capture, though, arrives at triage as bare words.
- **ROUTING PROPOSAL** — **V2-candidate.** The triage card states capture context as assembled fact — when it was written, and what was in focus if anything was: "Written Tuesday evening, during Roster work." Pure projection over the log; every datum already exists; zero new events; co-occurrence only (law 7). The same "context assembled" move law 3 already makes for replan cards, applied one surface earlier.

### 18. The planning/doing gap — planning as the most respectable procrastination

- **WHAT HAPPENS** — Sirois & Pychyl's finding that procrastination is short-term mood repair explains why system-tending is its favorite disguise: reorganizing the list *feels* like progress, repairs the mood, and defers the aversive task — while looking, to yourself and everyone else, like diligence. Meta-work expands to fill the anxiety available.
- **HOW CONVENTIONAL SYSTEMS MAKE IT WORSE** — Conventional systems reward tending: grooming, tagging, re-prioritizing, and perfecting the setup are always available, always virtuous-feeling, and infinitely deep.
- **WHAT QUIETKEEP ALREADY DOES** — Law 4 is the structural answer: the runway is the only workspace, altitude views are inspection modes, the user never climbs (ADR-0013); Review is exceptions-first — a top handful of computed problems, never a tree to garden; goals and areas are cheap, optional, and demand no maintenance; there is very little surface *to* polish.
- **ROUTING PROPOSAL** — **refuse** curation surfaces, permanently — and carry this entry as a design constraint on the law-4 projection work the azimuth check names as unbuilt: when higher horizons finally inform the runway, they must arrive as computed signal, never as a new place to rearrange things.

### 19. Body doubling and external accountability — another person's presence unlocks the start

- **WHAT HAPPENS** — Body doubling (from the ADHD coaching community, often credited to coach Linda Anderson): the quiet presence of another person dramatically lowers initiation cost — not through supervision but through co-regulation and a gentle anchor to the present task. External accountability similarly externalizes the launch mechanism that entry 1 shows is impaired.
- **HOW CONVENTIONAL SYSTEMS MAKE IT WORSE** — Productivity apps counterfeit it as surveillance — shared streaks, public commitments, shame-as-a-service — which converts a co-regulation need into a rejection-sensitivity trap (entry 15).
- **WHAT QUIETKEEP ALREADY DOES** — Nothing, and mostly rightly: no accounts, no social features, no telemetry are named refusals on the Won't list. The timer's pulsing presence mark is the app's one, honest "something is here with you" gesture (ADR-0059).
- **ROUTING PROPOSAL** — **refuse** simulated or networked accountability. An offline single-user app cannot ethically fake a person, and attendance-keeping is the forbidden ledger. What it can honestly do already exists: the printable today-card is a sharable artifact the owner can hand to a real human — a partner, a colleague, a body-doubling call — on his own terms, with the app never knowing.

### 20. Special-interest integration — interests as fuel, not guilt

- **WHAT HAPPENS** — For autistic and AuDHD people, special interests are the deepest and most renewable motivational reservoir (the monotropism literature treats them as attention's home state, not a distraction from it). Systems that classify interest time as "unproductive" convert the person's best energy source into a guilt source, and the guilt then contaminates the interest itself.
- **HOW CONVENTIONAL SYSTEMS MAKE IT WORSE** — Eisenhower files interests under not-urgent/not-important; "reward yourself after the real work" frames the interest as dessert that must be earned — an obligation gate on the one thing that never needed one.
- **WHAT QUIETKEEP ALREADY DOES** — The Menu is a first-class, structurally safe home for wants — a clock on one is rejected at the gate, so wanting never becomes owing (ADR-0014); a wish rides in every offer as a door, not a demand, and on a heavy day "the thing you actually wanted is the most appropriate offer in the set, not the least" (ADR-0065); rest mode puts the Menu forward.
- **ROUTING PROPOSAL** — **later, behind Q-11/Q-12** for anything algorithmic (interest-aware offering is entry 5's gated proposal). Until then the routing is the existing guarantee, worth stating as such in the app's own words: time on the Menu is never measured, compared, or earned.

### 21. Follow-through on other people's pieces — delegated things evaporate

- **WHAT HAPPENS** — Prospective memory (Einstein & McDaniel) fails hardest for intentions with no natural cue, and "waiting for Sam's reply" has none: no artifact on the desk, no scheduled moment. The choice degrades to obsessive checking or total evaporation, and the evaporation is discovered three weeks later, in front of the person it inconvenienced.
- **HOW CONVENTIONAL SYSTEMS MAKE IT WORSE** — Most tools model only your own actions; a waiting-for is either a fake task that clutters the list or a note that never resurfaces.
- **WHAT QUIETKEEP ALREADY DOES** — The waiting-for route is one tap in triage and lands with a three-day return clock (ADR-0029); the person lens attributes it when a name exists and shows the unattributed honestly, because one-tap capture makes unattributed the commonest kind (ADR-0040); request slots and the Not Now ledger keep decisions about other people's asks (ADR-0056); suspenses and the delta report carry the tracked-portfolio half (ADR-0041, ADR-0068).
- **ROUTING PROPOSAL** — **refuse** new mechanism; the machinery is unusually complete. The azimuth check's "waiting-for: zero after real use" reads as a places problem (nothing could be filed anywhere pre-1.19.0), not a missing feature — let the `filed` route bed in before concluding otherwise.

### 22. Rest guilt — the inability to rest without the rest being spoiled

- **WHAT HAPPENS** — After a lifetime of "lazy" as the explanation for executive dysfunction, rest arrives pre-poisoned: the person is too depleted to work and too guilty to recover, achieving neither. Burnout research in autistic adults (Raymaker et al.) names sustained masking and overextension without recovery as the mechanism; rest is not a luxury input here, it is maintenance.
- **HOW CONVENTIONAL SYSTEMS MAKE IT WORSE** — Streak-keeping and activity graphs make a rest day visibly emptier than every other day — the calendar heat-map's pale square is a small public accusation.
- **WHAT QUIETKEEP ALREADY DOES** — "Rest is legitimate" is law 8, not copy: rest mode exists; a weekend is not a lapse; absence is greeted with "You were away a fortnight. Everything you put down is still here" — a fact, not a bill (ADR-0043); nothing anywhere renders a completion count over time, so a rest week cannot produce a lower number on any surface.
- **ROUTING PROPOSAL** — **refuse.** Any activity summary, however kind its intent, creates the comparison that spoils the rest. The epigraph is the routing: it holds the rest, so you can rest.

---

## TOP 5 ROUTING PROPOSALS

Ranked by value to the owner as he has described his days, multiplied by fit with machinery that already exists.

1. **Place-return-with-contents (entry 3):** when a filed place's review comes round, its return card shows a law-8-capped view of what it holds — the exact "still owed" question the 1.19.0 log entry says to put to Noah after use, and the missing half of the feature that answers his stated day-ender.
2. **Capture context on the triage card (entry 17):** state when an item was written and what was in focus at the time, as a pure projection over data already in the log — highest leverage on the 1,173-item backlog he is triaging right now, at zero vocabulary cost.
3. **The "smaller bite" verb on the offer (entry 1):** split a first physical action out of the offered item without leaving the surface, the 1.19.0 pattern applied to initiation — the half the azimuth check itself names as thin.
4. **The pocket offer for waiting mode (entry 9):** when a hard date sits later today, prefer offer items whose logged duration estimate fits the gap and say so as a fact — both inputs already exist, and it converts his most-wasted hours.
5. **"This one is heavy" from the detail sheet (entry 2):** raise a pebble whose `affects` names a work item, routing the wall of awful through load machinery that already narrows the offer — one emitter away from complete.

Deliberately absent from this list: every interest-signal and ranking proposal (entries 5, 13, 20), because Q-11 is asked and not answered, and the repo's own rule — *do not build past this on a guess* — outranks any ranking here.

---
