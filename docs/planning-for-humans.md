# Planning for Humans

Why Quietkeep is shaped the way it is.

Every feature below is traced to the finding that motivated it, and **every
finding carries an epistemic tag**, because the strength of the evidence varies
enormously and pretending otherwise would be dishonest about a subject where
people have been sold a great deal of confident nonsense.

- ****established**** — Replicated, broadly accepted in the literature. Safe to design on.
- ****emerging**** — Real research, genuinely unsettled. Designed for cautiously and reversibly.
- ****community-construct**** — Named and described by the community it concerns, widely recognised as real experience, **not** a validated clinical construct. Treated as a *description of experience*, never as a mechanism.
- ****negative finding**** — Something once believed that **did not replicate** or does not transfer. These constrain the design by forbidding things.

A design decision resting on an `emerging` or `community-construct` finding is
built so it can be removed. One resting on a `negative finding` is a prohibition,
and prohibitions here are permanent.

**Two things this document is not.** It is not a claim that Quietkeep is a
clinical intervention — it is not, and product law 7 forbids the app from talking
that way. And it is not a claim that these findings describe any particular user.
They describe *patterns the design must not break under*. If a pattern doesn't
apply to you, the app should still be fine; nothing here is diagnostic.

---

## 1 · Why "return" is the whole product

**Findings:**
- **Prospective memory** — remembering to do a thing at a future moment — is a
  distinct capacity from remembering the thing itself. **Time-based** prospective
  memory (do X at 3pm) is markedly less reliable than **event-based** (do X when
  you see Y), because time-based tasks have no external cue and depend on
  self-initiated checking. *(established)*
- **Barkley: temporal myopia.** The future is weakly represented; behaviour is
  governed by what is present. The **point of performance** — the place and
  moment where the behaviour must happen — is where support has to be, not
  earlier and not in the abstract. *(established)*
- **Gilbert: intention offloading.** People offload intentions to external stores
  and, having done so, *reduce internal rehearsal*. Offloading works — and it
  transfers the reliability burden entirely to the store. *(established)*
- **Masicampo & Baumeister.** An unfulfilled goal produces intrusive thoughts;
  **making a specific plan quiets them** even before any action is taken. The
  relief comes from the plan, not from the doing. *(established)*

**What follows.** The relief of capture is real and it arrives *immediately*.
That is the trap. Once the thought is written the intrusion quiets, internal
rehearsal stops, and the item's survival now depends entirely on the tool. If the
tool's resurfacing depends on the user's habit of reviewing, it has handed the
job back to the capacity that was failing.

**So: the return has to be structural.**

→ **Product law 1** (no silent nodes), enforced at the write boundary rather than
by a sweep ([ADR-0011](adr/0011-no-silent-nodes-gate.md)).
→ **Product law 2** (the coverage gauge) — the invariant is not just held, it is
*shown*, because a promise the user cannot verify is one they must take on faith,
and this audience has been let down by such promises before.
→ Cue conversion: wherever possible a time-based obligation becomes an
event-based one. This is the whole argument for **T1 `.ics` export** — the OS
calendar fires the cue whether or not the app is open
([ADR-0007](adr/0007-notification-tiers.md)).

---

## 2 · Why there is no "overdue"

**Findings:**
- **Sirois & Pychyl: procrastination is mood repair.** Delay is not a time-management
  failure; it is short-term regulation of negative affect around the task. **The
  aversive feeling causes the delay** — so anything that increases aversion
  increases delay. *(established)*
- **Deci & Ryan: the overjustification effect.** Extrinsic rewards and scores can
  *undermine* intrinsic motivation for a task the person already valued. *(established)*
- **Ego depletion — willpower as a depletable tank — failed to replicate** in
  large multi-lab efforts. *(negative finding)*
- **Working-memory training does not transfer** to untrained tasks or everyday
  function. *(negative finding)*

**What follows.** An "overdue" flag adds aversion to a task that is already
aversive, and it does so at the exact moment the person is deciding whether to
approach it. It is a machine for producing the behaviour it labels.

**Streaks are the same error with better marketing.** A streak converts something
you valued into a score, and its real design purpose is the moment it breaks. For
someone whose engagement is genuinely variable, that is a manufactured quitting moment.

The two negative findings are load-bearing **prohibitions**:

> **Nothing in Quietkeep may assume willpower is a tank** — no "you have used your
> focus for today", no depletion model, no discipline framing.
> **Nothing in Quietkeep may claim to train an underlying capacity.** It is a
> prosthesis, not an exercise regime. It does not make you better at remembering;
> it remembers.

→ **Product law 5**, one decay primitive, continuous pressure, "ready again"
([ADR-0010](adr/0010-decay-primitive.md)).
→ **Product law 3**, no past bucket — a passed date becomes a *decision*, not a
mark ([ADR-0012](adr/0012-no-past-bucket.md)).
→ **KC Davis: care tasks are morally neutral.** *(community-construct — a
practitioner framework, widely adopted, not an experimental result.)* Undone
laundry is not a moral failing. This sets the voice throughout: shame-free,
adult, never a rebuke.

---

## 3 · Interruption, focus, and getting back

**Findings:**
- **Altmann & Trafton: memory-for-goals.** A suspended goal decays with time and
  is recovered by **retrieval cues** associated with it at suspension. Recovery is
  cue-driven, not will-driven. *(established)*
- **Trafton et al.: resumption lag** is substantially reduced when a cue is
  encoded during the **interruption lag** — the brief window between knowing you
  will be interrupted and being interrupted. *(established)*
- **Mark: interruption costs.** Interrupted work is often completed in comparable
  time but at higher stress and effort; task-switching carries real overhead. *(established)*
- **Leroy: attention residue.** Attention persists on a prior task into the next,
  degrading it — worst when the prior task was left **unresolved**. *(established)*
- **Radvansky: event boundaries.** Crossing a boundary (a doorway, a context
  change) degrades access to what was active before it. *(established)*
- **Monotropism** (Murray, Lesser, Lawson): attention as a small number of deeply
  engaged interests; switching is **costly and involuntary to reverse**, and
  interruption is disproportionately expensive. *(emerging — an increasingly
  supported theoretical account, not a settled mechanism.)*
- **Hyperfocus** (Ashinoff & Abu-Akel): reviewed as a real but under-operationalised
  phenomenon; the literature does not yet agree on definition or measurement.
  *(emerging)*

**What follows.** The interruption is not preventable — walk-ins are the job. What
is designable is the **cue at suspension** and the **route back**.

→ **Focus anchor** — a manual one-tap "Focus" on any item, which models the state
explicitly rather than inferring it.
→ **Capture during focus auto-pairs a resume card**, with an optional five-word
*"I was about to…"* prompt. This is Trafton's interruption-lag cue, made cheap
enough to actually happen. **It is skippable, and skipping is unremarkable** —
a prompt that nags during an interruption is itself an interruption.
→ **Interrupt gesture (pin + capture) from anywhere, 2-second budget**
([ADR-0008](adr/0008-capture-endpoints.md)). Two seconds is not a performance
target picked for tidiness — it is roughly the width of the interruption lag.
→ **Resume cards rank above pressure in Next-up.** Leroy's residue says the
unresolved prior task is already consuming attention; finishing it is cheaper than
starting something else on top of it.
→ **Unspent resume cards convert to a day-end review question**, never to a
reproach.
→ *Because monotropism and hyperfocus are `emerging`*, nothing structural depends
on them. They inform ergonomics — the cost of a switch, the value of not
fragmenting a session — and if the accounts change, the design bends rather than breaks.

**Cirillo's interruption protocol** *(community-construct — a widely used
practitioner technique, not a validated finding)*: capture the interruption,
protect the current block, return. Quietkeep borrows the **shape** — capture
without leaving — and drops the timer, which is a demand.

---

## 4 · Clarify, breakdown, and the two-minute rule

**Findings:**
- **Choice overload.** More options can reduce satisfaction and the likelihood of
  choosing at all. The effect is context-dependent and its size has been
  contested — but the *direction* holds where options are similar and stakes are
  ambiguous, which is precisely an inbox. *(established, with contested magnitude
  — stated honestly rather than overclaimed.)*
- **D'Zurilla: problem-solving therapy.** Structured problem-solving — define,
  generate, decide, act — improves outcomes; the **structure** carries the benefit.
  *(established)*
- **Gollwitzer: implementation intentions.** "When situation X, I will do Y"
  substantially improves follow-through over goal intentions alone. The
  *specificity* is the mechanism. *(established)*
- **Brown: executive function clusters** — activation, focus, effort, emotion,
  memory, action — as a description of where difficulty sits. *(established as a
  clinical framework)*

**What follows.**

→ **Clarify shows one card at a time with forced-choice routing** (Do now · Next
action · Waiting For · Someday · Reference · Trash). One card removes the
comparison. Six fixed routes remove the open field. The routes are the
structure D'Zurilla's evidence points at.
→ **A "next action" must be specific enough to start**, which is the
implementation-intention finding applied. Vagueness is the actual blocker far more
often than difficulty.
→ **The two-minute timer on Do now** is a bounded commitment, not a rule about
what deserves doing. Its value is that "two minutes" is a *cheap* decision.
→ **The breakdown ladder generates all steps but reveals one**
([ADR-0015](adr/0015-ai-never-blocks.md)). Showing eight steps to someone stuck at
activation is choice overload at the worst moment. The granularity dial exists
because the right step size is personal and varies by day.
→ **Batch assist at the end of a Dump session** keeps capture and decision
separate. Deciding while dumping stops the dumping.

---

## 5 · Upkeep, habit, and honest timelines

**Findings:**
- **Lally et al.:** automaticity takes a **median ~66 days**, with a range from
  about 18 to well over 250. The popular "21 days" has no basis. *(established)*
- **Wood & Neal: context cues.** Habits are cued by stable context far more than
  by intention or motivation. *(established)*

**What follows.**

→ **Upkeep uses interval + comfort window, not a habit tracker.** No chains, no
"day 14 of 66". Given the range Lally found, a progress bar toward automaticity
would be fiction for most items and most people.
→ **"Ready again" language** frames Upkeep as availability rather than obligation.
→ Because context cues beat intention, Upkeep chips surface **in Work mode where
the person already is** — pushed to the point of performance rather than parked in
a section they must remember to visit ([ADR-0013](adr/0013-levels-push-down.md)).
→ The honest framing of Lally is itself a feature: an app that promises a habit in
three weeks is lying, and the user will find out.

---

## 6 · Rest, lapse, and re-entry

**Findings:**
- **Raymaker et al.: autistic burnout** — chronic exhaustion, skill loss, reduced
  tolerance to stimulus, following sustained accumulated load. Recovery requires
  **reduced demand**, not more strategy. *(established as a qualitative research
  finding; the construct is characterised, not yet clinically operationalised.)*
- **Spoon theory** (Christine Miserandino): finite daily capacity, spent by
  ordinary tasks, not restored by willpower. *(community-construct — an
  explanatory metaphor from the chronic-illness community. Widely understood,
  never validated as a mechanism, and *not* the same claim as ego depletion: it
  describes lived capacity variation, it does not posit a depleting reservoir.)*
- **Kahneman: peak-end rule.** Remembered experience is dominated by the peak and
  the ending, not the average or the duration. *(established)*

**What follows.**

→ **Product law 8: rest is legitimate, and re-entry is the primary designed
path** — not an error state. Most planners treat a two-week absence as a data
problem; for this audience it is the *expected* usage pattern.
→ **The greeting after a lapse is bounded by schema**: Next-up + at most three
triage items + the gauge + an amnesty offer. Never the backlog. The bound is in
the event shape, not in a UI decision that could regress
([`event-vocabulary.md`](event-vocabulary.md) §I).
→ **The amnesty offer** exists because the alternative — working through what
accumulated — is exactly the demand Raymaker's participants describe as
unaffordable during recovery.
→ **Rest mode**: pressure hidden, Menu forward, gauge quietly present, nothing red.
The gauge stays because it is the *reassurance* — nothing was lost while you were
away — and removing it would remove the reason rest is safe.
→ **Capacity is self-declared** (low / steady / sharp / unsure), never inferred.
"Unsure" is a first-class option because **alexithymia** (Bird & Cook) —
difficulty identifying one's own internal states, co-occurring at elevated rates
in autistic populations *(established)* — makes forced introspection a barrier.
An app that requires you to know how you feel excludes people who don't.
→ **Peak-end shapes the session close screen**: a win and a green gauge. The end
is disproportionately what gets remembered, and what gets remembered determines
whether the app is opened tomorrow.

---

## 7 · Load, capacity, and pebbles

**Findings:**
- **Personal Kanban (Benson & Barry): limit work in progress.** *(community-construct —
  a practitioner method with strong roots in manufacturing flow theory, not an
  experimental psychology result.)*
- **Goldratt: buffers.** In a chain of dependent events with variation, protection
  belongs in an explicit **buffer**, and buffer consumption is the signal to watch
  — not individual task lateness. *(established in operations research)*
- **Kahneman & Tversky: the planning fallacy.** Estimates are systematically
  optimistic, and — importantly — **experience does not fix it**. The
  outside view does. *(established)*

**What follows.**

→ **Pebbles are load, not work** ([ADR-0014](adr/0014-demand-free-types.md)). The
unresolved thing you are carrying has weight even when it is not a task, and a
system that only models tasks will consistently over-ask on the days you can
least afford it. An active pebble may **depress capacity/WIP** — which is the app
asking for less, automatically, without requiring you to explain yourself.
→ **Pebbles annotate the timeline so low-capacity stretches have a visible
reason.** Strictly co-occurrence: the app shows the pebble and the capacity in the
same period. **It never says one caused the other** (product law 7).
→ **Dependency dates use buffer language**: declare `feeds →` (project, suspense)
plus a lead estimate, compute latest-start, show **buffer burn**. Goldratt's
insight is that the burn rate is the signal — which is why a passed date raises a
replan card with days-left context rather than a late flag.
→ **The planning fallacy is why estimates are logged from v1** even though
learning from them is v2. The correction is empirical — your own history — and it
cannot be backfilled. It is also why estimates are never used to *judge*: the
fallacy is universal, not a personal failing.

---

## 8 · Bother, worry, and things that are not tasks

**Findings:**
- **Borkovec: stimulus control for worry.** Postponing worry to a designated time
  and place reduces overall worry — the *scheduling* does the work, not suppression.
  *(established)*
- **Masicampo & Baumeister**, again: the plan quiets the intrusion. *(established)*

**What follows.**

→ **The bother flow** takes free text and asks the one question that matters:
*whose is it* — mine to solve · mine to track · **not mine to carry**.
→ **It must terminate in a route or a Park-with-return-clock.** No exit that
leaves the bother where it was. This is Borkovec applied literally: the return
clock is the designated later time, and it is a *guarantee*, which is what makes
letting go possible now.
→ **"Not mine to carry" still produces a record** — the **Not Now ledger**.
Declining is a decision worth keeping, not a deletion. It is also the thing to
point at when the same request comes back.
→ **Request slots** are stimulus control for incoming demand: a scheduled place
for requests to land, so they are not evaluated at arrival.
→ The **comms-sweep chip** is the same idea for messages. **The app owns the
schedule of looking and never the messages themselves** — there is no integration
and no event that could carry message content
([`event-vocabulary.md`](event-vocabulary.md) §E). Sweeps ride focus-exit ramps,
because the cost of checking is the switch, and a switch already happening is free.

---

## 9 · Where the interest actually comes from

**Findings:**
- **Dodson: the interest-based nervous system.** A clinical account that engagement
  is driven by interest, novelty, challenge, and urgency rather than by importance
  and reward. *(community-construct — widely circulated and clinically originated,
  but not an experimentally validated model. Treated as description, never mechanism.)*
- **Rejection-sensitive dysphoria (RSD).** *(community-construct — named
  clinically, widely recognised as experience, **not** a validated diagnostic
  construct with an established evidence base. Tagged explicitly because it is
  frequently presented as settled science and is not.)*

**What follows.** Both are tagged `community-construct` and **nothing structural
rests on either**. Their influence is confined to things that are true regardless
of whether the model is:

→ **"Not this" cycles freely on the Next-up card, with no penalty and no record
of refusal.** Whatever the underlying account, a planner that makes declining
today's suggestion feel like a failure will be abandoned. Nothing is logged as a
rejection, because a rejection log would eventually be shown to someone.
→ **The Menu exists** so that interest has a legitimate home that owes nothing
(law 6).
→ **The RSD tag drives the voice more than any feature**: no rebukes, no
disappointed copy, no red walls, no implied judgement in an empty state. This
costs nothing if the construct is wrong, and matters a great deal if it is right —
which is the correct way to design under this much uncertainty.

---

## 10 · The negative findings, stated as prohibitions

These earn their own section because they are the easiest to violate by accident —
each corresponds to a feature that would look perfectly reasonable in a spec.

- ****Ego depletion** — willpower as a depletable resource — failed large-scale replication**
  - Status: **negative finding**
  - What it forbids here: No depletion model. No "you have used your focus today". No discipline or willpower framing anywhere in copy or ranking. Capacity is **self-declared**, never computed from what you have spent.
- ****Working-memory training does not transfer** to untrained tasks or daily function**
  - Status: **negative finding**
  - What it forbids here: Quietkeep never claims to improve an underlying capacity. No exercises, no scores, no "getting better". It is a prosthesis. Saying otherwise would be selling something that does not work — Doctrine §5.
- ****"21 days to a habit"** — no evidential basis; Lally's median is ~66 days with an enormous range**
  - Status: **negative finding**
  - What it forbids here: No habit-formation countdown, no automaticity progress bar, no promise of a timeline the data cannot support.

**Why they are here rather than quietly obeyed:** each of these is a feature
somebody will eventually propose in good faith, because they all appear in
successful competing products. This table is the answer, with the reason attached.

---

## 11 · The five things Quietkeep claims are different

Stated as **claims, not conclusions**. The competitive pass that would test them
is **V-08 in [`verifications.md`](verifications.md), and it has not been run** —
it is owed before any public release copy is written. Publishing these as
established differentiators before that check would be exactly the false-confidence
failure Doctrine §5 names.

1. **A decay-based Upkeep lane** — recurring things modelled by comfort window and
   rising pressure rather than by due dates or streaks.
2. **Unified suspend–capture–resume bound to a modelled focus state** — the focus
   anchor, the paired resume card, and the interrupt gesture as one mechanism
   rather than three features.
3. **Bother triage that terminates in clock-guaranteed routes** — worry handling
   with no exit that leaves the worry unheld.
4. **A horizon-integrity engine** — the no-silent-nodes invariant enforced at the
   write boundary and *proved* by a visible gauge.
5. **A pebble load ledger** — non-task load modelled explicitly and allowed to
   reduce what the app asks of you.

---

## Canon index

Everything cited above, with its tag.

**Established**
Barkley (temporal myopia; point of performance) · Brown (executive function
clusters) · prospective memory, incl. time-based vs event-based and cue
conversion · Altmann & Trafton (memory-for-goals) · Trafton et al. (resumption
cues, interruption lag) · Mark (interruption costs) · Leroy (attention residue) ·
Radvansky (event boundaries) · Masicampo & Baumeister (plans quiet intrusive
thoughts) · Gilbert (intention offloading) · Sirois & Pychyl (procrastination as
mood repair) · Gollwitzer (implementation intentions) · D'Zurilla (problem-solving
structure) · Borkovec (worry postponement / stimulus control) · Lally (habit
timelines) · Wood & Neal (context cues) · Kahneman (planning fallacy; peak-end
rule) · Goldratt (buffers, in operations research) · Bird & Cook (alexithymia) ·
Raymaker (autistic burnout — qualitative) · choice overload *(direction
established, magnitude contested)*

**Emerging**
Monotropism (Murray, Lesser, Lawson) · hyperfocus (Ashinoff & Abu-Akel)

**Community-construct**
Dodson (interest-based nervous system) · RSD · spoon theory (Miserandino) ·
KC Davis (moral neutrality of care tasks) · Personal Kanban WIP limits (Benson &
Barry) · Cirillo (interruption protocol)

**Negative findings — prohibitions**
Ego depletion (failed replication) · working-memory training transfer (does not
transfer) · "21 days to a habit" (no basis)

---

> **A note on citation.** This document names findings and the people associated
> with them; it does not reproduce their text, and it is not a literature review.
> Where a construct is contested it is tagged as contested. Where the app borrows
> a *shape* from a practitioner method rather than a research result, it says so.
> Prior art in personal productivity methodology is acknowledged as prior art —
> Quietkeep claims no affiliation with, endorsement by, or compatibility with any
> methodology or its trademark holders ([ADR-0016](adr/0016-gtd-marks-and-original-content.md)).
