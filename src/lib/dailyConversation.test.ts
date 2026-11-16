import { describe, expect, it } from "vitest";
import {
  buildDailyConversationResponse,
  isContextualDailyReply,
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

  it("remembers the previous daily question when the reply is short", () => {
    const previousAssistant =
      "您最近吃饭、睡觉都还顺心吗？";
    expect(isContextualDailyReply("还行", previousAssistant)).toBe(true);
    const response = buildDailyConversationResponse(
      "还行",
      profile,
      previousAssistant
    );
    expect(response.conversationOnly).toBe(true);
    expect(response.message).toContain("吃饭和睡觉");
    expect(response.message).not.toContain("资料不足");
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
