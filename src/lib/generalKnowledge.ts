import type { AssistantResponse } from "../types";
import { findBestMedicine } from "../catalog/retrieval";
import { herbs } from "../catalog/herbs";
import { isDailyConversationQuery } from "./dailyConversation";
import { nowIso } from "./time";

const medicalTerms =
  /(药|胶囊|片剂|颗粒|剂量|服用|同服|副作用|漏服|停药|病|高血压|糖尿病|心衰|房颤|肾病|肝病|哮喘|慢阻肺|痴呆|帕金森|癫痫|甲状腺|癌症|痛|晕|咳|喘|恶心|呕吐|腹泻|发热|发烧|不舒服|心慌|胸闷|过敏|医生|药师|医院)/i;

export const GENERAL_KNOWLEDGE_NOTICE =
  "温馨提示：这个问题与健康用药无关，以下仅作一般常识参考。";

export function isGeneralKnowledgeQuestion(
  query: string,
  hasExplicitSkill = false
): boolean {
  if (hasExplicitSkill) return false;
  const normalized = query.trim().replace(/\s+/g, "");
  const mentionsKnownHerb = herbs.some((herb) =>
    [herb.name, ...herb.aliases].some((term) =>
      normalized.includes(term.replace(/\s+/g, ""))
    )
  );
  if (
    normalized.length < 3 ||
    medicalTerms.test(normalized) ||
    (findBestMedicine(query)?.score || 0) >= 0.65 ||
    mentionsKnownHerb ||
    isDailyConversationQuery(query)
  ) {
    return false;
  }
  return /(是什么|为什么|怎么|多少|区别|原理|意思|谁|哪里|什么时候|介绍|解释|计算|换算|可以.*[吗么]|能不能|能.*[吗么]|会不会|会.*[吗么]|是不是|是否|有没有|有什么|有哪些|如何|还是|等于几|\d+\s*[+\-*/]\s*\d+)/.test(
    normalized
  );
}

export function withGeneralKnowledgeNotice(text: string): string {
  return `> ${GENERAL_KNOWLEDGE_NOTICE}\n\n${text.trim()}`;
}

export function buildGeneralKnowledgeResponse(
  query: string,
  answerMode: "quick" | "safety" | "detailed" = "quick"
): AssistantResponse {
  const missing =
    "这个问题暂时无法准确回答，请补充更具体的背景或条件后再问。";
  const message =
    answerMode === "quick"
      ? "暂时无法准确回答，请补充具体背景或条件。"
      : answerMode === "safety"
        ? [
            "## 当前回答",
            missing,
            "",
            "## 回答边界",
            "这条问题不属于健康用药范围，因此只作为一般常识回答；没有可靠信息时不会猜测。"
          ].join("\n")
        : [
            "## 当前问题的详细说明",
            missing,
            "",
            "## 完整解释",
            `您的问题是“${query.trim()}”。目前缺少足够背景，无法给出可靠且具体的常识结论。`,
            "",
            "## 判断依据",
            "- 当前问题不属于健康用药范围",
            "- 缺少可核实的背景或条件",
            "",
            "## 下一步",
            "请补充事情发生的环境和具体条件后再问。"
          ].join("\n\n");
  return {
    message,
    riskCheck: {
      id: `general-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      level: "low",
      title: "一般常识问题",
      summary: missing,
      nextStep: "",
      reasons: ["问题不属于健康用药范围"],
      sourceIds: ["src-chat"],
      involvedMedicationIds: [],
      medicationSnapshot: [],
      createdAt: nowIso(),
      trackInRiskSummary: false
    },
    stages: [
      { id: "general-intent", label: "识别为一般常识问题", status: "done" },
      { id: "general-answer", label: "组织常识性回答", status: "done" }
    ],
    mode: "rules",
    conversationOnly: true
  };
}
