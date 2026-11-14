import { describe, expect, it } from "vitest";
import { reconcileMedicationList } from "./multiDrug";

describe("multi medicine reconciliation", () => {
  it("finds duplicate ingredients across different dosage forms", () => {
    const result = reconcileMedicationList([
      "布洛芬缓释胶囊",
      "布洛芬颗粒"
    ]);
    expect(result.warnings.some((item) => item.level === "high")).toBe(true);
    expect(result.warnings.some((item) => item.title.includes("相同成分"))).toBe(true);
  });

  it("finds a known interaction between current medicines", () => {
    const result = reconcileMedicationList([
      "华法林钠片",
      "阿司匹林肠溶片"
    ]);
    expect(result.warnings.some((item) => item.title.includes("出血"))).toBe(true);
  });

  it("includes herbs and supplements in the same reconciliation", () => {
    const result = reconcileMedicationList([
      "华法林钠片",
      "三七",
      "鱼油"
    ]);
    expect(result.entries.some((item) => item.kind === "herb")).toBe(true);
    expect(result.entries.some((item) => item.kind === "supplement")).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("flags medicines that need to be separated", () => {
    const result = reconcileMedicationList([
      "蒙脱石散",
      "盐酸二甲双胍片"
    ]);
    expect(result.spacing.join(" ")).toContain("2 小时");
  });

  it("keeps unresolved names explicit", () => {
    const result = reconcileMedicationList(["完全未知的草药和产品"]);
    expect(result.unresolved).toHaveLength(1);
  });
});
