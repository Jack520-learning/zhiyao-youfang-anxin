import type { RiskCheck, RiskLevel } from "../types";
import type { AssistantResponse } from "../types";
import { buildLocalGuidance } from "./guidance";
import { medicines } from "./medicines";
import { findBestMedicine } from "./retrieval";
import type { HealthContext, Medicine } from "./types";

function normalize(value: string): string {
  return value.toLowerCase().replace(/[\s，。,.、:：;；()（）/-]/g, "");
}

function riskLevelForSeverity(severity?: "high" | "caution" | "info"): RiskLevel {
  if (severity === "high") return "high";
  if (severity === "caution") return "medium";
  return "low";
}

export function answerFromDrugCatalog(
  query: string,
  profile: { age: number; conditions: string[] },
  currentMedicineNames: string[],
  currentCompanionSlugs: string[] = []
): AssistantResponse | null {
  const primary = findBestMedicine(query)?.medicine;
  if (!primary) return null;

  const normalized = normalize(query);
  const companions = medicines
    .filter((medicine) => medicine.slug !== primary.slug)
    .filter((medicine) => medicine.activeIngredient !== primary.activeIngredient)
    .filter((medicine) =>
      [medicine.displayName, medicine.activeIngredient, ...medicine.aliases]
        .map(normalize)
        .some((term) => normalized.includes(term))
    )
    .slice(0, 4)
    .map((medicine) => medicine.slug);
  const allCompanions = [...new Set([...companions, ...currentCompanionSlugs])]
    .filter((slug) => slug !== primary.slug)
    .slice(0, 4);
  const contexts: HealthContext[] = [
    ...(profile.age >= 65 ? (["older"] as const) : []),
    ...(profile.conditions.some((item) => /肾/.test(item))
      ? (["kidney"] as const)
      : []),
    ...(profile.conditions.some((item) => /肝/.test(item))
      ? (["liver"] as const)
      : [])
  ];
  const guidance = buildLocalGuidance({
    medicineSlug: primary.slug,
    companionSlugs: allCompanions,
    healthContext: contexts,
    question: query
  });
  if (!guidance) return null;

  const firstInteraction = guidance.interactions[0];
  const level = riskLevelForSeverity(firstInteraction?.severity);
  const check: RiskCheck = {
    id: `catalog-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    level,
    title:
      level === "high"
        ? "药品百科发现高风险联合用药"
        : guidance.headline,
    summary: guidance.questionAnswer || guidance.plainSummary,
    nextStep:
      firstInteraction?.action ||
      "请以手中批准说明书、处方和医生或药师意见为准。",
    reasons: [
      `已匹配：${primary.displayName}`,
      ...(allCompanions.length ? [`同服核查已包含 ${allCompanions.length} 种药品`] : []),
      `知识版本：${primary.knowledgeVersion}（待专业复核）`
    ],
    sourceIds: ["src-drug-catalog"],
    involvedMedicationIds: [],
    medicationSnapshot: [...currentMedicineNames, primary.displayName],
    createdAt: new Date().toISOString()
  };

  return {
    message: `${guidance.questionAnswer || guidance.plainSummary}\n\n${check.nextStep}`,
    riskCheck: check,
    stages: [
      { id: "match", label: `匹配药品百科：${primary.displayName}`, status: "done" },
      { id: "interaction", label: "核对同服药物与特殊人群", status: "done" },
      { id: "answer", label: "生成差异化解答", status: "done" }
    ],
    mode: "rules"
  };
}

export function buildAutomaticMedicineReport(
  medicine: Medicine,
  guidance: NonNullable<ReturnType<typeof buildLocalGuidance>>
): string {
  const interactionLines = guidance.interactions.length
    ? guidance.interactions.map(
        (item) => `${item.title}：${item.action}`
      )
    : ["当前知识库未命中已知同服风险，但不代表绝对安全。"];

  return [
    `识别结果：${medicine.displayName}`,
    `主要成分：${medicine.activeIngredient}`,
    `剂型与常见规格：${medicine.dosageForm}，${medicine.strength}`,
    "",
    "【使用方法】",
    medicine.howToTake,
    `每日上限：${medicine.maxDaily}`,
    `服用时机：${medicine.timing}`,
    `饮食注意：${medicine.food}`,
    "",
    "【危害与常见不适】",
    ...medicine.sideEffects.map((item) => `· ${item}`),
    ...medicine.keyWarnings.map((item) => `· ${item}`),
    "",
    "【特殊人群】",
    `老年人：${medicine.specialGroups.older}`,
    `孕期/哺乳：${medicine.specialGroups.pregnancy}`,
    `肾脏疾病：${medicine.specialGroups.kidney}`,
    `肝脏疾病：${medicine.specialGroups.liver}`,
    "",
    "【当前用药同服核对】",
    ...interactionLines.map((item) => `· ${item}`),
    "",
    "【仍需以实物确认】",
    "· 图片无法替代包装上的批准文号和完整说明书。",
    "· 当前知识卡是常见参考，不能据此自行改变医生处方剂量或疗程。",
    "· 如包装信息与页面不一致，以手中批准说明书和医生意见为准。",
    "",
    `资料来源：${medicine.sourceTitle}（${medicine.knowledgeVersion}，待专业复核）`
  ].join("\n");
}

export function currentCatalogCompanionSlugs(medicineNames: string[]): string[] {
  return [
    ...new Set(
      medicineNames
        .map((name) => findBestMedicine(name)?.medicine.slug)
        .filter((slug): slug is string => Boolean(slug))
    )
  ];
}

