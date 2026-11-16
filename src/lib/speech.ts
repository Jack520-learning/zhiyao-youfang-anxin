import { useEffect, useRef, useState } from "react";

interface SpeechRecognitionResultLike {
  readonly transcript: string;
}

interface SpeechRecognitionEventLike extends Event {
  readonly results: {
    readonly length: number;
    [index: number]: {
      readonly isFinal: boolean;
      [index: number]: SpeechRecognitionResultLike;
    };
  };
}

interface SpeechRecognitionErrorEventLike extends Event {
  readonly error: string;
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechConstructor(): SpeechRecognitionConstructor | undefined {
  const speechWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

export function useSpeechRecognition(
  onFinalTranscript: (transcript: string) => void
) {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const callbackRef = useRef(onFinalTranscript);
  const holdingRef = useRef(false);
  const finalTextRef = useRef("");
  const retryTimerRef = useRef<number | undefined>(undefined);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const supported = Boolean(getSpeechConstructor());

  useEffect(() => {
    callbackRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

  useEffect(() => {
    const Constructor = getSpeechConstructor();
    if (!Constructor) return;
    const recognition = new Constructor();
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) finalText += result[0].transcript;
        else interimText += result[0].transcript;
      }
      setInterim(interimText);
      if (finalText.trim()) {
        finalTextRef.current = `${finalTextRef.current}${finalText}`;
        callbackRef.current(finalTextRef.current.trim());
      }
    };
    recognition.onerror = (event) => {
      if (!holdingRef.current && event.error === "aborted") return;
      const fatalErrors = [
        "not-allowed",
        "service-not-allowed",
        "audio-capture",
        "language-not-supported"
      ];
      if (holdingRef.current && !fatalErrors.includes(event.error)) {
        setError(
          event.error === "network"
            ? "语音服务短暂中断，正在继续聆听；松开按钮结束。"
            : ""
        );
        return;
      }
      holdingRef.current = false;
      setError(
        event.error === "not-allowed"
          ? "麦克风权限未开启，可以改用文字输入。"
          : "没有听清，请再说一次或改用文字。"
      );
      setListening(false);
    };
    recognition.onend = () => {
      if (holdingRef.current) {
        const restart = () => {
          if (!holdingRef.current) return;
          try {
            recognition.start();
          } catch {
            retryTimerRef.current = window.setTimeout(restart, 250);
          }
        };
        retryTimerRef.current = window.setTimeout(restart, 100);
      } else {
        setListening(false);
        setInterim("");
      }
    };
    recognitionRef.current = recognition;
    return () => {
      holdingRef.current = false;
      if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
      recognition.stop();
      recognitionRef.current = null;
    };
  }, []);

  return {
    supported,
    listening,
    interim,
    error,
    clearError: () => setError(""),
    start: () => {
      setError("");
      if (!recognitionRef.current) {
        setError("当前浏览器不支持语音输入，可以改用文字输入。");
        return;
      }
      try {
        holdingRef.current = true;
        if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
        finalTextRef.current = "";
        recognitionRef.current.start();
        setListening(true);
      } catch {
        holdingRef.current = false;
        setError("语音功能正在使用中，请稍后再试。");
      }
    },
    stop: () => {
      holdingRef.current = false;
      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = undefined;
      }
      recognitionRef.current?.stop();
      setListening(false);
    }
  };
}

export type VoiceMode = "warm" | "clear" | "male" | "calm" | "custom";
export type SpeechPlaybackState = "idle" | "speaking" | "paused";
export type SpeechStatus = SpeechPlaybackState | "loading";

let preferredVoiceMode: VoiceMode = "warm";
let currentAudio: HTMLAudioElement | null = null;
let speechRequestVersion = 0;
let speechPending = false;
const speechUrlCache = new Map<
  string,
  { audioUrl: string; createdAt: number; voice: string }
>();

// Pre-warm SpeechSynthesis voices cache at module load time
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  // Some browsers return empty voices on first getVoices() call,
  // but the act of calling it triggers async loading
  window.speechSynthesis.getVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = () => {
      // Just touch the voices so browser caches them
      window.speechSynthesis.getVoices();
    };
  }
}

function emitSpeechState() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("speech-state-change"));
  }
}

function scoreVoice(voice: SpeechSynthesisVoice, mode: VoiceMode): number {
  const name = voice.name.toLowerCase();
  const warmTerms = [
    "ting-ting",
    "tingting",
    "婷婷",
    "xiaoxiao",
    "晓晓",
    "mei-jia",
    "美佳",
    "huihui",
    "慧慧",
    "female",
    "女"
  ];
  const clearTerms = [
    "siri",
    "google 普通话",
    "mandarin",
    "普通话",
    "xiaoxiao",
    "晓晓"
  ];
  const maleTerms = [
    "yunxi",
    "云希",
    "yunyang",
    "云扬",
    "kangkang",
    "康康",
    "male",
    "男"
  ];
  const terms =
    mode === "warm"
      ? warmTerms
      : mode === "clear"
        ? clearTerms
        : maleTerms;
  return (
    (voice.lang.toLowerCase().startsWith("zh") ? 20 : 0) +
    (voice.localService ? 5 : 0) +
    terms.reduce((score, term) => score + (name.includes(term) ? 10 : 0), 0)
  );
}

function pickChineseVoice(mode: VoiceMode): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis
    .getVoices()
    .filter((voice) => voice.lang.toLowerCase().startsWith("zh"))
    .sort((left, right) => scoreVoice(right, mode) - scoreVoice(left, mode));
  const preferred = voices.find((voice) => scoreVoice(voice, mode) >= 20);
  if (preferred) return preferred;
  const fallbackIndex =
    mode === "warm" ? 0 : mode === "clear" ? 1 : mode === "male" ? 0 : 0;
  return voices[Math.min(fallbackIndex, voices.length - 1)];
}

function naturalSpeechText(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_#>`~]/g, "")
    .replace(/\r?\n+/g, "。")
    .replace(/。{2,}/g, "。")
    .replace(/\s+/g, " ")
    .trim();
}

function waitForVoices(): Promise<void> {
  return new Promise((resolve) => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      resolve();
      return;
    }
    const timeout = window.setTimeout(resolve, 1500);
    const onVoicesChanged = () => {
      if (window.speechSynthesis.getVoices().length > 0) {
        window.clearTimeout(timeout);
        window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
        resolve();
      }
    };
    window.speechSynthesis.addEventListener("voiceschanged", onVoicesChanged);
  });
}

export async function speakText(
  text: string,
  enabled = true,
  voiceMode: VoiceMode = "warm",
  customVoiceId?: string
): Promise<boolean> {
  if (!enabled || !text.trim()) return Promise.resolve(false);
  stopSpeaking();
  preferredVoiceMode = voiceMode;
  const requestVersion = speechRequestVersion;
  speechPending = true;
  emitSpeechState();
  try {
    const result = await playServerVoice(
      text,
      voiceMode,
      customVoiceId,
      requestVersion
    );
    if (result) return true;
    return speakWithBrowser(text, voiceMode);
  } catch {
    if (requestVersion !== speechRequestVersion) return false;
    return speakWithBrowser(text, voiceMode);
  } finally {
    if (requestVersion === speechRequestVersion) {
      speechPending = false;
      emitSpeechState();
    }
  }
}

async function playServerVoice(
  text: string,
  voiceMode: VoiceMode,
  customVoiceId: string | undefined,
  requestVersion: number
): Promise<boolean> {
  try {
    const payload = await getSpeechAudioUrl(text, voiceMode, customVoiceId);
    if (requestVersion !== speechRequestVersion) return false;
    const audio = new Audio(payload.audioUrl);
    currentAudio = audio;
    audio.onended = () => {
      if (currentAudio === audio) currentAudio = null;
      emitSpeechState();
    };
    audio.onerror = () => {
      if (currentAudio === audio) currentAudio = null;
      emitSpeechState();
    };
    await audio.play();
    emitSpeechState();
    return true;
  } catch {
    return false;
  }
}

async function getSpeechAudioUrl(
  text: string,
  voiceMode: VoiceMode,
  customVoiceId?: string
): Promise<{ audioUrl: string; voice: string }> {
  const spokenText = naturalSpeechText(text);
  const cacheKey = `${voiceMode}:${customVoiceId || "default"}:${spokenText}`;
  const cached = speechUrlCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < 10 * 60 * 1000) {
    return cached;
  }
  const response = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: spokenText,
      voiceMode,
      customVoiceId
    })
  });
  if (!response.ok) throw new Error("服务端语音合成不可用");
  const payload = (await response.json()) as {
    audioUrl?: string;
    voice?: string;
  };
  if (!payload.audioUrl) throw new Error("没有返回音频");
  const result = {
    audioUrl: payload.audioUrl,
    voice: payload.voice || voiceMode
  };
  speechUrlCache.set(cacheKey, {
    ...result,
    createdAt: Date.now()
  });
  return result;
}

export async function preloadSpeech(
  text: string,
  voiceMode: VoiceMode = "warm",
  customVoiceId?: string
): Promise<void> {
  if (!text.trim()) return;
  await getSpeechAudioUrl(text, voiceMode, customVoiceId);
}

async function speakWithBrowser(text: string, voiceMode: VoiceMode): Promise<boolean> {
  if (!("speechSynthesis" in window)) return false;
  await waitForVoices();
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(naturalSpeechText(text));
  utterance.lang = "zh-CN";
  const fallbackMode = voiceMode === "custom" ? "warm" : voiceMode;
  const voice = pickChineseVoice(fallbackMode);
  if (voice) utterance.voice = voice;
  utterance.rate =
    fallbackMode === "warm"
      ? 0.9
      : fallbackMode === "clear"
        ? 0.96
        : fallbackMode === "male"
          ? 0.94
          : 0.82;
  utterance.pitch =
    fallbackMode === "warm"
      ? 0.96
      : fallbackMode === "clear"
        ? 1.04
        : fallbackMode === "male"
          ? 0.9
          : 0.84;
  utterance.volume = 1;
  utterance.onend = () => {
    emitSpeechState();
  };
  utterance.onerror = () => {
    emitSpeechState();
  };
  window.speechSynthesis.speak(utterance);
  // Some browsers need a short delay after speak() for audio to actually start
  if (window.speechSynthesis.speaking) return true;
  // Force-start if needed (some browsers require user gesture)
  window.speechSynthesis.resume();
  return true;
}

export function getSpeechPlaybackState(): SpeechPlaybackState {
  if (currentAudio) return currentAudio.paused ? "paused" : "speaking";
  if (!("speechSynthesis" in window)) return "idle";
  if (!window.speechSynthesis.speaking) return "idle";
  return window.speechSynthesis.paused ? "paused" : "speaking";
}

export function getSpeechStatus(): SpeechStatus {
  if (speechPending) return "loading";
  return getSpeechPlaybackState();
}

export function pauseSpeaking(): boolean {
  if (currentAudio) {
    currentAudio.pause();
    emitSpeechState();
    return true;
  }
  if (!("speechSynthesis" in window) || !window.speechSynthesis.speaking) {
    return false;
  }
  window.speechSynthesis.pause();
  emitSpeechState();
  return true;
}

export function resumeSpeaking(): boolean {
  if (currentAudio?.paused) {
    void currentAudio.play();
    emitSpeechState();
    return true;
  }
  if (!("speechSynthesis" in window) || !window.speechSynthesis.paused) {
    return false;
  }
  window.speechSynthesis.resume();
  emitSpeechState();
  return true;
}

export function stopSpeaking() {
  speechRequestVersion += 1;
  speechPending = false;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  emitSpeechState();
}

export function testVoiceMode(
  mode: VoiceMode,
  customVoiceId?: string
): Promise<boolean> {
  if (mode === "custom" && customVoiceId) {
    return speakText(
      "您好，这是您的专属健康助手。我会用您熟悉的声音，清楚、温和地为您朗读用药信息。",
      true,
      mode,
      customVoiceId
    );
  }
  return speakText(
    mode === "warm"
      ? "您好，我会用温和清楚的声音陪您核对用药。"
      : mode === "clear"
        ? "您好，现在使用清晰明亮的音色为您朗读。"
        : mode === "male"
          ? "您好，现在使用清晰男声为您朗读。"
          : "您好，现在使用沉稳男声慢慢为您朗读。",
    true,
    mode,
    customVoiceId
  );
}

export function getVoiceModeLabel(mode: VoiceMode): string {
  return mode === "warm"
    ? "温和女声"
    : mode === "clear"
      ? "明亮女声"
      : mode === "male"
        ? "清晰男声"
        : mode === "calm"
          ? "沉稳男声"
          : "我的专属音色";
}

export function currentPreferredVoiceMode(): VoiceMode {
  return preferredVoiceMode;
}

export async function deleteCustomVoiceRemote(voiceId: string): Promise<void> {
  const response = await fetch(
    `/api/voice-clone/${encodeURIComponent(voiceId)}`,
    { method: "DELETE" }
  );
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(payload?.error || "专属音色删除失败");
  }
}
