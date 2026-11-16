import { describe, expect, it } from "vitest";
import {
  buildContextualQuestion,
  shouldUseConversationContext
} from "./conversationMemory";

describe("conversation memory", () => {
  it("recognizes short follow-up questions that depend on prior context", () => {
    expect(shouldUseConversationContext("那漏服呢")).toBe(true);
    expect(shouldUseConversationContext("这个药可以停吗")).toBe(true);
    expect(shouldUseConversationContext("华法林漏服怎么办")).toBe(false);
  });

  it("adds the previous medical question without replacing the new one", () => {
    expect(
      buildContextualQuestion("那漏服呢", "华法林和阿司匹林能一起吃吗")
    ).toBe(
      "上一轮问题：华法林和阿司匹林能一起吃吗\n这一轮接着问：那漏服呢"
    );
  });
});
