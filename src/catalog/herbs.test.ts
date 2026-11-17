import { describe, expect, it } from "vitest";
import { findHerbsInText, herbs, searchHerbs } from "./herbs";

describe("herb photo text matching", () => {
  it("contains an expanded practical herb library", () => {
    expect(herbs.length).toBeGreaterThanOrEqual(24);
    expect(searchHerbs("蒲公英")[0]?.name).toBe("蒲公英");
    expect(searchHerbs("红枣")[0]?.name).toBe("大枣");
    expect(searchHerbs("薄荷叶")[0]?.name).toBe("薄荷");
  });

  it("finds herb names inside OCR paragraphs instead of matching the whole paragraph", () => {
    expect(
      findHerbsInText("本品为干燥成熟果实\n枸杞 宁夏枸杞\n另有菊花")
        .map((herb) => herb.name)
    ).toEqual(["枸杞子", "菊花"]);
  });

  it("ignores unrelated photo text", () => {
    expect(findHerbsInText("桌面、纸盒、手机")).toEqual([]);
  });
});
