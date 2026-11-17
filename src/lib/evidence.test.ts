import { describe, expect, it } from "vitest";
import { createManualDraft } from "./ocr";
import { mergeMedicationEvidence } from "./evidence";
import type { IntakeDraft } from "../types";

function draft(patch: Partial<IntakeDraft> = {}): IntakeDraft {
  return {
    ...createManualDraft("data:image/jpeg;base64,primary"),
    name: "硝酸甘油片",
    genericName: "硝酸甘油",
    ingredientsText: "硝酸甘油",
    dosage: "",
    frequency: "",
    relation: "",
    instructions: "",
    createdAt: "2026-11-17T00:00:00.000Z",
    ...patch
  };
}

describe("medication evidence merging", () => {
  it("fills missing dosage, timing and instruction text from a package insert", () => {
    const result = mergeMedicationEvidence(
      draft(),
      draft({
        name: "硝酸甘油片",
        rawText: "用法用量：每次0.5mg，舌下含服。",
        dosage: "0.5mg",
        instructions: "一次0.5mg，舌下含服。",
        confidence: 0.9
      })
    );
    expect(result.rejectedReason).toBeUndefined();
    expect(result.draft.dosage).toBe("0.5mg");
    expect(result.draft.instructions).toContain("舌下含服");
    expect(result.mergedFields).toContain("dosage");
  });

  it("does not overwrite a field the user already confirmed", () => {
    const result = mergeMedicationEvidence(
      draft({ dosage: "1片", lowConfidenceFields: [] }),
      draft({ dosage: "2片", lowConfidenceFields: [] })
    );
    expect(result.draft.dosage).toBe("1片");
  });

  it("rejects evidence for a different medicine", () => {
    const result = mergeMedicationEvidence(
      draft(),
      draft({
        name: "阿司匹林肠溶片",
        genericName: "阿司匹林",
        ingredientsText: "阿司匹林",
        dosage: "1片"
      })
    );
    expect(result.mergedFields).toEqual([]);
    expect(result.rejectedReason).toContain("不一致");
  });

  it("does not accept a default frequency without explicit evidence text", () => {
    const result = mergeMedicationEvidence(
      draft({ frequency: "" }),
      draft({ frequency: "每日 1 次", rawText: "硝酸甘油片 0.5mg" })
    );
    expect(result.draft.frequency).toBe("");
  });
});
