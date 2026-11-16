import { describe, expect, it } from "vitest";
import {
  buildPublicKnowledgeResponse,
  isKnowledgeGap
} from "./knowledgeLookup";
import type { AssistantResponse } from "../types";

const gapResponse: AssistantResponse = {
  message: "资料不足",
  riskCheck: {
    id: "gap",
    level: "unknown",
    title: "暂未收录这个具体主题",
    summary: "资料不足：当前知识库没有找到可靠资料。",
    nextStep: "请补充信息。",
    reasons: [],
    sourceIds: ["src-no-evidence"],
    involvedMedicationIds: [],
    medicationSnapshot: [],
    createdAt: "2026-11-16T00:00:00.000Z"
  },
  stages: [],
  mode: "rules"
};

describe("dynamic public knowledge", () => {
  it("detects a local knowledge gap", () => {
    expect(isKnowledgeGap(gapResponse)).toBe(true);
  });

  it("marks a sourced answer as a knowledge-base update", () => {
    const response = buildPublicKnowledgeResponse({
      found: true,
      query: "测试问题",
      title: "已补充的公开资料",
      summary: "这是基于公开资料整理的说明。",
      plainText: "补充说明内容。",
      nextStep: "如有不适请咨询医生。",
      sources: [{ title: "公开来源", url: "https://example.org" }],
      fetchedAt: "2026-11-16T00:00:00.000Z",
      cached: false
    });
    expect(response.message).toContain("知识库已根据公开资料完成更新");
    expect(response.message).toContain("https://example.org");
    expect(response.groundingOnly).toBe(true);
  });
});
