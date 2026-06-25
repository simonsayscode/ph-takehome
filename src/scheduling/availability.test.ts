import { AvailableAppointmentSlot } from "../starter-code/appointment";
import { Clinician } from "../starter-code/clinician";
import { InMemoryClinicianRepository } from "../data/in-memory-clinician-repository";
import {
  MOCK_CLINICIANS,
  PSYCH_DENSE_ID,
  PSYCH_JANE_DOE_ID,
  PSYCH_SECOND_ID,
  THERAPIST_SEEN_ID,
  THERAPIST_UNSEEN_ID,
} from "../data/mock-clinicians";
import { patient } from "../starter-code/mock-patient";
import { getAssessmentAvailability, getTherapyAvailability } from "./availability";

const repo = new InMemoryClinicianRepository(MOCK_CLINICIANS);

describe("getAssessmentAvailability (Byrne, NY/AETNA)", () => {
  it("groups pairs by eligible psychologist and omits non-matching ones", async () => {
    const availability = await getAssessmentAvailability(patient, repo);
    const ids = availability.map((a) => a.clinician.id);

    expect(ids).toContain(PSYCH_JANE_DOE_ID);
    expect(ids).toContain(PSYCH_SECOND_ID);
    expect(ids).toContain(PSYCH_DENSE_ID);
    expect(ids).toHaveLength(3); // FL/BCBS psychologist excluded
    availability.forEach((a) => expect(a.pairs.length).toBeGreaterThan(0));
  });

  it("excludes slots occupied by an existing appointment", async () => {
    const availability = await getAssessmentAvailability(patient, repo);
    const jane = availability.find((a) => a.clinician.id === PSYCH_JANE_DOE_ID)!;

    // Jane has an UPCOMING appointment at 2024-08-19T12:00 (occupying 12:00-13:30).
    const usesOccupied = jane.pairs.some(
      (p) =>
        p.session1.date.toISOString() === "2024-08-19T12:00:00.000Z" ||
        p.session2.date.toISOString() === "2024-08-19T12:00:00.000Z",
    );
    expect(usesOccupied).toBe(false);
  });

  it("only pairs the maximized (non-overlapping) subset of a dense 15-min-cadence clinician's slots", async () => {
    const availability = await getAssessmentAvailability(patient, repo);
    const dense = availability.find((a) => a.clinician.id === PSYCH_DENSE_ID)!;

    // Each of the two days' 7 dense candidates collapses to exactly 2 survivors
    // (the first and last of the fully-packed 90-min window), so cross-day
    // pairing should yield exactly 2x2 = 4 pairs, never touching a discarded
    // "middle" timestamp like 10:15 or 14:15.
    expect(dense.pairs).toHaveLength(4);

    const usedTimestamps = new Set(
      dense.pairs.flatMap((p) => [
        p.session1.date.toISOString(),
        p.session2.date.toISOString(),
      ]),
    );
    expect(usedTimestamps).toEqual(
      new Set([
        "2024-09-09T10:00:00.000Z",
        "2024-09-09T11:30:00.000Z",
        "2024-09-11T14:00:00.000Z",
        "2024-09-11T15:30:00.000Z",
      ]),
    );
  });
});

describe("getTherapyAvailability (Byrne, NY/AETNA)", () => {
  it("offers an intake only with a therapist the patient has not seen", async () => {
    const availability = await getTherapyAvailability(patient, repo, "THERAPY_INTAKE");
    const ids = availability.map((a) => a.clinician.id);

    expect(ids).toEqual([THERAPIST_UNSEEN_ID]);
    expect(availability[0].slots.length).toBeGreaterThan(0);
  });

  it("offers sixty-min sessions only with a therapist the patient already sees", async () => {
    const availability = await getTherapyAvailability(patient, repo, "THERAPY_SIXTY_MINS");
    const ids = availability.map((a) => a.clinician.id);

    expect(ids).toEqual([THERAPIST_SEEN_ID]);
  });
});

describe("availability hardening", () => {
  const slot = (
    clinicianId: string,
    date: string,
    length: number,
  ): AvailableAppointmentSlot => ({
    id: `${clinicianId}:${date}`,
    clinicianId,
    date: new Date(date),
    length,
    createdAt: new Date(date),
    updatedAt: new Date(date),
  });

  const therapist = (id: string, slots: AvailableAppointmentSlot[]): Clinician => ({
    id,
    firstName: "Test",
    lastName: "Therapist",
    states: ["NY"],
    insurances: ["AETNA"],
    clinicianType: "THERAPIST",
    appointments: [],
    availableSlots: slots,
    maxDailyAppointments: 5,
    maxWeeklyAppointments: 20,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const psychologist = (id: string, slots: AvailableAppointmentSlot[]): Clinician => ({
    ...therapist(id, slots),
    clinicianType: "PSYCHOLOGIST",
  });

  it("collapses duplicate same-timestamp slots into a single offering", async () => {
    const id = "dup-therapist";
    const r = new InMemoryClinicianRepository([
      therapist(id, [
        slot(id, "2024-09-02T15:00:00.000Z", 60),
        slot(id, "2024-09-02T15:00:00.000Z", 60), // exact duplicate
      ]),
    ]);

    const availability = await getTherapyAvailability(patient, r, "THERAPY_INTAKE");

    expect(availability[0].slots).toHaveLength(1);
  });

  it("drops slots whose length doesn't match the service (bad data)", async () => {
    const id = "mixed-psych";
    const r = new InMemoryClinicianRepository([
      psychologist(id, [
        slot(id, "2024-09-02T16:00:00.000Z", 90),
        slot(id, "2024-09-03T16:00:00.000Z", 60), // stray 60-min slot for a psychologist
        slot(id, "2024-09-04T16:00:00.000Z", 90),
      ]),
    ]);

    const availability = await getAssessmentAvailability(patient, r);
    const usedLengths = availability[0].pairs.flatMap((p) => [
      p.session1.length,
      p.session2.length,
    ]);
    const usedDates = availability[0].pairs.flatMap((p) => [
      p.session1.date.toISOString(),
      p.session2.date.toISOString(),
    ]);

    expect(usedLengths.every((len) => len === 90)).toBe(true);
    expect(usedDates).not.toContain("2024-09-03T16:00:00.000Z");
  });

  it("excludes past slots when a `now` cutoff is supplied", async () => {
    const id = "now-therapist";
    const r = new InMemoryClinicianRepository([
      therapist(id, [
        slot(id, "2024-09-02T15:00:00.000Z", 60),
        slot(id, "2024-09-03T15:00:00.000Z", 60),
      ]),
    ]);

    const availability = await getTherapyAvailability(patient, r, "THERAPY_INTAKE", {
      now: new Date("2024-09-02T20:00:00.000Z"),
    });

    expect(availability[0].slots).toHaveLength(1);
    expect(availability[0].slots[0].date.toISOString()).toBe(
      "2024-09-03T15:00:00.000Z",
    );
  });
});
