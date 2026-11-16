import type { AssistantResponse, RiskCheck } from "../types";
import { nowIso } from "./time";
import { buildUnavailableAnswer } from "./unavailableAnswer";

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
  query: string,
  context?: {
    age?: number;
    conditions?: string[];
    allergies?: string[];
    medicationNames?: string[];
  }
): Promise<PublicKnowledgeResult> {
  const response = await fetch("/api/knowledge/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, profile: context || {} })
  });
  if (!response.ok) throw new Error("公开资料检索暂时不可用");
  return (await response.json()) as PublicKnowledgeResult;
}

export function buildPublicKnowledgeResponse(
  result: PublicKnowledgeResult,
  context?: {
    age?: number;
    conditions?: string[];
    allergies?: string[];
    medicationNames?: string[];
  }
): AssistantResponse {
  const sources = (result.sources || [])
    .filter((source) => /^https:\/\//i.test(source.url))
    .slice(0, 4);
  if (!result.found) {
    const message = buildUnavailableAnswer(result.query);
    return {
      message,
      riskCheck: {
        id: `web-knowledge-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        level: "unknown",
        title: "这个问题目前无法准确回答",
        summary: message,
        nextStep: "",
        reasons: ["没有获得可追溯的可靠公开来源"],
        sourceIds: ["src-no-evidence"],
        involvedMedicationIds: [],
        medicationSnapshot: [],
        createdAt: nowIso()
      },
      stages: [
        { id: "knowledge-gap", label: "发现本地知识缺口", status: "done" },
        { id: "public-search", label: "核对可追溯公开资料", status: "done" }
      ],
      mode: "rules",
      groundingOnly: true
    };
  }
  const riskCheck: RiskCheck = {
    id: `web-knowledge-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    level: "medium",
    title: cleanVisibleText(result.title),
    summary: cleanVisibleText(result.summary),
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
    : [
        "",
        "### 检索说明",
        "本次回答使用了搜索增强资料；服务未返回可点击链接，内容已标记为待专业复核。"
      ];
  const profileFactors = [
    context?.age ? `${context.age}岁` : "",
    ...(context?.conditions || []),
    ...(context?.allergies || []).map((item) => `过敏：${item}`),
    ...(context?.medicationNames || []).slice(0, 8).map((item) => `正在用药：${item}`)
  ].filter(Boolean);
  const profileLine = profileFactors.length
    ? `结合您的档案（${profileFactors.join("、")}），以下内容按老年人安全视角整理。`
    : "以下内容按老年人一般安全视角整理，未填写的年龄和慢病情况仍需补充。";
  return {
    message: [
      `## ${riskCheck.title}`,
      cleanVisibleText(result.summary),
      profileLine,
      result.plainText ? `### 补充说明\n${cleanVisibleText(result.plainText)}` : "",
      "### 下一步",
      riskCheck.nextStep,
      ...sourceBlock,
      "",
      result.cached
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
