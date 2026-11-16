import type { AppPreferences } from "../types";

export const DEFAULT_VOICE_MODE: AppPreferences["voiceMode"] = "warm";

export function normalizeVoiceMode(
  value: unknown,
  customVoiceId?: string
): AppPreferences["voiceMode"] {
  if (value === "custom" && customVoiceId) return "custom";
  if (
    value === "warm" ||
    value === "clear" ||
    value === "male" ||
    value === "calm"
  ) {
    return value;
  }
  return DEFAULT_VOICE_MODE;
}
