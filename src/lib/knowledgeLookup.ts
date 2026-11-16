import type { AssistantResponse, RiskCheck } from "../types";
import { nowIso } from "./time";

export interface PublicKnowledgeSource {
  title: string;
  url: string;
}

export interface PublicKnowledgeResult {
  found: boolean;
  query: string;
  title: string;
  summary: string;
  plainText?: string;
  nextStep?: string;
  sources: PublicKnowledgeSource[];
  fetchedAt: string;
  cached: boolean;
}

function cleanVisibleText(value: string): string {
  return value.replaceAll("\u5343\u95ee", "公开资料服务");
}

export function isKnowledgeGap(response: AssistantResponse): boolean {
  return (
    !response.conversationOnly &&
    response.riskCheck.level === "unknown" &&
    (response.riskCheck.title.includes("暂未收录") ||
      response.riskCheck.summary.includes("资料不足"))
  );
}

export async function lookupPublicKnowledge(
  query: string
): Promise<PublicKnowledgeResult> {
  const response = await fetch("/api/knowledge/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query })
  });
  if (!response.ok) throw new Error("公开资料检索暂时不可用");
  return (await response.json()) as PublicKnowledgeResult;
}

export function buildPublicKnowledgeResponse(
  result: PublicKnowledgeResult
): AssistantResponse {
  const sources = (result.sources || [])
    .filter((source) => /^https:\/\//i.test(source.url))
    .slice(0, 4);
  const riskCheck: RiskCheck = {
    id: `web-knowledge-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    level: result.found && sources.length ? "medium" : "unknown",
    title:
      result.found && sources.length
        ? cleanVisibleText(result.title)
        : "公开资料中没有找到足够可靠的内容",
    summary:
      result.found && sources.length
        ? cleanVisibleText(result.summary)
        : "没有找到可追溯的可靠公开资料，因此未把推测内容加入知识库。",
    nextStep:
      cleanVisibleText(
        result.nextStep ||
          "如问题涉及诊断、处方或剂量调整，请咨询医生或药师。"
      ),
    reasons: [
      result.cached
        ? "使用此前已更新的公示资料"
        : "已检索并写入动态知识库",
      `更新时间：${new Date(result.fetchedAt).toLocaleString("zh-CN")}`
    ],
    sourceIds: ["src-dynamic-public-web"],
    involvedMedicationIds: [],
    medicationSnapshot: [],
    createdAt: nowIso()
  };
  const sourceBlock = sources.length
    ? [
        "",
        "### 公开资料来源",
        ...sources.map((source) => `- ${cleanVisibleText(source.title)}：${source.url}`)
      ]
    : [];
  return {
    message: [
      `## ${riskCheck.title}`,
      cleanVisibleText(result.summary),
      result.plainText ? `### 补充说明\n${cleanVisibleText(result.plainText)}` : "",
      "### 下一步",
      riskCheck.nextStep,
      ...sourceBlock,
      "",
      !result.found || !sources.length
        ? "本次没有获得可访问的可靠来源，知识库未更新。"
        : result.cached
          ? "知识库中已有这一主题的动态资料，本次直接复用并更新了回答。"
          : "知识库已根据公开资料完成更新，本次回答已同步使用新增内容。"
    ]
      .filter(Boolean)
      .join("\n\n"),
    riskCheck,
    stages: [
      { id: "knowledge-gap", label: "发现本地知识缺口", status: "done" },
      { id: "public-search", label: "检索可追溯公开资料", status: "done" },
      { id: "knowledge-update", label: "更新动态知识库", status: "done" }
    ],
    mode: "rules",
    groundingOnly: true
  };
}
