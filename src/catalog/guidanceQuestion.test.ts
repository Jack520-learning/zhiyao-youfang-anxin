import { describe, expect, it } from "vitest";
import { buildLocalGuidance } from "./guidance";

describe("catalog question matching", () => {
  it("answers a composition question with composition instead of a dosage template", () => {
    const guidance = buildLocalGuidance({
      medicineSlug: "ibuprofen-granules",
      companionSlugs: [],
      healthContext: [],
      question: "成分"
    });
    expect(guidance?.questionAnswer).toContain("布洛芬");
    expect(guidance?.questionAnswer).toContain("有效成分");
    expect(guidance?.questionAnswer).not.toContain("成人常用一次 1 袋");
  });

  it("answers dosage-form questions from the current record", () => {
    const guidance = buildLocalGuidance({
      medicineSlug: "ibuprofen-granules",
      companionSlugs: [],
      healthContext: [],
      question: "什么剂型，每袋多少"
    });
    expect(guidance?.questionAnswer).toContain("颗粒剂");
    expect(guidance?.questionAnswer).toContain("0.2 g/袋");
  });

  it("does not use a dosage fallback for an unrelated question", () => {
    const guidance = buildLocalGuidance({
      medicineSlug: "ibuprofen-granules",
      companionSlugs: [],
      healthContext: [],
      question: "它的历史上市时间是什么"
    });
    expect(guidance?.questionAnswer).toContain("没有找到能准确回答");
    expect(guidance?.questionAnswer).not.toContain("成人常用一次 1 袋");
  });

  it("answers who to contact after a prolonged missed dose", () => {
    const guidance = buildLocalGuidance({
      medicineSlug: "nitroglycerin",
      companionSlugs: [],
      healthContext: [],
      question: "如果漏服时间比较久，应该联系谁？"
    });
    expect(guidance?.questionAnswer).toContain("医生或药师");
    expect(guidance?.questionAnswer).toContain("120");
    expect(guidance?.questionAnswer).not.toContain("通常应跳过");
  });

  it("answers reminder setup instead of repeating missed-dose rules", () => {
    const guidance = buildLocalGuidance({
      medicineSlug: "ibuprofen-granules",
      companionSlugs: [],
      healthContext: [],
      question: "下一次服药提醒怎么设置？"
    });
    expect(guidance?.questionAnswer).toContain("用药");
    expect(guidance?.questionAnswer).toContain("今日");
  });
});
