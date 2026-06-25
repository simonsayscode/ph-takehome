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
 * Turns a clinician's raw `availableSlots` into the set of bookable slots for a
 * service: remove slots overlapping existing appointments, then keep only the
 * overlap-maximizing subset (see overlap.ts), mapping the surviving timestamps
 * back to their full slot objects. Slots are deduped by start time — a
 * clinician can't hold two appointments at the same instant, so identical
 * timestamps collapse to a single offerable slot.
 *
 * We trust the README invariant that a clinician's slot length matches their
 * type (90 = psychologist, 60 = therapist), so we don't re-filter by length.
 */
function bookableSlots(
  clinician: Clinician,
  durationMins: number,
): AvailableAppointmentSlot[] {
  const unoccupied = filterUnoccupied(clinician.availableSlots, clinician);

  const byTimestamp = new Map<number, AvailableAppointmentSlot>();
  for (const slot of unoccupied) {
    if (!byTimestamp.has(slot.date.getTime())) byTimestamp.set(slot.date.getTime(), slot);
  }
  const unique = [...byTimestamp.values()];

  return filterToMaxAppointments(unique.map((slot) => slot.date), durationMins).map(
    (date) => byTimestamp.get(date.getTime())!,
  );
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
    .map((clinician) => ({
      clinician,
      pairs: getAssessmentPairs(bookableSlots(clinician, durationMins)),
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
): Promise<ClinicianTherapyAvailability[]> {
  const clinicians = await repo.findEligibleClinicians(patient, service);
  const durationMins = SERVICE_RULES[service].slotLengthMins;

  return clinicians
    .map((clinician) => ({
      clinician,
      slots: bookableSlots(clinician, durationMins),
    }))
    .filter((availability) => availability.slots.length > 0);
}
