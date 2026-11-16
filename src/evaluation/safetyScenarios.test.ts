import { describe, expect, it } from "vitest";
import {
  evaluateSafetyScenarios,
  safetyScenarios
} from "./safetyScenarios";

describe("safety evaluation suite", () => {
  it("keeps every curated safety regression scenario passing", () => {
    const results = evaluateSafetyScenarios();
    expect(results.length).toBeGreaterThanOrEqual(100);
    expect(results.every((result) => result.passed)).toBe(true);
  });

  it("covers emergency, interaction, duplication, allergy and missing data", () => {
    const categories = new Set(safetyScenarios.map((scenario) => scenario.category));
    expect([...categories]).toEqual(
      expect.arrayContaining([
        "紧急求助",
        "相互作用",
        "重复成分",
        "过敏史",
        "资料不足"
      ])
    );
  });
});
