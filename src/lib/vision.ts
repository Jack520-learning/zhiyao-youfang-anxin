import {
  findBestMedicine,
  findCatalogMedicineForRecognition
} from "../catalog/retrieval";
import { isAsNeededFrequency, splitDosageText } from "./dosage";
import { suggestDoseFromText } from "./doseAutofill";
import type { IntakeDraft } from "../types";

export interface VisionMedicine {
  position?: string;
  name?: string;
  genericName?: string;
  activeIngredient?: string;
  singleDose?: string;
  dosage?: string;
  price?: string;
  dosageForm?: string;
  strength?: string;
  packageSpec?: string;
  frequency?: string;
  relation?: string;
  instructions?: string;
  labelText?: string;
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

function nameKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[（(].*?[）)]/g, "")
    .replace(/[，。,.、·:：;；\s\-_/]/g, "");
}

function normalizeExplicitSingleDose(value?: string): string {
  const dose = cleanName(value);
  if (!dose) return "";
  const explicit = dose.match(
    /(?:每次|一次)(?:服用|使用|吃|口服)?(\d+(?:\.\d+)?(?:mg|毫克|g|克|ml|毫升|片|粒|袋|滴))/i
  );
  if (explicit?.[1]) return explicit[1].replace(/\s+/g, "");
  if (/^\d+(?:\.\d+)?(?:片|粒|袋|滴)$/.test(dose)) {
    return dose.replace(/\s+/g, "");
  }
  if (/^\d+(?:\.\d+)?(?:mg|毫克|g|克|ml|毫升)\s*\/\s*次$/i.test(dose)) {
    return dose.replace(/\s+/g, "").replace(/\/次$/, "");
  }
  return "";
}

export async function requestVisionIdentification(
  imageDataUrl: string,
  mode: "medicine" | "herb" = "medicine",
  timeoutMs = 50000
): Promise<VisionIdentification> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("/api/vision-identify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ imageDataUrl, mode })
    });
    const payload = (await response.json().catch(() => ({}))) as
      | VisionIdentification
      | { error?: string };
    if (!response.ok) {
      throw new Error(
        ("error" in payload && payload.error) ||
          `智能识图服务返回 ${response.status}`
      );
    }
    return payload as VisionIdentification;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("智能识图等待超时，请补拍药名和规格更清晰的照片。");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function getVisionMedicines(
  vision: VisionIdentification | null | undefined
): VisionMedicine[] {
  const detailed = vision?.medicines?.length
    ? vision.medicines
    : vision?.medicine
      ? [vision.medicine]
      : [];
  const source = [
    ...detailed,
    ...(vision?.candidates || []).map((candidate) => ({
      name: candidate.name,
      confidence: candidate.confidence,
      visibleFeatures: candidate.visibleFeatures
    }))
  ];
  const seen = new Set<string>();
  return source.filter((item) => {
    const name = cleanName(item.name);
    const key = nameKey(name);
    if (!name || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getVisionMedicineNames(
  vision: VisionIdentification | null | undefined
): string[] {
  return getVisionMedicines(vision)
    .map((item) => cleanName(item.name))
    .filter(Boolean);
}

export function hasMedicineEvidence(
  vision: VisionIdentification | null | undefined,
  rawText = ""
): boolean {
  if (getVisionMedicines(vision).length > 0) return true;
  if (vision?.isMedicine === true) return true;
  const compact = rawText.replace(/\s+/g, "");
  return (
    /(国药准字|批准文号|药品名称|说明书|处方笺|片剂|胶囊|颗粒|口服液|滴丸|软膏|乳膏|滴眼液|注射液|mg|毫克|ml)/i.test(
      compact
    ) ||
    /[\u3400-\u9fff]{2,}(?:片|胶囊|颗粒|散|膏|液|丸|栓|贴)/.test(compact)
  );
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
    const recognizedName = cleanName(item.name);
    const medicine = findCatalogMedicineForRecognition(recognizedName) ?? undefined;
    const name =
      medicine && recognizedName ? medicine.displayName : recognizedName;
    const rawDosage = normalizeExplicitSingleDose(
      item.singleDose ||
        item.dosage ||
        (!multiple ? fallbackDraft.dosage : "")
    );
    const dosageDetails = splitDosageText(rawDosage);
    const visibleSpecification = splitDosageText(
      cleanName(item.strength) || cleanName(item.dosage)
    );
    const labelDose = suggestDoseFromText(
      `${item.instructions || ""} ${!multiple ? fallbackDraft.instructions : ""}`,
      "label"
    );
    const catalogDose = medicine
      ? suggestDoseFromText(medicine.howToTake, "catalog")
      : null;
    const suggestedDose = labelDose || catalogDose;
    const dosage = dosageDetails.dosage || suggestedDose?.dosage || "";
    const strength = cleanName(
      item.strength ||
        dosageDetails.strength ||
        visibleSpecification.strength ||
        medicine?.strength
    );
    const packageSpec = cleanName(
      item.packageSpec ||
        dosageDetails.packageSpec ||
        visibleSpecification.packageSpec
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
      medicine ? 0.72 : 0
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
      strength,
      packageSpec,
      dosageSource: dosage
        ? dosageDetails.dosage
          ? "label"
          : suggestedDose?.source
        : undefined,
      dosageBasis: dosage
        ? dosageDetails.dosage
          ? "包装或说明书明确写出的单次用量"
          : suggestedDose?.basis
        : undefined,
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
        cleanName(item.labelText) ||
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
