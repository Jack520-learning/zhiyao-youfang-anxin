import { describe, expect, it } from "vitest";
import {
  extractRecognizedMedicineNames,
  hasMedicineTextEvidence,
  parseRecognitionText
} from "./ocr";

describe("medicine OCR parsing", () => {
  const noisyLabel = [
    "未 磺 酸 氨 握 地 平 片",
    "5mg x 28 片",
    "国药 准 字 H20000001",
    "阿 托 伐 他 汀 钙 片",
    "20mg x 7 片",
    "盐酸 二 甲 双 股 片"
  ].join("\n");

  it("corrects common OCR character errors through the local catalog", () => {
    const names = extractRecognizedMedicineNames(noisyLabel);
    expect(names).toContain("苯磺酸氨氯地平片");
    expect(names).toContain("阿托伐他汀钙片");
    expect(names).toContain("盐酸二甲双胍片");
  });

  it("corrects the degraded characters produced by the enhanced OCR pass", () => {
    const names = extractRecognizedMedicineNames(
      "未磺酸握所地平户\n盐酸二甲双遥卢"
    );
    expect(names).toEqual([
      "苯磺酸氨氯地平片",
      "盐酸二甲双胍片"
    ]);
  });

  it("does not treat package quantity or tablet strength as a single dose", () => {
    const draft = parseRecognitionText(
      "data:image/jpeg;base64,test",
      "苯磺酸氨氯地平片\n5mg×28片",
      91
    );
    expect(draft.name).toBe("苯磺酸氨氯地平片");
    expect(draft.dosage).toBe("");
    expect(draft.strength).toBe("5mg");
    expect(draft.packageSpec).toBe("28片");
  });

  it("keeps an explicit per-dose instruction", () => {
    const draft = parseRecognitionText(
      "data:image/jpeg;base64,test",
      "阿托伐他汀钙片\n用法用量：每次1片，每日一次",
      88
    );
    expect(draft.dosage).toBe("1片");
    expect(draft.frequency).toBe("每日 1 次");
  });

  it("accepts a readable medicine name even when the word 片剂 is absent", () => {
    expect(hasMedicineTextEvidence("苯磺酸氨氯地平片")).toBe(true);
    expect(hasMedicineTextEvidence("这是桌上的杯子")).toBe(false);
  });
});
