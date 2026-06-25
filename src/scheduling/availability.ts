import { startOfDay } from "date-fns";
import { utc } from "@date-fns/utc";
import { AvailableAppointmentSlot } from "../starter-code/appointment";
import { Clinician } from "../starter-code/clinician";
import { Patient } from "../starter-code/patient";
import { ClinicianRepository } from "../data/clinician-repository";
import { AssessmentPair, getAssessmentPairs } from "./assessment";
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

/**
 * Reduces a clinician's candidate slots to every one that's part of some
 * maximum-cardinality non-overlapping selection (see overlap.ts), then maps
 * the surviving timestamps back to their full slot objects.
 */
function maximizeSlots(
  slots: AvailableAppointmentSlot[],
  durationMins: number,
): AvailableAppointmentSlot[] {
  if (slots.length === 0) return [];
  const byTimestamp = new Map(slots.map((slot) => [slot.date.getTime(), slot]));
  return filterToMaxAppointments(slots.map((slot) => slot.date), durationMins).map(
    (date) => byTimestamp.get(date.getTime())!,
  );
}

/**
 * Same as `maximizeSlots`, but computed independently per calendar day (UTC).
 * Used for assessment pairing, where sessions are required to be on different
 * days — each day's own local max is all that matters for that day's
 * contribution to the cross-day pairing pool.
 */
function maximizeSlotsPerDay(
  slots: AvailableAppointmentSlot[],
  durationMins: number,
): AvailableAppointmentSlot[] {
  const byDay = new Map<number, AvailableAppointmentSlot[]>();
  for (const slot of slots) {
    const dayKey = startOfDay(slot.date, { in: utc }).getTime();
    const group = byDay.get(dayKey);
    if (group) {
      group.push(slot);
    } else {
      byDay.set(dayKey, [slot]);
    }
  }
  return [...byDay.values()].flatMap((daySlots) => maximizeSlots(daySlots, durationMins));
}

/**
 * Available assessment slots for a patient, grouped by psychologist. Each pair
 * is two 90-min sessions on different days, ≤7 days apart, with existing
 * appointments already filtered out. Psychologists with no valid pair are
 * omitted, so callers only see clinicians the patient can actually book with.
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
      const unoccupied = filterUnoccupied(clinician.availableSlots, clinician);
      const maximized = maximizeSlotsPerDay(unoccupied, durationMins);
      return { clinician, pairs: getAssessmentPairs(maximized) };
    })
    .filter((availability) => availability.pairs.length > 0);
}

/**
 * Available single-session therapy slots for a patient, grouped by therapist.
 * Handles both THERAPY_INTAKE (new patient) and THERAPY_SIXTY_MINS (existing
 * patient) — the eligibility rule for which therapists qualify is what differs.
 * Existing appointments are filtered out; therapists with no open slot are
 * omitted.
 */
export async function getTherapyAvailability(
  patient: Patient,
  repo: ClinicianRepository,
  service: Extract<ServiceType, "THERAPY_INTAKE" | "THERAPY_SIXTY_MINS">,
): Promise<ClinicianTherapyAvailability[]> {
  const clinicians = await repo.findEligibleClinicians(patient, service);
  const durationMins = SERVICE_RULES[service].slotLengthMins;

  return clinicians
    .map((clinician) => {
      const unoccupied = filterUnoccupied(clinician.availableSlots, clinician);
      return { clinician, slots: maximizeSlots(unoccupied, durationMins) };
    })
    .filter((availability) => availability.slots.length > 0);
}
