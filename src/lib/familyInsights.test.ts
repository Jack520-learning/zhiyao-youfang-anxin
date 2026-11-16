import { describe, expect, it } from "vitest";
import type { DoseEvent, Medication, RiskCheck } from "../types";
import { buildMedicationTrend, buildRiskDistribution } from "./familyInsights";
import { getTodayDoses } from "./time";

const medication: Medication = {
  id: "med-test",
  name: "测试药",
  genericName: "测试药",
  ingredients: ["测试成分"],
  dosage: "1片",
  frequency: "每日 1 次",
  times: ["08:00"],
  relation: "饭后",
  instructions: "",
  startDate: "2026-11-10",
  status: "active",
  reminderEnabled: true,
  source: {
    type: "medicine-label",
    title: "测试",
    capturedAt: "2026-11-10T00:00:00.000Z",
    confirmed: true
  },
  confidence: 1,
  createdAt: "2026-11-10T00:00:00.000Z",
  updatedAt: "2026-11-10T00:00:00.000Z"
};

function doseEvent(status: DoseEvent["status"]): DoseEvent {
  return {
    id: "2026-11-16-med-test-08:00",
    medicationId: medication.id,
    scheduledAt: "2026-11-16T00:00:00.000Z",
    status,
    updatedAt: "2026-11-16T00:05:00.000Z"
  };
}

function riskCheck(
  id: string,
  level: RiskCheck["level"],
  createdAt: string,
  sourceIds: string[] = []
): RiskCheck {
  return {
    id,
    level,
    title: id,
    summary: "",
    nextStep: "",
    reasons: [],
    sourceIds,
    involvedMedicationIds: [],
    medicationSnapshot: [],
    createdAt
  };
}

describe("familyInsights", () => {
  it("computes the last seven days of medication confirmation rates", () => {
    const trend = buildMedicationTrend([medication], [doseEvent("taken")], {
      now: new Date("2026-11-16T12:00:00.000Z"),
      timeZone: "Asia/Shanghai"
    });
    const today = trend.at(-1);
    expect(trend).toHaveLength(7);
    expect(today?.dateKey).toBe("2026-11-16");
    expect(today?.taken).toBe(1);
    expect(today?.confirmationRate).toBe(100);
  });

  it("does not treat an unrecorded dose as taken", () => {
    const today = buildMedicationTrend([medication], [], {
      now: new Date("2026-11-16T12:00:00.000Z"),
      timeZone: "Asia/Shanghai"
    }).at(-1);
    expect(today?.taken).toBe(0);
    expect(today?.pending).toBe(1);
    expect(today?.confirmationRate).toBe(0);
  });

  it("moves a cancelled confirmation back to pending in the family trend", () => {
    const cancelled: DoseEvent = {
      ...doseEvent("pending"),
      updatedAt: "2026-11-16T00:10:00.000Z",
      note: "老人取消了服药确认，已恢复为尚未确认"
    };
    const today = buildMedicationTrend([medication], [cancelled], {
      now: new Date("2026-11-16T12:00:00.000Z"),
      timeZone: "Asia/Shanghai"
    }).at(-1);
    const todayDose = getTodayDoses(
      [medication],
      [cancelled],
      new Date("2026-11-16T12:00:00.000Z"),
      "Asia/Shanghai"
    )[0];
    expect(today?.taken).toBe(0);
    expect(today?.pending).toBe(1);
    expect(today?.confirmationRate).toBe(0);
    expect(todayDose?.status).toBe("pending");
    expect(todayDose?.note).toContain("取消");
  });

  it("groups recent risk records and respects high-risk sharing", () => {
    const checks = [
      riskCheck("high", "high", "2026-11-15T00:00:00.000Z"),
      riskCheck("medium", "medium", "2026-11-14T00:00:00.000Z"),
      riskCheck("old", "low", "2026-09-01T00:00:00.000Z")
    ];
    const shared = buildRiskDistribution(checks, {
      now: new Date("2026-11-16T12:00:00.000Z")
    });
    const restricted = buildRiskDistribution(checks, {
      now: new Date("2026-11-16T12:00:00.000Z"),
      includeHighRisk: false
    });
    expect(shared.find((item) => item.key === "high")?.count).toBe(1);
    expect(shared.find((item) => item.key === "medium")?.count).toBe(1);
    expect(shared.find((item) => item.key === "low")?.count).toBe(0);
    expect(restricted.find((item) => item.key === "high")?.count).toBe(0);
  });

  it("does not count general knowledge or public informational results as health risk", () => {
    const checks = [
      riskCheck(
        "general",
        "medium",
        "2026-11-15T00:00:00.000Z",
        ["src-chat"]
      ),
      riskCheck(
        "public",
        "medium",
        "2026-11-15T00:00:00.000Z",
        ["src-dynamic-public-web"]
      ),
      riskCheck(
        "medical",
        "medium",
        "2026-11-15T00:00:00.000Z",
        ["src-drug-catalog"]
      )
    ];
    const distribution = buildRiskDistribution(checks, {
      now: new Date("2026-11-16T12:00:00.000Z")
    });
    expect(
      distribution.find((item) => item.key === "medium")?.count
    ).toBe(1);
  });
});
