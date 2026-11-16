import { describe, expect, it } from "vitest";
import {
  applyFrequencySelection,
  isAsNeededFrequency,
  splitDosageText,
  validateDosageText,
  validateTimes
} from "./dosage";

describe("dosage validation", () => {
  it("accepts a normal dose with unit", () => {
    expect(validateDosageText("5mg，每次 1 片").valid).toBe(true);
  });

  it("rejects unreasonable single doses", () => {
    expect(validateDosageText("99999mg").valid).toBe(false);
    expect(validateDosageText("0mg").valid).toBe(false);
  });

  it("requires a number and unit", () => {
    expect(validateDosageText("一次一片").valid).toBe(false);
  });

  it("rejects duplicate daily time slots", () => {
    expect(validateTimes(["08:00", "08:00"]).valid).toBe(false);
    expect(validateTimes(["08:00", "18:30"]).valid).toBe(true);
  });

  it("updates frequency and time slots together without reverting the selection", () => {
    const selected = applyFrequencySelection(["08:00"], "每日 3 次");
    expect(selected.frequency).toBe("每日 3 次");
    expect(selected.times).toEqual(["08:00", "", ""]);
  });

  it("uses no fixed time when the medicine is taken as needed", () => {
    expect(isAsNeededFrequency("按需服用")).toBe(true);
    const selected = applyFrequencySelection(["08:00"], "按需服用");
    expect(selected.frequency).toBe("按需服用");
    expect(selected.times).toEqual([]);
  });

  it("separates a single dose from tablet strength and package quantity", () => {
    expect(splitDosageText("0.5mg/片；100片/盒")).toEqual({
      dosage: "",
      strength: "0.5mg/片",
      packageSpec: "100片/盒"
    });
    expect(splitDosageText("0.5mg/片，每次 1 片")).toEqual({
      dosage: "每次 1 片",
      strength: "0.5mg/片",
      packageSpec: ""
    });
    expect(validateDosageText("0.5mg/片；100片/盒").message).toContain(
      "每次实际服用剂量"
    );
  });
});
