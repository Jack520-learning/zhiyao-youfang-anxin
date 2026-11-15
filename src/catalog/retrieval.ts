import { medicines } from "./medicines";
import { detectDosageForm, type DosageFormKey } from "./forms";
import type { Medicine } from "./types";

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[（(].*?[）)]/g, "")
    .replace(/[，。,.、·:：;；\s\-_/]/g, "")
    .replace(/(片|胶囊|颗粒|口服液|肠溶片|缓释胶囊|散|说明书|药盒)/g, "");
}

function bigrams(value: string): Set<string> {
  if (value.length < 2) return new Set(value ? [value] : []);
  const result = new Set<string>();
  for (let index = 0; index < value.length - 1; index += 1) {
    result.add(value.slice(index, index + 2));
  }
  return result;
}

function overlapScore(query: string, candidate: string): number {
  const queryGrams = bigrams(query);
  const candidateGrams = bigrams(candidate);
  if (!queryGrams.size || !candidateGrams.size) return 0;
  let overlap = 0;
  for (const gram of queryGrams) {
    if (candidateGrams.has(gram)) overlap += 1;
  }
  return overlap / Math.max(queryGrams.size, candidateGrams.size);
}

export type MedicineMatch = {
  medicine: Medicine;
  score: number;
  matchedAlias: string;
  matchedField:
    | "药名"
    | "通用名/成分"
    | "别名"
    | "剂型"
    | "分类"
    | "警示说明";
};

export function matchMedicines(query: string, limit = 8): MedicineMatch[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) {
    return medicines.slice(0, limit).map((medicine) => ({
      medicine,
      score: 1,
      matchedAlias: medicine.displayName,
      matchedField: "药名",
    }));
  }

  return medicines
    .map((medicine) => {
      const candidates: Array<{
        value: string;
        field: MedicineMatch["matchedField"];
        weight: number;
      }> = [
        { value: medicine.displayName, field: "药名", weight: 1.18 },
        {
          value: medicine.activeIngredient,
          field: "通用名/成分",
          weight: 1.14
        },
        ...medicine.aliases.map((alias) => ({
          value: alias,
          field: "别名" as const,
          weight: 1.06
        })),
        { value: medicine.dosageForm, field: "剂型", weight: 0.72 },
        { value: medicine.category, field: "分类", weight: 0.56 },
        {
          value: [...medicine.keyWarnings, medicine.timing, medicine.food].join(
            " "
          ),
          field: "警示说明",
          weight: 0.48
        }
      ];
      let bestScore = 0;
      let matchedAlias = medicine.displayName;
      let matchedField: MedicineMatch["matchedField"] = "药名";

      for (const candidate of candidates) {
        const normalizedCandidate = normalize(candidate.value);
        // Dosage-form-only aliases such as "缓释胶囊" normalize to an empty
        // string. Treating "" as a match would incorrectly match every query.
        if (normalizedCandidate.length < 2) continue;
        let score = overlapScore(normalizedQuery, normalizedCandidate);
        if (normalizedCandidate === normalizedQuery) score = 1;
        else if (
          normalizedCandidate.includes(normalizedQuery) ||
          normalizedQuery.includes(normalizedCandidate)
        ) {
          score = Math.max(score, 0.92);
        }
        const weightedScore =
          score * candidate.weight +
          (candidate.field === "警示说明" ? score * 0.08 : 0);
        if (weightedScore > bestScore) {
          bestScore = weightedScore;
          matchedAlias = candidate.value;
          matchedField = candidate.field;
        }
      }

      const requestedForm = detectDosageForm(query);
      const medicineForm = detectDosageForm(medicine.dosageForm);
      if (requestedForm && medicineForm) {
        if (medicineForm.key === requestedForm.key) {
          bestScore += 0.12;
        } else {
          bestScore -= 0.45;
        }
      }

      return {
        medicine,
        score: Math.min(1, bestScore),
        matchedAlias,
        matchedField
      };
    })
    .filter((item) => item.score >= 0.24)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export function findBestMedicine(query: string): MedicineMatch | null {
  const matches = matchMedicines(query, 1);
  return matches[0] ?? null;
}

export type IdentificationMatch = {
  medicine: Medicine | null;
  detectedForm: { key: DosageFormKey; label: string } | null;
  reason: "MATCHED" | "FORM_UNCERTAIN" | "FORM_UNSUPPORTED" | "UNRECOGNIZED";
  bestCandidate: Medicine | null;
};

export function findMedicineForIdentification(
  recognizedName: string,
  recognizedForm?: string | null,
): IdentificationMatch {
  const combinedFormText = `${recognizedName} ${recognizedForm ?? ""}`;
  const detectedForm = detectDosageForm(combinedFormText);
  const candidates = matchMedicines(recognizedName, 10);

  if (!candidates.length) {
    return {
      medicine: null,
      detectedForm,
      reason: "UNRECOGNIZED",
      bestCandidate: null,
    };
  }

  if (!detectedForm) {
    return {
      medicine: null,
      detectedForm: null,
      reason: "FORM_UNCERTAIN",
      bestCandidate: candidates[0].medicine,
    };
  }

  const compatible = candidates.find(({ medicine }) => {
    const medicineForm = detectDosageForm(medicine.dosageForm);
    return medicineForm?.key === detectedForm.key;
  });

  if (!compatible) {
    return {
      medicine: null,
      detectedForm,
      reason: "FORM_UNSUPPORTED",
      bestCandidate: candidates[0].medicine,
    };
  }

  return {
    medicine: compatible.medicine,
    detectedForm,
    reason: "MATCHED",
    bestCandidate: compatible.medicine,
  };
}
