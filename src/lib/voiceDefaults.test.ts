import { describe, expect, it } from "vitest";
import { DEFAULT_VOICE_MODE, normalizeVoiceMode } from "./voiceDefaults";

describe("voice preference behavior", () => {
  it("uses warm female as the first-time default", () => {
    expect(DEFAULT_VOICE_MODE).toBe("warm");
    expect(normalizeVoiceMode(undefined)).toBe("warm");
  });

  it("keeps the explicitly selected voice until another selection is made", () => {
    expect(normalizeVoiceMode("male")).toBe("male");
    expect(normalizeVoiceMode("clear")).toBe("clear");
    expect(normalizeVoiceMode("custom", "qwen-audio-custom")).toBe("custom");
  });

  it("falls back to warm female when custom voice data is missing", () => {
    expect(normalizeVoiceMode("custom")).toBe("warm");
    expect(normalizeVoiceMode("invalid")).toBe("warm");
  });
});
