import { describe, expect, it } from "vitest";
import {
  isAnswerModeCompliant,
  isQuestionFocusedAnswer
} from "./assistantAnswer";

describe("assistant answer validation", () => {
  it("rejects the legacy all-purpose risk template", () => {
    expect(
      isQuestionFocusedAnswer(
        "## ⚠️风险核对\n风险等级：低\n\n## 结论\n没有药物。\n\n## 下一步\n请补充。",
        "## 具体服药方法\n\n当前没有药物。"
      )
    ).toBe(false);
  });

  it("accepts a question-focused local answer", () => {
    expect(
      isQuestionFocusedAnswer(
        "## 具体服药方法\n\n用药档案里还没有已确认的药物。\n\n## 接下来\n请先添加正在服用的药。",
        "## 具体服药方法\n\n用药档案里还没有已确认的药物。"
      )
    ).toBe(true);
  });

  it("rejects an unsupported age claim", () => {
    expect(
      isQuestionFocusedAnswer(
        "考虑到百岁高龄，不能自行调整剂量。",
        "当前没有记录正在服用的药物。"
      )
    ).toBe(false);
  });

  it("enforces distinct quick, safety and detailed answer contracts", () => {
    const quick = "直接回答：不要自行加倍。请查看说明书并联系医生或药师。";
    const safety =
      "## 漏服的安全要点\n\n不要自行加倍。先查看手中的说明书，并记录上次服药时间。\n\n### 现在先做\n- 查看说明书并联系医生或药师。";
    const detailed =
      "## 漏服的详细说明\n\n这是一段足够长的详细解释，先说明为什么不能自行补服，再说明需要记录上次服药时间和距离下次服药的时间。\n\n### 判断依据\n- 药物可能影响凝血，处理方式与具体药物和剩余间隔有关。\n\n### 接下来\n- 查看说明书并联系医生或药师。";
    expect(isAnswerModeCompliant(quick, "quick")).toBe(true);
    expect(isAnswerModeCompliant(safety, "safety")).toBe(true);
    expect(isAnswerModeCompliant(detailed, "detailed")).toBe(true);
    expect(isAnswerModeCompliant(detailed, "quick")).toBe(false);
    expect(isAnswerModeCompliant(quick, "detailed")).toBe(false);
  });
});
