import { useEffect, useRef, useState } from "react";
import { DEFAULT_VOICE_MODE } from "./voiceDefaults";

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

let preferredVoiceMode: VoiceMode = DEFAULT_VOICE_MODE;
let currentAudio: HTMLAudioElement | null = null;
let browserSpeechUtterance: SpeechSynthesisUtterance | null = null;
let speechRequestVersion = 0;
let speechPending = false;
let speechAbortController: AbortController | null = null;
const speechUrlCache = new Map<
  string,
  { audioUrl: string; createdAt: number; voice: string }
>();
const speechAudioRequests = new Map<
  string,
  Promise<{ audioUrl: string; voice: string }>
>();
const expectedSystemVoices: Record<
  Exclude<VoiceMode, "custom">,
  string
> = {
  warm: "longanhuan_v3.1",
  clear: "longxiaoxia_v3.1",
  male: "longanyang_v3.1",
  calm: "longcheng_v3.1"
};
const systemVoiceGender: Partial<Record<VoiceMode, "female" | "male">> = {
  warm: "female",
  clear: "female",
  male: "male",
  calm: "male"
};

function emitSpeechState() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("speech-state-change"));
  }
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

function selectBrowserVoice(voiceMode: VoiceMode) {
  if (
    typeof window === "undefined" ||
    !window.speechSynthesis ||
    typeof window.SpeechSynthesisUtterance !== "function"
  ) {
    return null;
  }
  const voices = window.speechSynthesis.getVoices?.() || [];
  const chineseVoices = voices.filter((voice) => /^zh/i.test(voice.lang));
  const gender = systemVoiceGender[voiceMode];
  if (!gender) return chineseVoices[0] || null;
  const maleName = /yunxi|yunjian|kangkang|liang|male|男/i;
  const femaleName = /xiaoxiao|huihui|yaoyao|female|女/i;
  return (
    chineseVoices.find((voice) =>
      gender === "male"
        ? maleName.test(voice.name)
        : femaleName.test(voice.name)
    ) || null
  );
}

function playWithBrowserVoice(
  text: string,
  requestVersion: number,
  voiceMode: VoiceMode
): boolean {
  if (requestVersion !== speechRequestVersion) return false;
  const voice = selectBrowserVoice(voiceMode);
  if (!voice) return false;
  const synth = window.speechSynthesis!;
  synth.cancel();
  const utterance = new window.SpeechSynthesisUtterance(
    naturalSpeechText(text)
  );
  utterance.lang = "zh-CN";
  utterance.rate = 0.94;
  utterance.pitch = 1;
  utterance.voice = voice;
  const clear = () => {
    if (browserSpeechUtterance === utterance) {
      browserSpeechUtterance = null;
      emitSpeechState();
    }
  };
  utterance.onend = clear;
  utterance.onerror = clear;
  browserSpeechUtterance = utterance;
  emitSpeechState();
  try {
    synth.speak(utterance);
    return true;
  } catch {
    clear();
    return false;
  }
}

export async function speakText(
  text: string,
  enabled = true,
  voiceMode: VoiceMode = "warm",
  customVoiceId?: string,
  options?: {
    fallbackAfterMs?: number;
  }
): Promise<boolean> {
  if (!enabled || !text.trim()) return Promise.resolve(false);
  stopSpeaking();
  preferredVoiceMode = voiceMode;
  const requestVersion = speechRequestVersion;
  const abortController = new AbortController();
  speechAbortController = abortController;
  speechPending = true;
  emitSpeechState();
  const cached = getCachedSpeechAudio(text, voiceMode, customVoiceId);
  try {
    if (cached) {
      try {
        if (await playAudioUrl(cached.audioUrl, requestVersion)) return true;
      } catch {
        // Continue with the local browser voice if autoplay fails.
      }
      return playWithBrowserVoice(text, requestVersion, voiceMode);
    }
    const serverPlayback = playServerAudio(
      text,
      voiceMode,
      customVoiceId,
      requestVersion,
      abortController.signal
    ).catch(() => false);
    if (!selectBrowserVoice(voiceMode)) {
      return await serverPlayback;
    }
    let fallbackTimer: number | undefined;
    const browserFallback = new Promise<boolean>((resolve) => {
      fallbackTimer = window.setTimeout(() => {
        abortController.abort();
        resolve(
          playWithBrowserVoice(text, requestVersion, voiceMode)
        );
      }, Math.max(1000, options?.fallbackAfterMs ?? 4500));
    });
    const started = await Promise.race([serverPlayback, browserFallback]);
    if (fallbackTimer) window.clearTimeout(fallbackTimer);
    if (started) return true;
    return playWithBrowserVoice(text, requestVersion, voiceMode);
  } catch {
    return playWithBrowserVoice(text, requestVersion, voiceMode);
  } finally {
    if (speechAbortController === abortController) {
      speechAbortController = null;
    }
    if (requestVersion === speechRequestVersion) {
      speechPending = false;
      emitSpeechState();
    }
  }
}

function getCachedSpeechAudio(
  text: string,
  voiceMode: VoiceMode,
  customVoiceId?: string
) {
  const spokenText = naturalSpeechText(text);
  const cacheKey = `${voiceMode}:${customVoiceId || "default"}:${spokenText}`;
  const cached = speechUrlCache.get(cacheKey);
  if (!cached || Date.now() - cached.createdAt >= 10 * 60 * 1000) {
    return null;
  }
  return cached;
}

async function playAudioUrl(
  audioUrl: string,
  requestVersion: number
): Promise<boolean> {
  if (requestVersion !== speechRequestVersion) return false;
  const audio = new Audio(audioUrl);
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
  if (requestVersion !== speechRequestVersion || currentAudio !== audio) {
    audio.pause();
    audio.currentTime = 0;
    return false;
  }
  emitSpeechState();
  return true;
}

async function playServerAudio(
  text: string,
  voiceMode: VoiceMode,
  customVoiceId: string | undefined,
  requestVersion: number,
  signal: AbortSignal
): Promise<boolean> {
  const payload = await getSpeechAudioUrl(
    text,
    voiceMode,
    customVoiceId,
    signal
  );
  if (requestVersion !== speechRequestVersion) return false;
  return playAudioUrl(payload.audioUrl, requestVersion);
}

async function getSpeechAudioUrl(
  text: string,
  voiceMode: VoiceMode,
  customVoiceId?: string,
  signal?: AbortSignal
): Promise<{ audioUrl: string; voice: string }> {
  const spokenText = naturalSpeechText(text);
  const cacheKey = `${voiceMode}:${customVoiceId || "default"}:${spokenText}`;
  const cached = getCachedSpeechAudio(text, voiceMode, customVoiceId);
  if (cached) return cached;
  const pendingRequest = speechAudioRequests.get(cacheKey);
  if (pendingRequest) return pendingRequest;

  const request = (async () => {
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
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
    if (voiceMode === "custom") {
      if (
        !customVoiceId ||
        !/^qwen-audio-/.test(customVoiceId) ||
        payload.voice !== customVoiceId
      ) {
        throw new Error("语音服务返回了不匹配的专属音色");
      }
    } else {
      const expectedVoice = expectedSystemVoices[voiceMode];
      if (payload.voice !== expectedVoice) {
        throw new Error("语音服务返回了不匹配的音色");
      }
    }
    return {
      audioUrl: payload.audioUrl,
      voice: payload.voice || voiceMode
    };
  })();
  speechAudioRequests.set(cacheKey, request);
  try {
    const result = await request;
    speechUrlCache.set(cacheKey, {
      ...result,
      createdAt: Date.now()
    });
    return result;
  } finally {
    if (speechAudioRequests.get(cacheKey) === request) {
      speechAudioRequests.delete(cacheKey);
    }
  }
}

export async function preloadSpeech(
  text: string,
  voiceMode: VoiceMode = "warm",
  customVoiceId?: string
): Promise<void> {
  if (!text.trim()) return;
  await getSpeechAudioUrl(text, voiceMode, customVoiceId);
}

export function getSpeechPlaybackState(): SpeechPlaybackState {
  if (browserSpeechUtterance) {
    return window.speechSynthesis?.paused ? "paused" : "speaking";
  }
  if (currentAudio) return currentAudio.paused ? "paused" : "speaking";
  return "idle";
}

export function getSpeechStatus(): SpeechStatus {
  if (speechPending) return "loading";
  return getSpeechPlaybackState();
}

export function pauseSpeaking(): boolean {
  if (browserSpeechUtterance && window.speechSynthesis) {
    window.speechSynthesis.pause();
    emitSpeechState();
    return true;
  }
  if (currentAudio) {
    currentAudio.pause();
    emitSpeechState();
    return true;
  }
  return false;
}

export function resumeSpeaking(): boolean {
  if (browserSpeechUtterance && window.speechSynthesis) {
    window.speechSynthesis.resume();
    emitSpeechState();
    return true;
  }
  if (currentAudio?.paused) {
    void currentAudio.play();
    emitSpeechState();
    return true;
  }
  return false;
}

export function stopSpeaking() {
  speechRequestVersion += 1;
  speechPending = false;
  if (browserSpeechUtterance) {
    window.speechSynthesis?.cancel();
    browserSpeechUtterance = null;
  }
  speechAbortController?.abort();
  speechAbortController = null;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
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
