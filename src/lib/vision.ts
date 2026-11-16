import { findBestMedicine } from "../catalog/retrieval";
import { isAsNeededFrequency } from "./dosage";
import type { IntakeDraft } from "../types";

export interface VisionMedicine {
  position?: string;
  name?: string;
  genericName?: string;
  activeIngredient?: string;
  dosage?: string;
  price?: string;
  dosageForm?: string;
  strength?: string;
  frequency?: string;
  relation?: string;
  instructions?: string;
  confidence?: number;
  visibleFeatures?: string[];
}

export interface VisionIdentification {
  isMedicine?: boolean | null;
  rejectionReason?: string;
  candidates?: Array<{
    name?: string;
    confidence?: number;
    visibleFeatures?: string[];
  }>;
  medicines?: VisionMedicine[];
  medicine?: VisionMedicine;
  summary?: string;
  cautions?: string[];
  error?: string;
}

function cleanName(value?: string): string {
  return String(value || "").trim();
}

export function getVisionMedicines(
  vision: VisionIdentification | null | undefined
): VisionMedicine[] {
  const source =
    vision?.medicines?.length
      ? vision.medicines
      : vision?.medicine
        ? [vision.medicine]
        : (vision?.candidates || []).map((candidate) => ({
            name: candidate.name,
            confidence: candidate.confidence,
            visibleFeatures: candidate.visibleFeatures
          }));
  const seen = new Set<string>();
  return source.filter((item) => {
    const name = cleanName(item.name);
    const key = name.replace(/\s+/g, "").toLowerCase();
    if (!name || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildDraftsFromVision(
  imageDataUrl: string,
  fallbackDraft: IntakeDraft,
  vision: VisionIdentification | null | undefined
): IntakeDraft[] {
  const items = getVisionMedicines(vision);
  if (!items.length) return [fallbackDraft];
  const multiple = items.length > 1;

  return items.map((item, index) => {
    const name = cleanName(item.name);
    const catalogMatch = findBestMedicine(name);
    const medicine =
      catalogMatch && catalogMatch.score >= 0.58
        ? catalogMatch.medicine
        : undefined;
    const dosage = cleanName(
      item.dosage ||
        item.strength ||
        medicine?.strength ||
        (!multiple ? fallbackDraft.dosage : "")
    );
    const frequency = cleanName(
      item.frequency ||
        (!multiple ? fallbackDraft.frequency : "") ||
        "每日 1 次"
    );
    const relation = cleanName(
      item.relation ||
        (!multiple ? fallbackDraft.relation : "") ||
        (medicine && /餐后|饭后|随餐/.test(medicine.timing)
          ? /随餐/.test(medicine.timing)
            ? "随餐"
            : "饭后"
          : "按说明书")
    );
    const ingredients = cleanName(
      item.activeIngredient ||
        medicine?.activeIngredient ||
        (!multiple ? fallbackDraft.ingredientsText : "")
    );
    const confidence = Math.max(
      index === 0 ? fallbackDraft.confidence : 0,
      item.confidence || 0,
      medicine ? 0.82 : 0
    );
    const lowConfidenceFields = [
      !name ? "name" : "",
      !dosage ? "dosage" : "",
      !item.frequency && multiple ? "frequency" : "",
      !relation ? "relation" : "",
      !ingredients ? "ingredientsText" : ""
    ].filter(Boolean);
    return {
      imageDataUrl,
      rawText: fallbackDraft.rawText,
      name,
      genericName: cleanName(
        item.genericName ||
          medicine?.activeIngredient ||
          (!multiple ? fallbackDraft.genericName : "")
      ),
      ingredientsText: ingredients,
      dosage,
      frequency,
      times:
        isAsNeededFrequency(frequency)
          ? []
          : !multiple && fallbackDraft.times.length
            ? fallbackDraft.times
            : ["08:00"],
      relation,
      instructions:
        cleanName(item.instructions) ||
        medicine?.howToTake ||
        (!multiple ? fallbackDraft.instructions : ""),
      price:
        cleanName(item.price) ||
        (!multiple ? fallbackDraft.price : ""),
      confidence,
      lowConfidenceFields,
      createdAt: fallbackDraft.createdAt
    };
  });
}
