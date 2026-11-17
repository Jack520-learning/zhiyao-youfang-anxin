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

export function sanitizeVoicePreferences(
  preferences: AppPreferences
): AppPreferences {
  const seen = new Set<string>();
  const customVoices = preferences.customVoices.filter((voice) => {
    if (
      !/^qwen-audio-/.test(voice.id) ||
      seen.has(voice.id)
    ) {
      return false;
    }
    seen.add(voice.id);
    return true;
  });
  const customVoiceId =
    preferences.customVoiceId &&
    customVoices.some((voice) => voice.id === preferences.customVoiceId)
      ? preferences.customVoiceId
      : undefined;
  const voiceMode = normalizeVoiceMode(
    preferences.voiceMode,
    customVoiceId
  );
  return {
    ...preferences,
    customVoices,
    customVoiceId,
    customVoiceName: customVoiceId
      ? preferences.customVoiceName ||
        customVoices.find((voice) => voice.id === customVoiceId)?.name
      : undefined,
    voiceMode
  };
}

export function isLocalSpeechSettingNewer(
  remoteUpdatedAt?: string,
  localUpdatedAt?: string
): boolean {
  if (!localUpdatedAt) return false;
  if (!remoteUpdatedAt) return true;
  const remoteTime = new Date(remoteUpdatedAt).getTime();
  const localTime = new Date(localUpdatedAt).getTime();
  if (!Number.isFinite(localTime)) return false;
  if (!Number.isFinite(remoteTime)) return true;
  return localTime > remoteTime;
}
