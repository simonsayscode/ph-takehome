import { startOfDay } from "date-fns";
import { utc } from "@date-fns/utc";
import { AvailableAppointmentSlot } from "../starter-code/appointment";
import { Clinician } from "../starter-code/clinician";
import { Patient } from "../starter-code/patient";
import { ClinicianRepository } from "../data/clinician-repository";
import { AssessmentPair, getAssessmentPairs } from "./assessment";
import { CapacityCalendar } from "./capacity";
import { SERVICE_RULES, ServiceType } from "./eligibility";
import { filterUnoccupied } from "./occupancy";
import { filterToMaxAppointments } from "./overlap";

/** Assessment options for a single psychologist. */
export interface ClinicianAssessmentAvailability {
  clinician: Clinician;
  pairs: AssessmentPair[];
}

/** Single-session therapy options for a single therapist. */
export interface ClinicianTherapyAvailability {
  clinician: Clinician;
  slots: AvailableAppointmentSlot[];
}

const dayKey = (date: Date): number => startOfDay(date, { in: utc }).getTime();

/**
 * Turns a clinician's raw `availableSlots` into the set of bookable slots for a
 * service: drop slots overlapping existing appointments, dedupe by start time
 * (a clinician can't hold two appointments at the same instant), then — per
 * calendar day — drop days already at capacity and keep only the
 * overlap-maximizing subset, where the maximizer's target is the day's
 * remaining capacity (`effectiveRemainingOnDay`). A day with room for only 1
 * more appointment keeps all its slots (any time is fine); a day with more room
 * prunes overlap "traps" exactly as in Task 2.
 *
 * Grouping per day (vs. one global pass) is what lets each day use its own
 * capacity target; it's correct under the documented no-slot-crosses-midnight
 * assumption, which means different days never overlap. We trust the README
 * invariant that a clinician's slot length matches their type, so we don't
 * re-filter by length.
 */
function bookableSlots(
  clinician: Clinician,
  durationMins: number,
  capacity: CapacityCalendar,
): AvailableAppointmentSlot[] {
  const unoccupied = filterUnoccupied(clinician.availableSlots, clinician);

  const byTimestamp = new Map<number, AvailableAppointmentSlot>();
  for (const slot of unoccupied) {
    if (!byTimestamp.has(slot.date.getTime())) byTimestamp.set(slot.date.getTime(), slot);
  }

  const byDay = new Map<number, AvailableAppointmentSlot[]>();
  for (const slot of byTimestamp.values()) {
    const key = dayKey(slot.date);
    const group = byDay.get(key);
    if (group) group.push(slot);
    else byDay.set(key, [slot]);
  }

  const bookable: AvailableAppointmentSlot[] = [];
  for (const daySlots of byDay.values()) {
    const remaining = capacity.effectiveRemainingOnDay(daySlots[0].date);
    if (remaining <= 0) continue; // day (or its week) already at capacity
    const kept = filterToMaxAppointments(
      daySlots.map((slot) => slot.date),
      durationMins,
      remaining,
    );
    for (const date of kept) bookable.push(byTimestamp.get(date.getTime())!);
  }
  return bookable;
}

/**
 * An assessment books two sessions, so it must fit the weekly cap as a unit.
 * Sessions are always on different days (different daily buckets), so the only
 * extra check beyond the per-day gate is: when both land in the same ISO week,
 * that week needs room for both (≥2). Cross-week pairs charge 1 to each week,
 * which the per-day gate already guaranteed is available.
 */
function pairFitsWeeklyCapacity(
  pair: AssessmentPair,
  capacity: CapacityCalendar,
): boolean {
  if (!capacity.sameWeek(pair.session1.date, pair.session2.date)) return true;
  return capacity.remainingInWeek(pair.session1.date) >= 2;
}

/**
 * Available assessment slots for a patient, grouped by psychologist. Each pair
 * is two 90-min sessions on different days, ≤7 days apart, with existing
 * appointments, overlap traps, and capacity caps all accounted for.
 * Psychologists with no valid pair are omitted.
 */
export async function getAssessmentAvailability(
  patient: Patient,
  repo: ClinicianRepository,
): Promise<ClinicianAssessmentAvailability[]> {
  const clinicians = await repo.findEligibleClinicians(
    patient,
    "PSYCHOLOGIST_ASSESSMENT",
  );

  const durationMins = SERVICE_RULES.PSYCHOLOGIST_ASSESSMENT.slotLengthMins;

  return clinicians
    .map((clinician) => {
      const capacity = new CapacityCalendar(clinician);
      const slots = bookableSlots(clinician, durationMins, capacity);
      const pairs = getAssessmentPairs(slots).filter((pair) =>
        pairFitsWeeklyCapacity(pair, capacity),
      );
      return { clinician, pairs };
    })
    .filter((availability) => availability.pairs.length > 0);
}

/**
 * Available single-session therapy slots for a patient, grouped by therapist.
 * Handles both THERAPY_INTAKE (new patient) and THERAPY_SIXTY_MINS (existing
 * patient) — the eligibility rule for which therapists qualify is what differs.
 * Existing appointments and capacity caps are accounted for; therapists with no
 * open slot are omitted. A single session is fully covered by the per-day gate
 * (weekly capacity is folded into `effectiveRemainingOnDay`).
 */
export async function getTherapyAvailability(
  patient: Patient,
  repo: ClinicianRepository,
  service: Extract<ServiceType, "THERAPY_INTAKE" | "THERAPY_SIXTY_MINS">,
): Promise<ClinicianTherapyAvailability[]> {
  const clinicians = await repo.findEligibleClinicians(patient, service);
  const durationMins = SERVICE_RULES[service].slotLengthMins;

  return clinicians
    .map((clinician) => ({
      clinician,
      slots: bookableSlots(clinician, durationMins, new CapacityCalendar(clinician)),
    }))
    .filter((availability) => availability.slots.length > 0);
}
