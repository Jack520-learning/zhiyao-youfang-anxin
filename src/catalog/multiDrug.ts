import { findInteractions } from "./interactions";
import { findBestMedicine } from "./retrieval";
import { searchHerbs, type HerbEntry } from "./herbs";
import { findSupplement, type SupplementEntry } from "./supplements";
import type { Medicine } from "./types";

export type InputKind = "medicine" | "herb" | "supplement" | "unknown";

export interface ReconciledEntry {
  rawName: string;
  kind: InputKind;
  label: string;
  detail: string;
  medicine?: Medicine;
  herb?: HerbEntry;
  supplement?: SupplementEntry;
  confidence: number;
}

export interface ReconciliationWarning {
  level: "high" | "medium" | "low";
  title: string;
  detail: string;
  action: string;
}

export interface ReconciliationResult {
  entries: ReconciledEntry[];
  warnings: ReconciliationWarning[];
  spacing: string[];
  unresolved: string[];
}

export function reconcileEntry(name: string): ReconciledEntry {
  const clean = name.trim();
  const medicineMatch = findBestMedicine(clean);
  if (medicineMatch && medicineMatch.score >= 0.58) {
    return {
      rawName: clean,
      kind: "medicine",
      label: medicineMatch.medicine.displayName,
      detail: `${medicineMatch.medicine.activeIngredient} · ${medicineMatch.medicine.dosageForm} · ${medicineMatch.medicine.category}`,
      medicine: medicineMatch.medicine,
      confidence: medicineMatch.score
    };
  }
  const herb = searchHerbs(clean)[0];
  if (herb && clean.length >= 2) {
    return {
      rawName: clean,
      kind: "herb",
      label: herb.name,
      detail: `${herb.nature} · ${herb.flavor} · ${herb.functions.join("、")}`,
      herb,
      confidence: 0.82
    };
  }
  const supplement = findSupplement(clean);
  if (supplement) {
    return {
      rawName: clean,
      kind: "supplement",
      label: supplement.name,
      detail: `${supplement.kind} · 需要纳入对账`,
      supplement,
      confidence: 0.86
    };
  }
  return {
    rawName: clean,
    kind: "unknown",
    label: clean,
        detail: "当前知识库未完全匹配",
    confidence: 0
  };
}

export function reconcileMedicationList(names: string[]): ReconciliationResult {
  const entries = names
    .map((name) => name.trim())
    .filter(Boolean)
    .filter((name, index, list) => list.indexOf(name) === index)
    .map(reconcileEntry);
  const medicines = entries
    .map((entry) => entry.medicine)
    .filter((item): item is Medicine => Boolean(item));
  const warnings: ReconciliationWarning[] = [];

  const ingredientGroups = new Map<string, ReconciledEntry[]>();
  const categoryGroups = new Map<string, ReconciledEntry[]>();
  for (const entry of entries) {
    if (!entry.medicine) continue;
    const ingredient = entry.medicine.activeIngredient;
    const category = entry.medicine.category;
    ingredientGroups.set(ingredient, [
      ...(ingredientGroups.get(ingredient) ?? []),
      entry
    ]);
    categoryGroups.set(category, [
      ...(categoryGroups.get(category) ?? []),
      entry
    ]);
  }
  for (const [ingredient, group] of ingredientGroups) {
    if (new Set(group.map((item) => item.medicine?.slug)).size > 1) {
      warnings.push({
        level: "high",
        title: `相同成分重复：${ingredient}`,
        detail: group.map((item) => item.label).join("、"),
        action: "不要同时服用这些含相同成分的制剂，先让医生或药师核对总剂量。"
      });
    }
  }
  for (const [category, group] of categoryGroups) {
    if (group.length > 1) {
      warnings.push({
        level: "medium",
        title: `同类药重复需要核对：${category}`,
        detail: group.map((item) => item.label).join("、"),
        action: "同类药不一定都需要停用，但必须由医生或药师核对适应证、剂量和疗程。"
      });
    }
  }

  for (const interaction of findInteractions(medicines.map((item) => item.slug))) {
    warnings.push({
      level: interaction.severity === "high" ? "high" : "medium",
      title: interaction.title,
      detail: `${interaction.medicineNames.join(" + ")}。${interaction.explanation}`,
      action: interaction.action
    });
  }

  const spacing: string[] = [];
  if (medicines.some((item) => item.slug === "montmorillonite") && medicines.length > 1) {
    spacing.push("蒙脱石散与其他口服药至少间隔 2 小时，具体以说明书或医嘱为准。");
  }
  if (entries.some((entry) => entry.supplement?.id === "calcium")) {
    spacing.push("钙片与部分口服抗菌药可能需要错开服用，请让药师按具体药物确认。");
  }
  if (entries.some((entry) => entry.supplement?.id === "iron")) {
    spacing.push("铁剂与部分口服药可能需要错开服用，请按说明书或咨询药师。");
  }

  const highRiskTerms = medicines.some((item) =>
    /华法林|阿司匹林|氯吡格雷/.test(
      `${item.displayName}${item.activeIngredient}`
    )
  );
  const riskyHerbs = entries.filter(
    (entry) =>
      entry.herb &&
      /三七|丹参|当归|人参/.test(entry.herb.name)
  );
  if (riskyHerbs.length && highRiskTerms) {
    warnings.push({
      level: "high",
      title: "活血类中药与抗凝/抗血小板药同时出现",
      detail: riskyHerbs.map((entry) => entry.label).join("、"),
      action: "不要自行同服。请把中药、处方药和剂量全部交给医生或药师评估出血风险。"
    });
  }

  for (const entry of entries) {
    if (!entry.supplement) continue;
    const affected = medicines.find((medicine) =>
      entry.supplement!.affectedMedicationTerms.some((term) =>
        `${medicine.displayName}${medicine.activeIngredient}`.includes(term)
      )
    );
    if (affected) {
      warnings.push({
        level: entry.supplement.id === "st-johns-wort" ? "high" : "medium",
        title: `${entry.supplement.name}与${affected.displayName}需要核对`,
        detail: entry.supplement.caution,
        action: "不要自行叠加，先向医生或药师提供两种产品的完整包装和成分。"
      });
    }
  }

  const uniqueWarnings = warnings.filter(
    (item, index, list) =>
      list.findIndex(
        (other) => other.title === item.title && other.detail === item.detail
      ) === index
  );
  const severity = { high: 0, medium: 1, low: 2 };
  uniqueWarnings.sort((left, right) => severity[left.level] - severity[right.level]);

  return {
    entries,
    warnings: uniqueWarnings,
    spacing,
    unresolved: entries
      .filter((entry) => entry.kind === "unknown")
      .map((entry) => entry.rawName)
  };
}
