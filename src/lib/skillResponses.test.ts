import { describe, expect, it } from "vitest";
import { buildSkillResponse, isSkillAnswerCompliant } from "./skillResponses";
import type { ElderProfile, Medication } from "../types";

const profile: ElderProfile = {
  name: "王阿姨",
  age: 72,
  conditions: ["高血压"],
  allergies: [],
  timeZone: "Asia/Shanghai",
  healthProfileCompleted: true,
  healthProfilePromptSeen: true,
  visionPreference: "large",
  voiceEnabled: true
};

const medications: Medication[] = [
  {
    id: "med-warfarin",
    name: "华法林钠片",
    genericName: "华法林",
    ingredients: ["华法林"],
    dosage: "1片",
    strength: "2.5mg",
    frequency: "每日一次",
    times: ["20:00"],
    relation: "饭后",
    instructions: "按处方服用",
    startDate: "2026-01-01",
    status: "active",
    reminderEnabled: true,
    source: {
      type: "prescription",
      title: "处方",
      capturedAt: "2026-01-01T00:00:00.000Z",
      confirmed: true
    },
    confidence: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  }
];

const context = {
  profile,
  medications,
  currentMedicationNames: ["华法林钠片"],
  answerMode: "safety" as const
};

describe("skill-specific responses", () => {
  it("keeps drug encyclopedia questions on the matched medicine", () => {
    const response = buildSkillResponse("catalog", "布洛芬颗粒介绍", context);
    expect(response?.message).toContain("布洛芬颗粒");
    expect(response?.message).toContain("## 布洛芬颗粒介绍");
    expect(response?.message).toContain("已匹配：布洛芬颗粒");
    expect(response?.message).not.toContain("本次答复的安全要点");
    expect(response?.message).not.toContain("常见规格为常见");
    expect(response?.message).not.toContain("。。");
    expect(
      isSkillAnswerCompliant("catalog", response?.message || "", response?.message || "")
    ).toBe(true);
  });

  it("uses herb identification instead of the generic safety template", () => {
    const response = buildSkillResponse("herbs", "黄芪有什么传统用途", context);
    expect(response?.message).toContain("识别到中药材：黄芪");
    expect(response?.message).toContain("性味归经");
  });

  it("answers every named herb separately without an off-topic notice", () => {
    const question = "枸杞子、葛根、黄芪，还有菟丝子分别是什么作用？";
    const response = buildSkillResponse("herbs", question, context);
    if (!response) throw new Error("没有生成中药材回答");
    expect(response?.message).toContain("## 已识别 4 种中药材");
    for (const name of ["枸杞子", "葛根", "黄芪", "菟丝子"]) {
      expect(response?.message).toContain(`### ${name}`);
    }
    const positions = ["枸杞子", "葛根", "黄芪", "菟丝子"].map((name) =>
      response.message.indexOf(`### ${name}`)
    );
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(response?.message).not.toContain("这个问题与健康用药无关");
    expect(
      isSkillAnswerCompliant(
        "herbs",
        response?.message || "",
        response?.message || ""
      )
    ).toBe(true);
  });

  it("builds a real multi-drug reconciliation from the current list and question", () => {
    const response = buildSkillResponse(
      "multi-drug",
      "阿司匹林肠溶片能不能和华法林一起吃",
      context
    );
    expect(response?.message).toContain("多药对账");
    expect(response?.message).toContain("阿司匹林肠溶片");
    expect(response?.message).toContain("华法林钠片");
    expect(response?.riskCheck.level).toBe("high");
    expect(isSkillAnswerCompliant("multi-drug", response?.message || "", response?.message || "")).toBe(
      true
    );
  });

  it("rejects an answer that ignores the selected multi-drug skill", () => {
    expect(
      isSkillAnswerCompliant(
        "multi-drug",
        "## 日常注意事项的安全要点\n\n请多休息。",
        "多药对账结果"
      )
    ).toBe(false);
  });
});
