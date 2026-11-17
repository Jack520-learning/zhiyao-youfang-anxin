import { describe, expect, it } from "vitest";
import {
  buildDailyConversationResponse,
  isEmotionalDiscomfortQuery,
  isAssistantIdentityQuery,
  isContextualDailyReply,
  isDailyConversationQuery,
  resolveAdaptiveAnswerMode
} from "./dailyConversation";
import type { ElderProfile } from "../types";
import { answerWithRules } from "./riskEngine";

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
    expect(isDailyConversationQuery("你是谁")).toBe(true);
    expect(isAssistantIdentityQuery("你能做什么")).toBe(true);
    expect(resolveAdaptiveAnswerMode("陪我聊聊天吧", "safety")).toBe("quick");
    expect(resolveAdaptiveAnswerMode("你是谁", "detailed")).toBe("quick");
  });

  it("answers identity questions as natural daily chat without a warning", () => {
    const response = buildDailyConversationResponse("你是谁", profile);
    expect(response.conversationOnly).toBe(true);
    expect(response.message).toBe(
      "王阿姨，我是智药有方·安心药伴，您的家庭用药管家和用药助手。"
    );
    expect(response.message).not.toContain("普通问药");
    expect(response.message).not.toContain("回答方式");
    expect(response.message).not.toContain("温馨提示");
    expect(response.message).not.toContain("回答边界");
  });

  it("answers capability questions directly without the unrelated-knowledge warning", () => {
    const response = buildDailyConversationResponse("你能干什么", profile);
    expect(response.message).toContain("拍照识药");
    expect(response.message).toContain("核对联合用药");
    expect(response.message).not.toContain("健康用药无关");
    expect(response.message).not.toContain("温馨提示");
  });

  it("prioritizes medication and alcohol safety over family-chat keywords", () => {
    const query = "我老伴吃头孢了，晚上亲戚聚餐，能不能喝点酒。";
    expect(isDailyConversationQuery(query)).toBe(false);
    const medicalFallback = answerWithRules(query, [], profile);
    expect(medicalFallback.message).not.toContain(
      "家里人确实很容易牵动心情"
    );
    expect(medicalFallback.message).toContain("不建议饮酒");
    expect(medicalFallback.message).toContain("头孢");
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

  it("distinguishes emotional discomfort from medication-related physical symptoms", () => {
    expect(isEmotionalDiscomfortQuery("我心里不舒服怎么办")).toBe(true);
    expect(isEmotionalDiscomfortQuery("我心里不舒服，而且胸口痛")).toBe(false);
    const response = buildDailyConversationResponse(
      "我心里不舒服怎么办",
      profile
    );
    expect(response.message).toContain("愿意陪您");
    expect(response.message).not.toContain("仅凭头晕");
  });

  it("keeps the answer mode exactly as selected for medical questions", () => {
    expect(
      resolveAdaptiveAnswerMode("突然胸痛并且呼吸困难", "quick")
    ).toBe("quick");
    expect(
      resolveAdaptiveAnswerMode(
        "长期同时吃多种药，阿司匹林和其他药物一起用要注意什么",
        "safety"
      )
    ).toBe("safety");
    expect(
      resolveAdaptiveAnswerMode("这款药漏服了怎么办", "detailed")
    ).toBe("detailed");
  });
});
