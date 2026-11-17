import { describe, expect, it } from "vitest";
import {
  buildContextualQuestion,
  buildRecentConversationQuestion,
  shouldUseConversationContext
} from "./conversationMemory";

describe("conversation memory", () => {
  it("recognizes short follow-up questions that depend on prior context", () => {
    expect(shouldUseConversationContext("那漏服呢")).toBe(true);
    expect(shouldUseConversationContext("这个药可以停吗")).toBe(true);
    expect(shouldUseConversationContext("华法林漏服怎么办")).toBe(false);
    expect(
      shouldUseConversationContext("如果漏服时间比较久，应该联系谁？")
    ).toBe(true);
    expect(shouldUseConversationContext("下一次服药提醒怎么设置？")).toBe(
      true
    );
  });

  it("adds the previous medical question without replacing the new one", () => {
    expect(
      buildContextualQuestion("那漏服呢", "华法林和阿司匹林能一起吃吗")
    ).toBe(
      "上一轮问题：华法林和阿司匹林能一起吃吗\n这一轮接着问：那漏服呢"
    );
  });

  it("uses the active medicine and recent questions to resolve follow-ups", () => {
    expect(
      buildRecentConversationQuestion({
        query: "如果漏服时间比较久，应该联系谁？",
        medicineName: "硝酸甘油片",
        recentMessages: [
          {
            role: "user",
            content: "我拍了一张药盒照片"
          },
          {
            role: "assistant",
            content: "已识别硝酸甘油片"
          }
        ]
      })
    ).toBe(
      "硝酸甘油片 如果漏服时间比较久，应该联系谁？"
    );
  });

  it("does not let an older topic override the current herb question", () => {
    expect(
      buildRecentConversationQuestion({
        query: "这种中药材和我现在吃的西药有冲突吗？",
        medicineName: "蒲公英",
        recentMessages: [
          {
            role: "user",
            content: "蒲公英的传统功用是什么？"
          }
        ]
      })
    ).toBe("蒲公英 这种中药材和我现在吃的西药有冲突吗？");
  });
});
