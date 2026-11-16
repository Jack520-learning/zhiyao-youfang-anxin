import { describe, expect, it } from "vitest";
import type { RiskCheck } from "../types";
import { isTrackableRiskCheck, trackableRiskChecks } from "./riskTracking";

function risk(
  id: string,
  sourceIds: string[],
  trackInRiskSummary?: boolean
): RiskCheck {
  return {
    id,
    level: "medium",
    title: "测试记录",
    summary: "测试摘要",
    nextStep: "测试下一步",
    reasons: [],
    sourceIds,
    involvedMedicationIds: [],
    medicationSnapshot: [],
    createdAt: "2026-11-16T00:00:00.000Z",
    trackInRiskSummary
  };
}

describe("risk summary tracking", () => {
  it("excludes general chat and public informational results", () => {
    const checks = [
      risk("general", ["src-chat"]),
      risk("public", ["src-dynamic-public-web"]),
      risk("explicit-off", ["src-drug-catalog"], false),
      risk("medical", ["src-drug-catalog"])
    ];
    expect(trackableRiskChecks(checks).map((item) => item.id)).toEqual([
      "medical"
    ]);
  });

  it("keeps verified medication safety checks", () => {
    expect(isTrackableRiskCheck(risk("medical", ["src-user-profile"]))).toBe(
      true
    );
  });
});
