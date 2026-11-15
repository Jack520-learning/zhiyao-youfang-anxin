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

export type VoiceMode = "warm" | "clear";
export type SpeechPlaybackState = "idle" | "speaking" | "paused";

let preferredVoiceMode: VoiceMode = "warm";

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
    "yunxi",
    "云希",
    "yunyang",
    "云扬",
    "kangkang",
    "康康",
    "male",
    "男"
  ];
  const terms = mode === "warm" ? warmTerms : clearTerms;
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
  return voices[mode === "warm" ? 0 : Math.min(1, voices.length - 1)];
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

export function speakText(
  text: string,
  enabled = true,
  voiceMode: VoiceMode = "warm"
): boolean {
  if (!enabled || !("speechSynthesis" in window)) return false;
  window.speechSynthesis.cancel();
  preferredVoiceMode = voiceMode;
  const utterance = new SpeechSynthesisUtterance(naturalSpeechText(text));
  utterance.lang = "zh-CN";
  utterance.voice = pickChineseVoice(voiceMode) ?? null;
  utterance.rate = voiceMode === "warm" ? 0.9 : 0.96;
  utterance.pitch = voiceMode === "warm" ? 0.96 : 1.03;
  utterance.volume = 1;
  window.speechSynthesis.speak(utterance);
  return true;
}

export function getSpeechPlaybackState(): SpeechPlaybackState {
  if (!("speechSynthesis" in window)) return "idle";
  if (!window.speechSynthesis.speaking) return "idle";
  return window.speechSynthesis.paused ? "paused" : "speaking";
}

export function pauseSpeaking(): boolean {
  if (!("speechSynthesis" in window) || !window.speechSynthesis.speaking) {
    return false;
  }
  window.speechSynthesis.pause();
  return true;
}

export function resumeSpeaking(): boolean {
  if (!("speechSynthesis" in window) || !window.speechSynthesis.paused) {
    return false;
  }
  window.speechSynthesis.resume();
  return true;
}

export function stopSpeaking() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

export function testVoiceMode(mode: VoiceMode): boolean {
  return speakText(
    mode === "warm"
      ? "您好，我会用温和清楚的声音陪您核对用药。"
      : "您好，现在使用清晰明亮的音色为您朗读。",
    true,
    mode
  );
}

export function getVoiceModeLabel(mode: VoiceMode): string {
  return mode === "warm" ? "温和女声" : "清晰声线";
}

export function currentPreferredVoiceMode(): VoiceMode {
  return preferredVoiceMode;
}
