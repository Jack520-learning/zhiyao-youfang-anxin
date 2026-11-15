import { describe, expect, it } from "vitest";
import { answerWithRules, checkNewMedication, handleMissedDose } from "./riskEngine";
import { createInitialState } from "../data/seed";
import type { Medication } from "../types";
import { nowIso } from "./time";

const state = createInitialState();

function medication(
  name: string,
  genericName: string,
  ingredients: string[]
): Medication {
  return {
    id: `med-${name}`,
    name,
    genericName,
    ingredients,
    dosage: "1 片",
    frequency: "每日 1 次",
    times: ["18:30"],
    relation: "晚饭后",
    instructions: "",
    startDate: "2026-11-14",
    status: "active",
    reminderEnabled: true,
    source: {
      type: "medicine-label",
      title: "测试说明书",
      capturedAt: nowIso(),
      confirmed: true
    },
    confidence: 1,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
}

const profile = {
  ...state.profile,
  age: 72,
  conditions: ["高血压"]
};
const amlodipine = medication(
  "苯磺酸氨氯地平片",
  "氨氯地平",
  ["氨氯地平"]
);
const aspirin = medication("阿司匹林肠溶片", "阿司匹林", ["阿司匹林"]);

describe("riskEngine", () => {
  it("starts with no default medication or health history", () => {
    expect(state.medications).toEqual([]);
    expect(state.profile.conditions).toEqual([]);
    expect(state.profile.allergies).toEqual([]);
    expect(state.profile.healthProfileCompleted).toBe(false);
  });

  it("blocks warfarin and aspirin as high risk", () => {
    const result = checkNewMedication(
      medication("华法林钠片", "华法林", ["华法林"]),
      [aspirin],
      profile
    );
    expect(result.level).toBe("high");
    expect(result.nextStep).toContain("不要自行停药");
  });

  it("never gives a make-up dose for warfarin", () => {
    const result = handleMissedDose(
      medication("华法林钠片", "华法林", ["华法林"]),
      [aspirin]
    );
    expect(result.level).toBe("high");
    expect(result.summary).not.toMatch(/补(服|吃).*片/);
    expect(result.nextStep).toContain("不要自行加倍");
  });

  it("returns emergency mode before drug analysis", () => {
    const result = answerWithRules(
      "我现在胸痛，喘不上气",
      [aspirin],
      profile
    );
    expect(result.riskCheck.level).toBe("emergency");
    expect(result.message).toContain("120");
  });

  it("detects duplicate ingredients as medium risk", () => {
    const result = checkNewMedication(
      medication("氨氯地平口腔崩解片", "氨氯地平", ["氨氯地平"]),
      [amlodipine],
      profile
    );
    expect(result.level).toBe("medium");
    expect(result.summary).toContain("重复成分");
  });

  it("does not claim a hypothetical pair is already in the current list", () => {
    const result = answerWithRules(
      "华法林和阿司匹林能一起吃吗",
      [],
      profile
    );
    expect(result.riskCheck.level).toBe("high");
    expect(result.message).not.toContain("您现在的清单里同时有");
  });

  it("answers different medications from their own confirmed records", () => {
    const amlodipineAnswer = answerWithRules(
      "苯磺酸氨氯地平片怎么吃",
      [amlodipine, aspirin],
      profile
    );
    const aspirinAnswer = answerWithRules(
      "阿司匹林怎么吃",
      [amlodipine, aspirin],
      profile
    );
    expect(amlodipineAnswer.message).toContain("苯磺酸氨氯地平片");
    expect(aspirinAnswer.message).toContain("阿司匹林肠溶片");
    expect(amlodipineAnswer.message).not.toBe(aspirinAnswer.message);
  });

  it("asks for a drug name instead of guessing from '这个药'", () => {
    const result = answerWithRules(
      "这个药怎么吃",
      [aspirin],
      profile
    );
    expect(result.riskCheck.level).toBe("unknown");
    expect(result.message).toContain("哪一种药");
  });

  it("does not give a confirmed risk result before OCR fields are checked", () => {
    const unchecked = medication("测试药片", "测试成分", ["测试成分"]);
    unchecked.source.confirmed = false;
    const result = checkNewMedication(
      unchecked,
      [aspirin],
      profile
    );
    expect(result.level).toBe("unknown");
    expect(result.title).toContain("人工核对");
  });

  it("can surface a preliminary high-risk interaction before final confirmation", () => {
    const unchecked = medication("华法林钠卢", "华法林", ["华法林"]);
    unchecked.confidence = 0.91;
    unchecked.source.confirmed = false;
    const preliminary = checkNewMedication(
      {
        ...unchecked,
        source: { ...unchecked.source, confirmed: true }
      },
      [aspirin],
      profile
    );
    expect(preliminary.level).toBe("high");
  });

  it("stops with insufficient evidence", () => {
    const result = answerWithRules(
      "一种我从没听过的药可以吃吗",
      state.medications,
      state.profile
    );
    expect(result.riskCheck.level).toBe("unknown");
    expect(result.message).toContain("资料不足");
  });
});
