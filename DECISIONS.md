# Decisions & Assumptions

## Prior-relationship rule (assumption beyond the prompt)

- The prompt is centered on new patients scheduling online. I interpreted the
  "first therapy session" as a per-clinician new-patient intake, and modeled
  recurring therapy separately even though it is not patient-facing online.
- Under that assumption, booking is **per-clinician and one-time** for
  new-patient services. The prior-appointment requirement **flips by service**:
  - `PSYCHOLOGIST_ASSESSMENT` & `THERAPY_INTAKE` require **no prior appointment**
    with that clinician — you can't book a first intake/assessment with someone
    you've already seen.
  - `THERAPY_SIXTY_MINS` requires an **existing relationship** (a prior
    appointment) — it's ongoing therapy.
- "Has the patient seen this clinician?" counts any appointment with statuses
  `UPCOMING` or `OCCURRED`. `CANCELLED`, `NO_SHOW`, `LATE_CANCELLATION` and
  `RE_SCHEDULED` do **not** establish a relationship.
- **Why `THERAPY_SIXTY_MINS` at all?** The README says recurring therapy is
  booked offline (in-session/by chat), not via patient self-scheduling. I still
  included it to keep the domain model complete and to show how the same
  eligibility/capacity logic would apply if internal scheduling reused this
  module.

## Existing appointments / occupancy

- An appointment occupies time only when its status is `UPCOMING`, `OCCURRED`,
  or `NO_SHOW`. `CANCELLED`, `RE_SCHEDULED`, and `LATE_CANCELLATION` free the slot.

## Dates & the 7-day rule

- All day/week math is done in **UTC** (slot `date`s are UTC). For ease of demo
  we do **not** localize to the clinician's or patient's timezone (since those aren't
  part of the schema). Implemented with `date-fns` + `@date-fns/utc` (`{ in: utc }`).
- An assessment's two sessions must be on **different calendar days**, **no more
  than 7 days apart**. "7 days" is **calendar days** (not 7×24 hours) and the
  bound is **inclusive**: booking on a Wednesday surfaces options up to and
  including the following Wednesday. Verified against the README, whose expected
  output includes the `2024-08-21 ↔ 2024-08-28` pair (exactly 7 days).
- A week is an **ISO week, Mon–Sun**.

## Overlap maximization (Task 2)

- **Single-chain greedy vs. forward/backward DP — DP adopted.** The textbook
  greedy (sort ascending, sweep with a cursor, keep if `start >= cursor`)
  returns *one* canonical maximum-count chain. We instead return **every slot
  that belongs to *some* maximum-cardinality solution**, via forward/backward
  DP (the standard "is this element part of some optimal solution" technique).
  Both approaches are `O(n log n)` (dominated by the initial sort) — this is a
  **behavior choice, not a performance tradeoff**. The DP version surfaces
  ties the simple greedy would arbitrarily discard (e.g. two widely-separated
  clusters, where which member of each is kept doesn't change the achievable
  total — the greedy silently keeps only the earliest of each, the DP version
  keeps all of them) at no extra asymptotic cost, and is confirmed identical to
  the greedy's result on the README's own example (no real tie exists there).
  We never enumerate *combinations* of slots (which would be combinatorial) —
  only test each slot's membership in some optimal solution independently.
- **Assumption: no slot crosses midnight** (a slot's `date + length` never
  spills into the next calendar day) — true for `MOCK_SLOT_DATA` (latest start
  22:30 UTC, ending exactly at 00:00), but not a derived fact. We explored what
  a midnight-crossing slot would break (`getAssessmentPairs`' calendar-day-only
  check letting through a pair that physically overlaps) and added a
  same-physical-time overlap guard to `getAssessmentPairs` regardless. We
  didn't generalize further — if midnight-crossing slots become real, that
  needs product input on intended behavior, not just an engineering fix.

## Capacity caps (Task 3)

`src/scheduling/capacity.ts` (`CapacityCalendar`) enforces each clinician's
`maxDailyAppointments` / `maxWeeklyAppointments`.

- **Statuses that count toward a cap** = `UPCOMING`, `OCCURRED`, `NO_SHOW` —
  the same set occupancy uses (a no-show still consumed a booked slot).
  `CANCELLED`, `RE_SCHEDULED`, and `LATE_CANCELLATION` don't count.
- **The maximizer is capacity-aware.** Its target is `min(K, effectiveRemaining)`
  rather than the full daily max `K`. The maximizer protects *throughput* (don't
  let a booking needlessly block other appointments) — but that only matters up
  to how many the clinician can still take. So when a day has room for only 1
  more, *every* slot is offered (no pruning); with `≥ K` room it's the full Task
  2 maximize; in between it keeps every slot usable in some `remaining`-sized
  booking. This shows strictly more options than always pruning toward `K`, with
  no capacity waste — chosen over a binary "skip maximize when remaining == 1."
  Because the keep-test is **monotonic in the target** (smaller target ⇒
  superset of slots), capacity *never hides* a slot via the maximizer; it only
  relaxes pruning.
- **An assessment counts as two appointments, not one booking.** Assumption: the
  caps count individual *sessions*, so one assessment consumes 2 toward the caps
  (1 per session-day; 2 in a shared week) — not 1 "assessment booking." A pair is
  offered only if both sessions fit: each day needs ≥1 (guaranteed by the per-day
  gate) and a **same-ISO-week** pair needs the week to have **≥2** remaining.
  **Cross-week** pairs charge 1 to each of two weeks, which the per-day gate
  already guaranteed — so the pair filter checks *only* the same-week case.
  Applying `≥2` across weeks would be a bug (it would wrongly drop a valid
  `1 + 1` cross-week pair). Net effect: a week with only 1 slot left offers no
  same-week assessment but can still anchor a cross-week one.

## Robustness / hardening

- **Established-patient statuses** (see "Prior-relationship rule" above): only
  `UPCOMING` (committed intent) and `OCCURRED` (attended) make someone an
  established patient. A `NO_SHOW`, `LATE_CANCELLATION`, `CANCELLED`, or
  `RE_SCHEDULED` means no care relationship actually formed — they never
  onboarded — so they remain a new-patient (intake/assessment) candidate and
  cannot book ongoing (`THERAPY_SIXTY_MINS`) sessions.
- **Past slots are not filtered.** A production system would pass the current
  time (a `now`) into the availability entry points and exclude slots starting
  at or before it (a slot already underway can't be booked). We deliberately
  omit this for the take-home: the demo data is historical (2024), so a real
  `now` would filter everything out, and threading it through adds parameters
  without exercising any new business logic. Flagged here as a known,
  intentional simplification.

## Data layer

- Scheduling logic depends on a `ClinicianRepository` interface (the DB seam),
  not a concrete database. Tests inject an `InMemoryClinicianRepository` seeded
  with mock clinicians. A production (e.g. Prisma) implementation would push the
  same filters into a SQL `WHERE` / `NOT EXISTS` clause — which is how this
  scales to hundreds of clinicians.
- Mock clinicians use hardcoded uuidv4 ids for deterministic tests. The starter
  `MOCK_SLOT_DATA` (which isn't tied to a clinician) is attached to Jane Doe to
  reproduce the README example.
