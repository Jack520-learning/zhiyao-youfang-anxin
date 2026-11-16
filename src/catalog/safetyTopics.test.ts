import { describe, expect, it } from "vitest";
import { findSafetyTopics, safetyTopics } from "./safetyTopics";
import { answerWithRules } from "../lib/riskEngine";
import type { ElderProfile } from "../types";

const profile: ElderProfile = {
  name: "张阿姨",
  age: 72,
  conditions: ["高血压"],
  allergies: [],
  timeZone: "Asia/Shanghai",
  healthProfileCompleted: true,
  healthProfilePromptSeen: true,
  visionPreference: "large",
  voiceEnabled: true
};

describe("common safety knowledge topics", () => {
  it("contains broad coverage for high-frequency medication questions", () => {
    expect(safetyTopics.length).toBeGreaterThanOrEqual(20);
  });

  it("retrieves missed-dose and antibiotic topics", () => {
    expect(findSafetyTopics("忘了吃一次要不要补服")[0].topic.id).toBe(
      "missed-dose-general"
    );
    expect(
      findSafetyTopics("抗生素吃了两天症状好了能停吗")[0].topic.id
    ).toBe("antibiotic-course");
  });

  it("returns a grounded safety response instead of a generic no-data answer", () => {
    const response = answerWithRules(
      "吃药期间喝啤酒可以吗",
      [],
      profile
    );

    expect(response.riskCheck.sourceIds).toContain("src-common-safety");
    expect(response.message).toContain("酒精");
  });
});
