import { describe, expect, it } from "vitest";
import { findHerbsInText } from "./herbs";

describe("herb photo text matching", () => {
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
