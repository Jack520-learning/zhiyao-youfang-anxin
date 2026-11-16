import { describe, expect, it } from "vitest";
import type { Conversation, RiskCheck } from "../types";
import {
  collectTrackableRiskChecks,
  isTrackableRiskCheck,
  trackableRiskChecks
} from "./riskTracking";

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

  it("restores risk records omitted from the snapshot summary", () => {
    const highRisk = {
      ...risk("high-medication-risk", ["src-drug-catalog"]),
      level: "high" as const,
      createdAt: "2026-11-16T08:00:00.000Z"
    };
    const conversation: Conversation = {
      id: "conversation-test",
      title: "测试",
      createdAt: highRisk.createdAt,
      updatedAt: highRisk.createdAt,
      messages: [
        {
          id: "message-test",
          role: "assistant",
          content: "高风险提醒",
          createdAt: highRisk.createdAt,
          riskCheck: highRisk
        }
      ]
    };
    const restored = collectTrackableRiskChecks(
      [risk("recent", ["src-drug-catalog"])],
      [conversation]
    );
    expect(restored.map((item) => item.id)).toContain("high-medication-risk");
    expect(restored.find((item) => item.id === "high-medication-risk")?.level)
      .toBe("high");
  });

  it("does not let an old conversation copy erase the family review", () => {
    const reviewed = {
      ...risk("reviewed-risk", ["src-drug-catalog"]),
      familyReview: {
        reviewedAt: "2026-11-16T09:00:00.000Z",
        reviewedBy: "家属刘女士"
      }
    };
    const conversation: Conversation = {
      id: "conversation-review",
      title: "核对记录",
      createdAt: reviewed.createdAt,
      updatedAt: reviewed.createdAt,
      messages: [
        {
          id: "message-review",
          role: "assistant",
          content: "风险提醒",
          createdAt: reviewed.createdAt,
          riskCheck: risk("reviewed-risk", ["src-drug-catalog"])
        }
      ]
    };
    const restored = collectTrackableRiskChecks([reviewed], [conversation]);
    expect(restored[0].familyReview).toEqual(reviewed.familyReview);
  });
});
