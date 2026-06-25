import { Clinician } from "../starter-code/clinician";
import { Patient } from "../starter-code/patient";
import { ServiceType } from "../scheduling/eligibility";

/**
 * The data-access seam standing in for the EHR/database. The scheduling logic
 * depends only on this interface, so tests inject an in-memory implementation
 * seeded with mock data in place of a real DB.
 *
 * A production (e.g. Prisma) implementation would translate the same query into
 * a `WHERE` / `NOT EXISTS` clause, which is how this scales to hundreds of
 * clinicians without loading them all into memory.
 */
export interface ClinicianRepository {
  /**
   * Clinicians a patient is eligible to book the given service with — matching
   * state, insurance, clinician type, and prior-relationship rule. Returned
   * clinicians include their `availableSlots` and `appointments`.
   */
  findEligibleClinicians(
    patient: Patient,
    service: ServiceType,
  ): Promise<Clinician[]>;
}
