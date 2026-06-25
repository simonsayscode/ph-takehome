import { parseISO } from "date-fns";
import { AvailableAppointmentSlot } from "../starter-code/appointment";
import { getAssessmentPairs } from "./assessment";

/** Minimal 90-min slot from an ISO date string. */
function slot(date: string): AvailableAppointmentSlot {
  return {
    id: date,
    clinicianId: "c",
    date: parseISO(date),
    length: 90,
    createdAt: parseISO(date),
    updatedAt: parseISO(date),
  };
}

/** Represent a pair as "start1|start2" for easy set comparison. */
function key(p: { session1: { date: Date }; session2: { date: Date } }): string {
  return `${p.session1.date.toISOString()}|${p.session2.date.toISOString()}`;
}

describe("getAssessmentPairs", () => {
  it("reproduces the README's expected 11 pairs from its 6-slot subset", () => {
    const slots = [
      slot("2024-08-19T12:00:00.000Z"),
      slot("2024-08-19T12:15:00.000Z"),
      slot("2024-08-21T12:00:00.000Z"),
      slot("2024-08-21T15:00:00.000Z"),
      slot("2024-08-22T15:00:00.000Z"),
      slot("2024-08-28T12:15:00.000Z"),
    ];

    const expected = [
      ["2024-08-19T12:00:00.000Z", "2024-08-21T12:00:00.000Z"],
      ["2024-08-19T12:00:00.000Z", "2024-08-21T15:00:00.000Z"],
      ["2024-08-19T12:00:00.000Z", "2024-08-22T15:00:00.000Z"],
      ["2024-08-19T12:15:00.000Z", "2024-08-21T12:00:00.000Z"],
      ["2024-08-19T12:15:00.000Z", "2024-08-21T15:00:00.000Z"],
      ["2024-08-19T12:15:00.000Z", "2024-08-22T15:00:00.000Z"],
      ["2024-08-21T12:00:00.000Z", "2024-08-22T15:00:00.000Z"],
      ["2024-08-21T12:00:00.000Z", "2024-08-28T12:15:00.000Z"],
      ["2024-08-21T15:00:00.000Z", "2024-08-22T15:00:00.000Z"],
      ["2024-08-21T15:00:00.000Z", "2024-08-28T12:15:00.000Z"],
      ["2024-08-22T15:00:00.000Z", "2024-08-28T12:15:00.000Z"],
    ].map(([a, b]) => `${a}|${b}`);

    const pairs = getAssessmentPairs(slots);

    expect(new Set(pairs.map(key))).toEqual(new Set(expected));
    expect(pairs).toHaveLength(11);
  });

  it("treats the 7-day gap as inclusive (book Wed -> next Wed offered)", () => {
    const pairs = getAssessmentPairs([
      slot("2024-08-21T12:00:00.000Z"),
      slot("2024-08-28T12:00:00.000Z"), // exactly 7 calendar days later
    ]);
    expect(pairs).toHaveLength(1);
  });

  it("excludes pairs more than 7 calendar days apart", () => {
    const pairs = getAssessmentPairs([
      slot("2024-08-19T12:00:00.000Z"),
      slot("2024-08-28T12:00:00.000Z"), // 9 days apart
    ]);
    expect(pairs).toHaveLength(0);
  });

  it("never pairs two slots on the same day", () => {
    const pairs = getAssessmentPairs([
      slot("2024-08-19T12:00:00.000Z"),
      slot("2024-08-19T15:00:00.000Z"),
    ]);
    expect(pairs).toHaveLength(0);
  });

  it("offers nothing for a lone slot with no possible follow-up", () => {
    expect(getAssessmentPairs([slot("2024-08-19T12:00:00.000Z")])).toHaveLength(0);
  });
});
