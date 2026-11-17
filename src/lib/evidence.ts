import { findBestMedicine } from "../catalog/retrieval";
import type { IntakeDraft } from "../types";

export type EvidenceMergeResult = {
  draft: IntakeDraft;
  mergedFields: string[];
  rejectedReason?: string;
};

type TextField =
  | "name"
  | "genericName"
  | "ingredientsText"
  | "dosage"
  | "strength"
  | "packageSpec"
  | "frequency"
  | "relation"
  | "instructions"
  | "price";

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[（(].*?[）)]/g, "")
    .replace(/[\s，。,.、·:：;；\-_/]/g, "");
}

function sameMedicine(currentName: string, evidenceName: string): boolean {
  const current = normalize(currentName);
  const evidence = normalize(evidenceName);
  if (!current || !evidence) return true;
  if (current.includes(evidence) || evidence.includes(current)) return true;
  const currentMatch = findBestMedicine(currentName);
  const evidenceMatch = findBestMedicine(evidenceName);
  return Boolean(
    currentMatch &&
      evidenceMatch &&
      currentMatch.score >= 0.56 &&
      evidenceMatch.score >= 0.56 &&
      currentMatch.medicine.slug === evidenceMatch.medicine.slug
  );
}

function hasExplicitFrequency(text: string): boolean {
  return /(每日|每天|一日|1日).*[一二三四1234两].*次|每日[一二两].*次/.test(
    text.replace(/\s+/g, "")
  );
}

function hasExplicitRelation(text: string): boolean {
  return /(饭前|饭后|餐前|餐后|随餐|睡前)/.test(text);
}

export function mergeMedicationEvidence(
  current: IntakeDraft,
  evidence: IntakeDraft
): EvidenceMergeResult {
  if (
    current.name.trim() &&
    evidence.name.trim() &&
    !sameMedicine(current.name, evidence.name)
  ) {
    return {
      draft: current,
      mergedFields: [],
      rejectedReason: `补拍照片识别到“${evidence.name}”，与当前药物“${current.name}”不一致，未自动合并。`
    };
  }

  const lowConfidence = new Set(current.lowConfidenceFields);
  const evidenceLowConfidence = new Set(evidence.lowConfidenceFields);
  const mergedFields: string[] = [];
  const next: IntakeDraft = {
    ...current,
    rawText: [current.rawText, evidence.rawText]
      .filter(Boolean)
      .join("\n")
  };

  function mergeField(field: TextField, evidenceValue: string | undefined) {
    const value = String(evidenceValue || "").trim();
    const currentValue = String(next[field] || "").trim();
    if (!value) return;
    if (currentValue && !lowConfidence.has(field)) return;
    (next[field] as string | undefined) = value;
    if (!evidenceLowConfidence.has(field)) {
      lowConfidence.delete(field);
    }
    mergedFields.push(field);
  }

  mergeField("name", evidence.name);
  mergeField("genericName", evidence.genericName);
  mergeField("ingredientsText", evidence.ingredientsText);
  mergeField("dosage", evidence.dosage);
  mergeField("strength", evidence.strength);
  mergeField("packageSpec", evidence.packageSpec);
  if (hasExplicitFrequency(`${evidence.rawText}\n${evidence.instructions}`)) {
    mergeField("frequency", evidence.frequency);
  }
  if (hasExplicitRelation(`${evidence.rawText}\n${evidence.instructions}`)) {
    mergeField("relation", evidence.relation);
  }
  mergeField("instructions", evidence.instructions);
  mergeField("price", evidence.price);

  if (
    evidence.dosage &&
    mergedFields.includes("dosage") &&
    !next.dosageSource
  ) {
    next.dosageSource = evidence.dosageSource || "label";
    next.dosageBasis =
      evidence.dosageBasis || "补充照片中识别到的单次用量";
  }
  if (
    (!next.times.length || next.times.join(",") === "08:00") &&
    evidence.times.length
  ) {
    next.times = evidence.times;
  }
  next.confidence = Math.max(current.confidence, evidence.confidence);
  for (const field of evidence.lowConfidenceFields) {
    lowConfidence.add(field);
  }
  next.lowConfidenceFields = Array.from(lowConfidence);
  if (!next.imageDataUrl && evidence.imageDataUrl) {
    next.imageDataUrl = evidence.imageDataUrl;
  }

  return { draft: next, mergedFields };
}
