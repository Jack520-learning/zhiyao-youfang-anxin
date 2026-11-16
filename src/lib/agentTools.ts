import {
  answerFromDrugCatalog,
  currentCatalogCompanionSlugs
} from "../catalog/chatBridge";
import { findBestMedicine } from "../catalog/retrieval";
import { answerWithRules, type AnswerMode } from "./riskEngine";
import type {
  AssistantResponse,
  ElderProfile,
  Medication
} from "../types";

export type AgentToolName =
  | "lookup_drug_catalog"
  | "check_safety_rules"
  | "get_elder_profile_context"
  | "get_medication_schedule";

export interface AgentToolRun<T = unknown> {
  name: AgentToolName;
  label: string;
  summary: string;
  durationMs: number;
  result: T;
}

interface ToolContext {
  query: string;
  profile: ElderProfile;
  medications: Medication[];
  answerMode?: AnswerMode;
}

const toolLabels: Record<AgentToolName, string> = {
  lookup_drug_catalog: "检索药品百科与剂型资料",
  check_safety_rules: "核对相互作用、重复成分与过敏史",
  get_elder_profile_context: "读取老人年龄、慢病与过敏档案",
  get_medication_schedule: "读取当前用药与服药时间"
};

function elapsed(startedAt: number): number {
  const now =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  return Math.max(1, Math.round(now - startedAt));
}

export function planAgentTools(
  query: string,
  hasMedicationContext = false
): AgentToolName[] {
  const catalogMatch = findBestMedicine(query);
  const needsMedicationKnowledge =
    hasMedicationContext ||
    Boolean(catalogMatch && catalogMatch.score >= 0.4) ||
    /(药|片|胶囊|颗粒|怎么吃|服用|剂量|同服|相互作用|副作用|漏服|价格)/.test(
      query
    );
  const needsSchedule =
    hasMedicationContext ||
    /(几点|什么时候|今天|今日|漏服|吃了吗|服药时间)/.test(query);
  return [
    "get_elder_profile_context",
    ...(needsMedicationKnowledge
      ? (["lookup_drug_catalog", "check_safety_rules"] as const)
      : (["check_safety_rules"] as const)),
    ...(needsSchedule
      ? (["get_medication_schedule"] as const)
      : [])
  ];
}

export function executeAgentTool(
  name: AgentToolName,
  context: ToolContext
): AgentToolRun {
  const startedAt =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  const activeMedications = context.medications.filter(
    (medication) => medication.status === "active"
  );

  if (name === "lookup_drug_catalog") {
    const match = findBestMedicine(context.query);
    const response = answerFromDrugCatalog(
      context.query,
      context.profile,
      activeMedications.map((medication) => medication.name),
      currentCatalogCompanionSlugs(
        activeMedications.map(
          (medication) => medication.genericName || medication.name
        )
      ),
      context.answerMode
    );
    return {
      name,
      label: toolLabels[name],
      summary: match
        ? `命中${match.medicine.displayName}的${match.matchedField}，相关度 ${Math.round(match.score * 100)}%`
        : "未匹配到明确药品条目，保留安全规则判断",
      durationMs: elapsed(startedAt),
      result: { match, response }
    };
  }

  if (name === "check_safety_rules") {
    const response = answerWithRules(
      context.query,
      activeMedications,
      context.profile,
      { answerMode: context.answerMode }
    );
    return {
      name,
      label: toolLabels[name],
      summary: `完成${response.riskCheck.level}级安全核对`,
      durationMs: elapsed(startedAt),
      result: response
    };
  }

  if (name === "get_elder_profile_context") {
    const factors = [
      context.profile.age > 0 ? `${context.profile.age}岁` : "",
      ...context.profile.conditions,
      ...context.profile.allergies.map((item) => `过敏：${item}`)
    ].filter(Boolean);
    return {
      name,
      label: toolLabels[name],
      summary: factors.length
        ? `已读取${factors.length}项个人风险因素`
        : "个人档案尚不完整，回答保持保守",
      durationMs: elapsed(startedAt),
      result: {
        age: context.profile.age,
        conditions: context.profile.conditions,
        allergies: context.profile.allergies
      }
    };
  }

  const schedule = activeMedications
    .flatMap((medication) =>
      medication.times.map((time) => ({
        time,
        name: medication.name,
        dosage: medication.dosage,
        reminderEnabled: medication.reminderEnabled
      }))
    )
    .sort((left, right) => left.time.localeCompare(right.time));
  return {
    name,
    label: toolLabels[name],
    summary: schedule.length
      ? `读取到${activeMedications.length}种药物、${schedule.length}个服药时间`
      : "当前没有在用的服药日程",
    durationMs: elapsed(startedAt),
    result: schedule
  };
}

export function runAgentPlan(
  tools: AgentToolName[],
  context: ToolContext
): AgentToolRun[] {
  return tools.map((name) => executeAgentTool(name, context));
}

export function safetyResponseFromRuns(
  runs: AgentToolRun[]
): AssistantResponse | undefined {
  return runs.find((run) => run.name === "check_safety_rules")?.result as
    | AssistantResponse
    | undefined;
}

export function catalogResponseFromRuns(
  runs: AgentToolRun[]
): AssistantResponse | undefined {
  const result = runs.find((run) => run.name === "lookup_drug_catalog")
    ?.result as
    | { response?: AssistantResponse | null }
    | undefined;
  return result?.response ?? undefined;
}
