import { describe, expect, it } from "vitest";
import { getDosageFormSafety } from "./dosageFormSafety";

describe("getDosageFormSafety", () => {
  it("blocks splitting, crushing and chewing for sustained-release forms", () => {
    const result = getDosageFormSafety("布洛芬缓释胶囊");

    expect(result.formLabel).toContain("缓释");
    expect(result.split).toContain("不可");
    expect(result.crush).toContain("不可");
    expect(result.chew).toContain("不可");
  });

  it("protects enteric coatings", () => {
    const result = getDosageFormSafety("阿司匹林肠溶片");

    expect(result.formLabel).toBe("肠溶片");
    expect(result.headline).toContain("完整吞服");
  });

  it("gives route-specific guidance for sublingual tablets", () => {
    const result = getDosageFormSafety("硝酸甘油舌下片");

    expect(result.formLabel).toBe("舌下片");
    expect(result.chew).toContain("不可");
    expect(result.detail).toContain("舌下");
  });

  it("does not overstate what can be done to an ordinary tablet", () => {
    const result = getDosageFormSafety("二甲双胍片");

    expect(result.formLabel).toBe("普通片剂");
    expect(result.split).toContain("说明书");
    expect(result.detail).toContain("没有明确说明");
  });

  it("keeps unknown forms conservative", () => {
    const result = getDosageFormSafety("某处方药");

    expect(result.formLabel).toBe("剂型待确认");
    expect(result.headline).toContain("不要自行改变");
  });
});
