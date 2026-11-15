import { describe, expect, it } from "vitest";
import { medicines } from "./medicines";
import { findBestMedicine, matchMedicines } from "./retrieval";
import { findInteractions } from "./interactions";
import { searchHerbs } from "./herbs";
import { buildLocalGuidance } from "./guidance";
import {
  answerFromDrugCatalog,
  currentCatalogCompanionSlugs
} from "./chatBridge";

describe("combined medicine catalog", () => {
  it("contains the imported structured medicine catalog", () => {
    expect(medicines.length).toBeGreaterThanOrEqual(100);
    expect(new Set(medicines.map((item) => item.slug)).size).toBe(
      medicines.length
    );
  });

  it("matches generic and common brand names", () => {
    expect(findBestMedicine("布洛芬")?.medicine.slug).toBeTruthy();
    expect(findBestMedicine("芬必得")?.medicine.slug).toBe("ibuprofen");
    expect(findBestMedicine("络活喜")?.medicine.slug).toBe("amlodipine");
    expect(matchMedicines("二甲双").length).toBeGreaterThan(0);
    expect(findBestMedicine("氨溴索")?.medicine.activeIngredient).toBe(
      "氨溴索"
    );
    expect(findBestMedicine("利伐沙班")?.medicine.activeIngredient).toBe(
      "利伐沙班"
    );
  });

  it("returns deterministic interaction risk for warfarin and ibuprofen", () => {
    const result = findInteractions(["warfarin", "ibuprofen"]);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]?.severity).toBe("high");
  });

  it("uses the same safety knowledge without a model key", () => {
    const guidance = buildLocalGuidance({
      medicineSlug: "ibuprofen",
      companionSlugs: ["warfarin"],
      healthContext: ["older"],
      question: "能一起吃吗？"
    });
    expect(guidance?.mode).toBe("local");
    expect(guidance?.interactions[0]?.severity).toBe("high");
  });

  it("feeds catalog knowledge into the chat answer for non-current medicines", () => {
    const response = answerFromDrugCatalog(
      "布洛芬缓释胶囊和华法林能一起吃吗？",
      { age: 72, conditions: ["高血压"] },
      ["阿司匹林肠溶片"]
    );
    expect(response?.riskCheck.level).toBe("high");
    expect(response?.message).toContain("出血");
  });

  it("does not fabricate a real-time medicine price", () => {
    const response = answerFromDrugCatalog(
      "对乙酰氨基酚片多少钱，哪个平台最便宜？",
      { age: 72, conditions: [] },
      []
    );
    expect(response?.message).toContain("无法核实实时价格");
  });

  it("uses the current family medication list as companions for a photo-based query", () => {
    expect(
      currentCatalogCompanionSlugs(["阿司匹林", "氨氯地平"])
    ).toEqual(["aspirin", "amlodipine"]);
    const response = answerFromDrugCatalog(
      "布洛芬常见不良反应有哪些？",
      { age: 72, conditions: ["高血压"] },
      ["阿司匹林肠溶片", "苯磺酸氨氯地平片"],
      ["aspirin", "amlodipine"]
    );
    expect(response?.riskCheck.level).toBe("high");
  });
});

describe("herbal catalog", () => {
  it("searches common herb names and aliases", () => {
    expect(searchHerbs("枸杞")[0]?.name).toBe("枸杞子");
    expect(searchHerbs("田七")[0]?.name).toBe("三七");
    expect(searchHerbs("北芪")[0]?.name).toBe("黄芪");
  });

  it("does not return unrelated herbs for unknown text", () => {
    expect(searchHerbs("完全不存在的虚构草药")).toHaveLength(0);
  });
});
