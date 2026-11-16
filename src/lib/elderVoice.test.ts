import { describe, expect, it } from "vitest";
import { toElderVoice } from "./elderVoice";

describe("elder voice normalization", () => {
  it("uses second-person language when addressing the elder", () => {
    expect(
      toElderVoice("用户需要注意，你的药盒上写了剂量。你们可以一起核对。")
    ).toBe("您需要注意，您的药盒上写了剂量。你们可以一起核对。");
  });
});
