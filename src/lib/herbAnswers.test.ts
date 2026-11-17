import { describe, expect, it } from "vitest";
import { herbs } from "../catalog/herbs";
import { buildHerbChatResponse } from "./herbAnswers";
import { isKnowledgeGap } from "./knowledgeLookup";

const herb = herbs.find((item) => item.name === "蒲公英")!;
const profile = {
  name: "测试老人",
  age: 72,
  conditions: [],
  allergies: [],
  timeZone: "Asia/Shanghai",
  healthProfileCompleted: true,
  healthProfilePromptSeen: true,
  visionPreference: "large" as const,
  voiceEnabled: true
};

describe("Chinese herb chat answers", () => {
  it("answers a traditional-use follow-up from the herb record", () => {
    const response = buildHerbChatResponse(
      herb,
      "蒲公英的传统功用是什么？",
      [],
      profile
    );
    expect(response.message).toContain("清热解毒");
    expect(response.message).toContain("消肿散结");
    expect(response.conversationOnly).toBe(true);
    expect(isKnowledgeGap(response)).toBe(false);
  });

  it("does not produce a generic unavailable-answer fallback", () => {
    const response = buildHerbChatResponse(
      herb,
      "蒲公英使用前要注意哪些安全事项？",
      [],
      profile
    );
    expect(response.message).not.toContain("这个问题目前无法准确回答");
    expect(response.message).toContain("安全提醒");
  });
});
