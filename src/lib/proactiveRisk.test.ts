import { describe, expect, it } from "vitest";
import type { Medication } from "../types";
import { buildProactiveRiskInsights } from "./proactiveRisk";

function medication(
  id: string,
  name: string,
  ingredient: string,
  reminderEnabled = true
): Medication {
  return {
    id,
    name,
    genericName: ingredient,
    ingredients: [ingredient],
    dosage: "1 片",
    frequency: "每日 1 次",
    times: ["08:00"],
    relation: "饭后",
    instructions: "",
    startDate: "2026-01-01",
    status: "active",
    reminderEnabled,
    source: {
      type: "medicine-label",
      title: "药盒",
      capturedAt: "2026-01-01T00:00:00.000Z",
      confirmed: true
    },
    confidence: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

const now = new Date("2026-11-16T08:00:00.000Z");

describe("proactive risk trends", () => {
  it("detects duplicate ingredients and disabled reminders for high-risk medicine", () => {
    const insights = buildProactiveRiskInsights({
      medications: [
        medication("1", "阿司匹林肠溶片", "阿司匹林", false),
        medication("2", "阿司匹林片", "阿司匹林")
      ],
      doseEvents: [],
      riskChecks: [],
      familyAlerts: [],
      now
    });

    expect(insights.some((item) => item.id === "duplicate-active-ingredient"))
      .toBe(true);
    expect(insights.some((item) => item.id === "high-risk-reminder-off"))
      .toBe(true);
  });

  it("detects repeated unconfirmed doses within seven days", () => {
    const insights = buildProactiveRiskInsights({
      medications: [medication("1", "氨氯地平片", "氨氯地平")],
      doseEvents: [
        {
          id: "dose-1",
          medicationId: "1",
          scheduledAt: "2026-11-15T00:00:00.000Z",
          status: "skipped",
          updatedAt: "2026-11-15T01:00:00.000Z"
        },
        {
          id: "dose-2",
          medicationId: "1",
          scheduledAt: "2026-11-14T00:00:00.000Z",
          status: "unsure",
          updatedAt: "2026-11-14T01:00:00.000Z"
        }
      ],
      riskChecks: [],
      familyAlerts: [],
      now
    });

    expect(insights[0].id).toBe("repeated-missed-doses");
  });

  it("returns a stable low-risk state when no concerning trend is found", () => {
    const insights = buildProactiveRiskInsights({
      medications: [medication("1", "氨氯地平片", "氨氯地平")],
      doseEvents: [
        {
          id: "dose-1",
          medicationId: "1",
          scheduledAt: "2026-11-15T00:00:00.000Z",
          status: "taken",
          updatedAt: "2026-11-15T01:00:00.000Z"
        }
      ],
      riskChecks: [],
      familyAlerts: [],
      now
    });

    expect(insights).toHaveLength(1);
    expect(insights[0].level).toBe("low");
  });
});
