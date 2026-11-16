import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../types";
import { resolveChatRegeneration } from "./chatRegeneration";

const messages: ChatMessage[] = [
  {
    id: "user-1",
    role: "user",
    content: "头孢后能喝酒吗？",
    createdAt: "2026-11-17T00:00:00.000Z"
  },
  {
    id: "assistant-1",
    role: "assistant",
    content: "原回答",
    createdAt: "2026-11-17T00:00:01.000Z"
  },
  {
    id: "user-2",
    role: "user",
    content: "已经喝了怎么办？",
    createdAt: "2026-11-17T00:00:02.000Z"
  },
  {
    id: "assistant-2",
    role: "assistant",
    content: "后续回答",
    createdAt: "2026-11-17T00:00:03.000Z"
  }
];

describe("chat regeneration", () => {
  it("reuses the original question without deleting later records", () => {
    const context = resolveChatRegeneration(messages, "assistant-1");
    expect(context?.question).toBe("头孢后能喝酒吗？");
    expect(context?.targetIndex).toBe(1);
    expect(context?.userIndex).toBe(0);
    expect(context?.historyMessages).toEqual([]);
    expect(messages).toHaveLength(4);
    expect(messages[3].content).toBe("后续回答");
  });

  it("rejects non-assistant target messages", () => {
    expect(resolveChatRegeneration(messages, "user-1")).toBeNull();
  });
});
