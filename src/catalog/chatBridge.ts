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
  currentMedicineNames: string[]
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
    companionSlugs: companions,
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
      ...(companions.length ? [`同服核查已包含 ${companions.length} 种药品`] : []),
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

