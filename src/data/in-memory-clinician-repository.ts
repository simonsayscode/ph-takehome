import { Clinician } from "../starter-code/clinician";
import { Patient } from "../starter-code/patient";
import { isEligible, ServiceType } from "../scheduling/eligibility";
import { ClinicianRepository } from "./clinician-repository";

/**
 * In-memory `ClinicianRepository` backed by a fixed list of clinicians. Filters
 * with the same `isEligible` predicate a real query would encode in SQL. Used
 * for tests and demos in place of a database.
 */
export class InMemoryClinicianRepository implements ClinicianRepository {
  constructor(private readonly clinicians: Clinician[]) {}

  async findEligibleClinicians(
    patient: Patient,
    service: ServiceType,
  ): Promise<Clinician[]> {
    return this.clinicians.filter((clinician) =>
      isEligible(clinician, patient, service),
    );
  }
}
