import { describe, expect, it } from "vitest";
import {
  buildDailyConversationResponse,
  isDailyConversationQuery,
  resolveAdaptiveAnswerMode
} from "./dailyConversation";
import type { ElderProfile } from "../types";

const profile: ElderProfile = {
  name: "王阿姨",
  age: 72,
  conditions: [],
  allergies: [],
  timeZone: "Asia/Shanghai",
  healthProfileCompleted: true,
  healthProfilePromptSeen: true,
  visionPreference: "large",
  voiceEnabled: true
};

describe("daily conversation", () => {
  it("answers everyday chat without returning a medical data-missing response", () => {
    const response = buildDailyConversationResponse(
      "我今天心情不太好",
      profile
    );
    expect(response.conversationOnly).toBe(true);
    expect(response.message).toContain("愿意陪您");
    expect(response.message).not.toContain("资料不足");
  });

  it("selects quick replies for daily chat", () => {
    expect(isDailyConversationQuery("陪我聊聊天吧")).toBe(true);
    expect(resolveAdaptiveAnswerMode("陪我聊聊天吧", "safety")).toBe("quick");
  });

  it("upgrades emergency questions and deepens complex medical questions", () => {
    expect(
      resolveAdaptiveAnswerMode("突然胸痛并且呼吸困难", "quick")
    ).toBe("safety");
    expect(
      resolveAdaptiveAnswerMode(
        "长期同时吃多种药，阿司匹林和其他药物一起用要注意什么",
        "safety"
      )
    ).toBe("detailed");
  });
});
