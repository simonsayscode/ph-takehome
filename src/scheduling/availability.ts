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

/** Options shared by the availability entry points. */
export interface AvailabilityOptions {
  /**
   * If provided, slots starting at or before this instant are excluded (a slot
   * already underway can't be booked). Off by default so historical demo data
   * (e.g. the README's 2024 slots) is still returned.
   */
  now?: Date;
}

/**
 * Reduces a clinician's candidate slots to every one that's part of some
 * maximum-cardinality non-overlapping selection (see overlap.ts), then maps
 * the surviving timestamps back to their full slot objects. Slots are deduped
 * by start time first — a clinician can't hold two appointments at the same
 * instant, so identical timestamps collapse to a single offerable slot.
 */
function maximizeSlots(
  slots: AvailableAppointmentSlot[],
  durationMins: number,
): AvailableAppointmentSlot[] {
  if (slots.length === 0) return [];

  const byTimestamp = new Map<number, AvailableAppointmentSlot>();
  for (const slot of slots) {
    if (!byTimestamp.has(slot.date.getTime())) byTimestamp.set(slot.date.getTime(), slot);
  }
  const unique = [...byTimestamp.values()];

  return filterToMaxAppointments(unique.map((slot) => slot.date), durationMins).map(
    (date) => byTimestamp.get(date.getTime())!,
  );
}

/**
 * Turns a clinician's raw `availableSlots` into the set of bookable slots for a
 * service: keep only slots of the service's length (a clinician's slot length
 * encodes their type — a mismatched length is bad data we drop), optionally
 * drop slots in the past, remove slots overlapping existing appointments, then
 * keep only the overlap-maximizing subset.
 */
function prepareSlots(
  clinician: Clinician,
  durationMins: number,
  options: AvailabilityOptions,
): AvailableAppointmentSlot[] {
  let slots = clinician.availableSlots.filter((slot) => slot.length === durationMins);
  if (options.now) {
    const cutoff = options.now.getTime();
    slots = slots.filter((slot) => slot.date.getTime() > cutoff);
  }
  return maximizeSlots(filterUnoccupied(slots, clinician), durationMins);
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
  options: AvailabilityOptions = {},
): Promise<ClinicianAssessmentAvailability[]> {
  const clinicians = await repo.findEligibleClinicians(
    patient,
    "PSYCHOLOGIST_ASSESSMENT",
  );

  const durationMins = SERVICE_RULES.PSYCHOLOGIST_ASSESSMENT.slotLengthMins;

  return clinicians
    .map((clinician) => ({
      clinician,
      pairs: getAssessmentPairs(prepareSlots(clinician, durationMins, options)),
    }))
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
  options: AvailabilityOptions = {},
): Promise<ClinicianTherapyAvailability[]> {
  const clinicians = await repo.findEligibleClinicians(patient, service);
  const durationMins = SERVICE_RULES[service].slotLengthMins;

  return clinicians
    .map((clinician) => ({
      clinician,
      slots: prepareSlots(clinician, durationMins, options),
    }))
    .filter((availability) => availability.slots.length > 0);
}
