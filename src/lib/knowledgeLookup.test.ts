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
    }, {
      age: 72,
      conditions: ["高血压"],
      medicationNames: ["阿司匹林肠溶片"]
    });
    expect(response.message).toContain("知识库已根据公开资料完成更新");
    expect(response.message).toContain("https://example.org");
    expect(response.message).toContain("72岁、高血压");
    expect(response.message).toContain("老年人安全视角");
    expect(response.groundingOnly).toBe(true);
  });

  it("returns a short fallback without an explanation when no source was found", () => {
    const response = buildPublicKnowledgeResponse({
      found: false,
      query: "测试问题",
      title: "没有可靠来源",
      summary: "未找到可靠资料。",
      sources: [],
      fetchedAt: "2026-11-16T00:00:00.000Z",
      cached: false
    });
    expect(response.message).toContain("无法准确回答");
    expect(response.message.split(/\n/)).toHaveLength(1);
    expect(response.message.length).toBeLessThan(100);
    expect(response.message).not.toContain("知识库未更新");
    expect(response.message).not.toContain("知识库已根据公开资料完成更新");
  });

  it("uses a search-enhanced answer even without an accessible link", () => {
    const response = buildPublicKnowledgeResponse({
      found: true,
      query: "测试问题",
      title: "搜索增强结果",
      summary: "这是模型搜索后返回的实质回答。",
      plainText: "补充说明。",
      nextStep: "如涉及治疗调整，请咨询医生。",
      sources: [],
      fetchedAt: "2026-11-16T00:00:00.000Z",
      cached: false
    });
    expect(response.message).toContain("模型搜索后返回的实质回答");
    expect(response.message).toContain("搜索增强资料");
    expect(response.message).toContain("知识库已根据公开资料完成更新");
    expect(response.riskCheck.level).toBe("medium");
  });
});
