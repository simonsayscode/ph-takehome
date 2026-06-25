import { AvailableAppointmentSlot } from "../starter-code/appointment";
import { Clinician } from "../starter-code/clinician";
import { Patient } from "../starter-code/patient";
import { ClinicianRepository } from "../data/clinician-repository";
import { AssessmentPair, getAssessmentPairs } from "./assessment";
import { ServiceType } from "./eligibility";
import { filterUnoccupied } from "./occupancy";

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

  return clinicians
    .map((clinician) => ({
      clinician,
      pairs: getAssessmentPairs(filterUnoccupied(clinician.availableSlots, clinician)),
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

  return clinicians
    .map((clinician) => ({
      clinician,
      slots: filterUnoccupied(clinician.availableSlots, clinician),
    }))
    .filter((availability) => availability.slots.length > 0);
}
