# Solution Walkthrough

## Layout

```
src/
  starter-code/   # provided scaffolding (domain types, enums, mock data) — untouched
  data/           # the database seam
  scheduling/     # the business logic (pure functions, colocated *.test.ts)
```

- **`data/`** — `ClinicianRepository` is the interface standing in for the EHR/DB.
  `InMemoryClinicianRepository` implements it over a fixed list, and
  `mock-clinicians.ts` is that list. A real Prisma implementation would push the
  same filters into a SQL `WHERE` / `NOT EXISTS` clause — which is how this
  scales to hundreds of clinicians without loading them all into memory.
- **`scheduling/`** — small, pure, individually testable functions. Each file
  does one thing; `availability.ts` composes them into the public entry points.

## The pipeline

Two public entry points in [`availability.ts`](src/scheduling/availability.ts):

```
getAssessmentAvailability(patient, repo)            -> [{ clinician, pairs }]
getTherapyAvailability(patient, repo, service)      -> [{ clinician, slots }]
```

Both run the same core pipeline per clinician, then diverge at the end:

```
repo.findEligibleClinicians          eligibility.ts   who can the patient book with?
        │
        ▼  (per clinician)
filterUnoccupied                     occupancy.ts     drop slots overlapping real bookings
        │
        ▼
dedupe + group by UTC day            availability.ts
        │
        ▼  (per day)
capacity gate + maximize             capacity.ts      drop full days; prune overlap "traps"
        │                            overlap.ts        toward the day's remaining capacity
        ▼
   ┌────┴─────────────────────────┐
   ▼ assessment                    ▼ therapy
getAssessmentPairs +              return slots
weekly-capacity pair filter        (single session)
   assessment.ts
```

Clinicians with nothing offerable are omitted, so a caller only ever sees
clinicians the patient can actually book with.

## What each task added

### Task 1 — eligibility, occupancy, assessment pairing

- **[`eligibility.ts`](src/scheduling/eligibility.ts)** — a patient is matched to
  a clinician by **state + insurance + clinician type**, plus a
  **prior-relationship** rule that flips by service (a small `SERVICE_RULES`
  table): assessment and therapy *intake* require **no** prior appointment with
  that clinician; recurring *sixty-min* therapy requires an **existing** one.
- **[`occupancy.ts`](src/scheduling/occupancy.ts)** — `filterUnoccupied` removes
  candidate slots that overlap a clinician's already-booked appointments.
  Back-to-back is fine (a slot starting exactly when a booking ends is kept).
- **[`assessment.ts`](src/scheduling/assessment.ts)** — `getAssessmentPairs`
  emits the two-session pairs an assessment needs: different calendar days, ≤7
  days apart (inclusive), ordered `session1 < session2`. A slot with no valid
  partner never surfaces — we never offer a first session with no possible
  follow-up.

### Task 2 — overlap maximization

[`overlap.ts`](src/scheduling/overlap.ts) — `filterToMaxAppointments(dates,
duration)` removes slots whose booking would needlessly shrink a clinician's day.
If 12:00–13:30 is offered at 15-min cadence, booking 12:15 blocks every other
slot, whereas 12:00 + 13:30 fits two appointments — so we only show the slots
that preserve the maximum.

Rather than the textbook greedy (which returns *one* optimal chain), it uses a
**forward/backward DP** to return *every slot that's part of some
maximum-cardinality schedule* — same `O(n log n)` cost, but it surfaces
equally-good options the greedy would arbitrarily discard. On the README's own
example the two agree exactly (`[12:00, 13:30]`); the DP only differs when a real
tie exists.

### Task 3 — clinician capacity

[`capacity.ts`](src/scheduling/capacity.ts) — `CapacityCalendar` enforces
`maxDailyAppointments` / `maxWeeklyAppointments` (ISO week, Mon–Sun, UTC):

- **Hard gates** — a day or week already at its cap offers nothing.
- **Capacity-aware maximization** — the maximizer's target becomes
  `min(K, remaining)`. The insight: pruning overlap traps only matters up to how
  many appointments the clinician can still take. With room for just 1 more,
  *every* slot is fine, so none are pruned; with more room, pruning kicks back in.
  This shows strictly more options than always optimizing toward the theoretical
  max, with no capacity waste.
- **Assessments cost two appointments** — a pair is offered only if both sessions
  fit: a same-week pair needs the week to have ≥2 remaining; a cross-week pair
  needs ≥1 in each (already guaranteed). So a week with one slot left offers no
  same-week assessment but can still anchor a cross-week one.

## Testing

`*.test.ts` files sit next to the code they cover. Highlights:

- `assessment.test.ts` — the README's exact 11-pair output, plus the 7-day
  boundary (inclusive) and same-day / orphan edge cases.
- `overlap.test.ts` — the README's `[12:00, 13:30]` result, tie handling, and the
  capacity-target behavior.
- `eligibility.test.ts` — state/insurance/type filtering and the
  prior-relationship rule across all appointment statuses.
- `occupancy.test.ts` — overlap removal, back-to-back retention.
- `capacity.test.ts` — per-day/week counting and the counting-status set.
- `availability.test.ts` — end-to-end for the README patient, plus capacity
  integration (day/week at cap, the `remaining = 1` no-op, and the same-week vs
  cross-week assessment boundary).

## File map

| File | Responsibility |
|---|---|
| [`eligibility.ts`](src/scheduling/eligibility.ts) | Service rules; who can book what with whom |
| [`occupancy.ts`](src/scheduling/occupancy.ts) | Remove slots overlapping existing appointments |
| [`overlap.ts`](src/scheduling/overlap.ts) | Maximize bookable appointments (Task 2) |
| [`capacity.ts`](src/scheduling/capacity.ts) | Daily/weekly caps (Task 3) |
| [`assessment.ts`](src/scheduling/assessment.ts) | Pair two assessment sessions |
| [`availability.ts`](src/scheduling/availability.ts) | Public entry points; composes the pipeline |
| [`data/clinician-repository.ts`](src/data/clinician-repository.ts) | The DB seam (interface) |
| [`data/in-memory-clinician-repository.ts`](src/data/in-memory-clinician-repository.ts) | Test/demo implementation |
| [`data/mock-clinicians.ts`](src/data/mock-clinicians.ts) | Deterministic mock fixtures |
