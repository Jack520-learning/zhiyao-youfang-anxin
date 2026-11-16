import { describe, expect, it } from "vitest";
import { suggestDoseFromText } from "./doseAutofill";

describe("automatic dose suggestions", () => {
  it("extracts an explicit single dose from label text", () => {
    expect(
      suggestDoseFromText("用法：每次服用1片，每日2次", "label")?.dosage
    ).toBe("1片");
  });

  it("extracts a documented single dose from drug reference text", () => {
    expect(
      suggestDoseFromText(
        "心绞痛发作时通常舌下含服 0.5 mg；如未缓解按说明书重复。",
        "catalog"
      )?.dosage
    ).toBe("0.5mg");
  });

  it("does not treat package quantity as a single dose", () => {
    expect(suggestDoseFromText("100片/盒", "label")).toBeNull();
    expect(suggestDoseFromText("0.5mg/片", "label")).toBeNull();
  });
});
