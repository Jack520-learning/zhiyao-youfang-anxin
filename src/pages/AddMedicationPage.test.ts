import { describe, expect, it } from "vitest";
import {
  getInsufficientMedicationFields,
  resolveIntakeEntryPhase
} from "./AddMedicationPage";
import { createManualDraft } from "../lib/ocr";

describe("add medication entry phase", () => {
  it("opens review for a recognized chat photo even after image data is stripped", () => {
    expect(
      resolveIntakeEntryPhase({
        manualMode: false,
        captureMode: false,
        reviewMode: true,
        hasDraft: true
      })
    ).toBe("review");
  });

  it("opens review whenever an intake draft exists", () => {
    expect(
      resolveIntakeEntryPhase({
        manualMode: false,
        captureMode: false,
        reviewMode: false,
        hasDraft: true
      })
    ).toBe("review");
  });

  it("still opens upload for the explicit home-page capture flow", () => {
    expect(
      resolveIntakeEntryPhase({
        manualMode: false,
        captureMode: true,
        reviewMode: false,
        hasDraft: true
      })
    ).toBe("upload");
  });

  it("opens a blank review page when review is explicitly requested", () => {
    expect(
      resolveIntakeEntryPhase({
        manualMode: false,
        captureMode: false,
        reviewMode: true,
        hasDraft: false
      })
    ).toBe("review");
  });

  it("identifies missing and low-confidence medication fields for evidence capture", () => {
    const fields = getInsufficientMedicationFields({
      ...createManualDraft("data:image/jpeg;base64,test"),
      name: "硝酸甘油片",
      dosage: "",
      strength: "",
      packageSpec: "",
      frequency: "",
      relation: "",
      instructions: "",
      lowConfidenceFields: ["dosage", "instructions"]
    });
    expect(fields).toEqual(
      expect.arrayContaining([
        "每次服用剂量",
        "说明书用法",
        "服用频次",
        "饭前饭后"
      ])
    );
  });
});
