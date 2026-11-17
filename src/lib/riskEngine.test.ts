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

  it("answers an empty 'today's medicines' question without a generic risk template", () => {
    const result = answerWithRules("今天这些药要怎么吃", [], profile);
    expect(result.message).toContain("具体服药方法");
    expect(result.message).toContain("用药档案里还没有已确认的药物");
    expect(result.message).not.toContain("## ⚠️风险核对");
  });

  it("changes the response focus for usage and missed-dose questions", () => {
    const usage = answerWithRules(
      "阿司匹林怎么吃",
      [aspirin],
      profile
    );
    const missed = answerWithRules(
      "阿司匹林忘了吃怎么办",
      [aspirin],
      profile
    );
    expect(usage.message).toContain("具体服药方法");
    expect(missed.message).toContain("这次漏服怎么处理");
    expect(usage.message).not.toBe(missed.message);
  });

  it("uses distinct response contracts outside the condition knowledge cards", () => {
    const query = "阿司匹林忘了吃怎么办";
    const quick = answerWithRules(query, [aspirin], profile, {
      answerMode: "quick"
    });
    const safety = answerWithRules(query, [aspirin], profile, {
      answerMode: "safety"
    });
    const detailed = answerWithRules(query, [aspirin], profile, {
      answerMode: "detailed"
    });
    expect(quick.message).not.toContain("\n## ");
    expect(safety.message).toContain("安全要点");
    expect(detailed.message).toContain("详细说明");
    expect(detailed.message).toContain("判断依据");
    expect(quick.message.length).toBeLessThan(safety.message.length);
    expect(safety.message.length).toBeLessThan(detailed.message.length);
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
    expect(result.message).toContain("无法准确回答");
    expect(result.message.length).toBeLessThan(100);
  });

  it("does not provide a one-size-fits-all dose for a symptom question", () => {
    const result = answerWithRules(
      "我发烧了该怎么办",
      [],
      profile
    );
    expect(result.message).toContain("基础病");
    expect(result.message).not.toMatch(/每\s*4\s*-\s*6\s*小时/);
    expect(result.message).not.toMatch(/每\s*6\s*-\s*8\s*小时/);
  });

  it("answers heart discomfort from the actual complaint instead of a dizziness template", () => {
    const result = answerWithRules("我心脏不舒服。", [], profile);
    expect(result.riskCheck.title).toContain("心脏不适");
    expect(result.message).not.toContain("心脏不适怎么判断");
    expect(result.message).not.toMatch(/^##\s+/m);
    expect(result.message).toContain("120");
    expect(result.message).not.toContain("仅凭头晕");
    expect(result.message).not.toContain("服药后的不适怎么判断");
  });

  it("asks for the specific body area when discomfort is unspecified", () => {
    const result = answerWithRules("我今天有点不舒服", [], profile);
    expect(result.riskCheck.title).toContain("具体不适部位");
    expect(result.message).toContain("具体不适部位");
    expect(result.message).not.toContain("仅凭头晕");
    expect(result.message).toContain("120");
  });
});
