import { describe, expect, it } from "vitest";
import {
  DEFAULT_VOICE_MODE,
  normalizeVoiceMode,
  sanitizeVoicePreferences
} from "./voiceDefaults";
import { createInitialState } from "../data/seed";

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

  it("removes stale unknown custom voices and returns to warm female", () => {
    const preferences = createInitialState().preferences;
    const cleaned = sanitizeVoicePreferences({
      ...preferences,
      voiceMode: "custom",
      customVoiceId: "unknown-voice",
      customVoiceName: "未知音色",
      customVoices: [
        {
          id: "unknown-voice",
          name: "未知音色",
          createdAt: "2026-01-01T00:00:00.000Z"
        }
      ]
    });
    expect(cleaned.voiceMode).toBe("warm");
    expect(cleaned.customVoiceId).toBeUndefined();
    expect(cleaned.customVoices).toEqual([]);
  });
});
