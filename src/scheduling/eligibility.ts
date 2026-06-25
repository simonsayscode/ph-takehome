import { Clinician, ClinicianType } from "../starter-code/clinician";
import { Patient } from "../starter-code/patient";

/**
 * The services a patient (or a therapist booking on their behalf) can schedule
 * online. Each maps to one or more concrete `AppointmentType`s:
 *
 * - PSYCHOLOGIST_ASSESSMENT -> two 90-min sessions (ASSESSMENT_SESSION_1 & _2)
 * - THERAPY_INTAKE          -> one 60-min session (THERAPY_INTAKE)
 * - THERAPY_SIXTY_MINS      -> one 60-min session (THERAPY_SIXTY_MINS)
 *
 * NOTE: THERAPY_SIXTY_MINS is not patient-facing online (recurring sessions are
 * booked in-session/by chat), but we model it so a therapist booking their own
 * recurring session reuses this logic and can't book the wrong-coded type.
 * See DECISIONS.md.
 */
export const ServiceTypes = [
  "PSYCHOLOGIST_ASSESSMENT",
  "THERAPY_INTAKE",
  "THERAPY_SIXTY_MINS",
] as const;
export type ServiceType = (typeof ServiceTypes)[number];

interface ServiceRule {
  clinicianType: ClinicianType;
  slotLengthMins: number;
  /**
   * Whether the patient must already have a relationship (a prior appointment)
   * with the clinician for this service:
   * - assessment & intake require NO prior appointment (new to that clinician)
   * - sixty-mins requires an EXISTING relationship (ongoing therapy)
   */
  requiresExistingRelationship: boolean;
}

export const SERVICE_RULES: Record<ServiceType, ServiceRule> = {
  PSYCHOLOGIST_ASSESSMENT: {
    clinicianType: "PSYCHOLOGIST",
    slotLengthMins: 90,
    requiresExistingRelationship: false,
  },
  THERAPY_INTAKE: {
    clinicianType: "THERAPIST",
    slotLengthMins: 60,
    requiresExistingRelationship: false,
  },
  THERAPY_SIXTY_MINS: {
    clinicianType: "THERAPIST",
    slotLengthMins: 60,
    requiresExistingRelationship: true,
  },
};

/**
 * A cancelled/rescheduled appointment doesn't establish (or count as) a real
 * relationship between patient and clinician.
 */
const RELATIONSHIP_ESTABLISHING_STATUSES = new Set([
  "UPCOMING",
  "OCCURRED",
  "NO_SHOW",
  "LATE_CANCELLATION",
]);

/**
 * True if the patient has any non-cancelled appointment with this clinician.
 * Used to distinguish a brand-new patient (intake/assessment) from an existing
 * one (ongoing therapy).
 */
export function hasSeenClinician(patient: Patient, clinician: Clinician): boolean {
  return clinician.appointments.some(
    (appt) =>
      appt.patientId === patient.id &&
      RELATIONSHIP_ESTABLISHING_STATUSES.has(appt.status),
  );
}

/**
 * Whether a patient can be offered the given service with this clinician.
 * A patient can only schedule with a provider who operates in their state and
 * accepts their insurance, who is the right clinician type, and whose
 * relationship status matches the service.
 */
export function isEligible(
  clinician: Clinician,
  patient: Patient,
  service: ServiceType,
): boolean {
  const rule = SERVICE_RULES[service];
  return (
    clinician.clinicianType === rule.clinicianType &&
    clinician.states.includes(patient.state) &&
    clinician.insurances.includes(patient.insurance) &&
    hasSeenClinician(patient, clinician) === rule.requiresExistingRelationship
  );
}
