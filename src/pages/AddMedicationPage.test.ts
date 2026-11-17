import { describe, expect, it } from "vitest";
import { resolveIntakeEntryPhase } from "./AddMedicationPage";

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
});
