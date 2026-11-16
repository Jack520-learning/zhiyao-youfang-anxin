import { splitDosageText, validateDosageText } from "./dosage";

export type DoseSuggestionSource = "label" | "catalog" | "ai";

export interface DoseSuggestion {
  dosage: string;
  strength?: string;
  packageSpec?: string;
  source: DoseSuggestionSource;
  basis: string;
  confidence: number;
}

function extractDoseToken(text: string): string {
  const compact = text.replace(/\s+/g, "");
  const explicit =
    compact.match(
      /(?:每次|一次|单次)(?:服用|使用|舌下含服|口服|嚼服|吞服|含服)?(\d+(?:\.\d+)?(?:mg|毫克|g|克|ml|毫升|片|粒|袋|滴))/i
    )?.[1] ||
    compact.match(
      /(?:舌下含服|口服|嚼服|吞服|服用|使用)(?:约)?(\d+(?:\.\d+)?(?:mg|毫克|g|克|ml|毫升|片|粒|袋|滴))/i
    )?.[1] ||
    splitDosageText(compact).dosage.match(
      /\d+(?:\.\d+)?(?:mg|毫克|g|克|ml|毫升|片|粒|袋|滴)/i
    )?.[0] ||
    "";
  return explicit.replace(/\s+/g, "");
}

export function suggestDoseFromText(
  text: string,
  source: "label" | "catalog"
): DoseSuggestion | null {
  const dosage = extractDoseToken(text);
  if (!dosage || !validateDosageText(dosage).valid) return null;
  const details = splitDosageText(text);
  return {
    dosage,
    strength: details.strength || undefined,
    packageSpec: details.packageSpec || undefined,
    source,
    basis: source === "label" ? "根据包装或说明书文字提取" : "根据药品目录参考信息提取",
    confidence: source === "label" ? 0.86 : 0.72
  };
}

export async function requestDoseSuggestion(payload: {
  name: string;
  instructionText: string;
  strength: string;
  packageSpec: string;
}): Promise<DoseSuggestion | null> {
  const response = await fetch("/api/medication-dose-suggest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) return null;
  const result = (await response.json()) as {
    dosage?: string;
    strength?: string;
    packageSpec?: string;
    basis?: string;
    confidence?: number;
  };
  const dosage = String(result.dosage || "").trim();
  if (!dosage || !validateDosageText(dosage).valid) return null;
  const confidence = Number(result.confidence || 0);
  if (!Number.isFinite(confidence) || confidence < 0.7) return null;
  return {
    dosage,
    strength: String(result.strength || "").trim() || undefined,
    packageSpec: String(result.packageSpec || "").trim() || undefined,
    source: "ai",
    basis: String(result.basis || "根据药名、规格和可见标签自动补充").slice(
      0,
      160
    ),
    confidence: Math.min(confidence, 1)
  };
}
