import { describe, expect, it } from "vitest";
import {
  conditionGuides,
  findConditionGuidance
} from "./conditionGuidance";
import { answerWithRules } from "../lib/riskEngine";
import type { ElderProfile } from "../types";

const profile: ElderProfile = {
  name: "测试老人",
  age: 72,
  conditions: ["冠心病"],
  allergies: [],
  timeZone: "Asia/Shanghai",
  healthProfileCompleted: true,
  healthProfilePromptSeen: true,
  visionPreference: "large",
  voiceEnabled: true
};

describe("condition guidance", () => {
  it("covers common older-adult chronic conditions", () => {
    expect(conditionGuides.length).toBeGreaterThanOrEqual(20);
    expect(conditionGuides.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        "heart-disease-general",
        "heart-failure",
        "hypertension",
        "type-2-diabetes",
        "copd",
        "chronic-kidney-disease",
        "dementia",
        "parkinson",
        "epilepsy",
        "cancer-treatment"
      ])
    );
  });

  it("prefers a specific diagnosis over the broad heart-disease card", () => {
    expect(findConditionGuidance("我心衰平时要注意什么")?.condition.id).toBe(
      "heart-failure"
    );
    expect(findConditionGuidance("心脏病该注意些什么")?.condition.id).toBe(
      "heart-disease-general"
    );
  });

  it("uses the personal condition when the user asks about their own health", () => {
    const match = findConditionGuidance("我平时该注意什么", ["冠心病"]);
    expect(match?.condition.id).toBe("coronary-heart-disease");
    expect(match?.fromProfile).toBe(true);
  });

  it("answers a heart-disease question with concrete safety guidance", () => {
    const response = answerWithRules(
      "我心脏病该注意些什么",
      [],
      profile
    );
    expect(response.riskCheck.level).toBe("medium");
    expect(response.message).toContain("心脏病安全要点");
    expect(response.message).toContain("现在优先做");
    expect(response.message).toContain("必须立刻求助");
    expect(response.message).toContain("120");
    expect(response.message).not.toContain("资料不足");
    expect(response.groundingOnly).toBe(false);
  });

  it("produces materially different content for all three answer modes", () => {
    const query = "我心脏病该注意些什么";
    const quick = answerWithRules(query, [], profile, {
      answerMode: "quick"
    });
    const safety = answerWithRules(query, [], profile, {
      answerMode: "safety"
    });
    const detailed = answerWithRules(query, [], profile, {
      answerMode: "detailed"
    });
    expect(quick.message).not.toContain("\n## ");
    expect(safety.message).toContain("安全要点");
    expect(detailed.message).toContain("日常可以重点关注");
    expect(detailed.message).toContain("资料说明");
    expect(quick.message.length).toBeLessThan(safety.message.length);
    expect(safety.message.length).toBeLessThan(detailed.message.length);
  });
});
