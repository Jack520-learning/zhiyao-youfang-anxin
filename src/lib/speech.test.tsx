// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  speakText,
  stopSpeaking,
  useSpeechRecognition
} from "./speech";

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = "";
  continuous = false;
  interimResults = false;
  onresult: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onend: (() => void) | null = null;
  starts = 0;

  constructor() {
    FakeRecognition.instances.push(this);
  }

  start() {
    this.starts += 1;
  }

  stop() {}
}

function Harness() {
  const speech = useSpeechRecognition(() => undefined);
  return (
    <>
      <button type="button" onClick={speech.start}>
        start
      </button>
      <button type="button" onClick={speech.stop}>
        stop
      </button>
    </>
  );
}

describe("useSpeechRecognition hold behavior", () => {
  beforeEach(() => {
    FakeRecognition.instances = [];
    Object.assign(window, { SpeechRecognition: FakeRecognition });
    document.body.innerHTML = '<div id="root"></div>';
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("restarts after a transient end while still held, and stops after release", async () => {
    const root = createRoot(document.getElementById("root")!);
    await act(async () => root.render(<Harness />));
    const buttons = document.querySelectorAll("button");
    await act(async () => buttons[0].click());
    expect(FakeRecognition.instances[0].starts).toBe(1);

    await act(async () => {
      FakeRecognition.instances[0].onend?.();
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    expect(FakeRecognition.instances[0].starts).toBe(2);

    await act(async () => buttons[1].click());
    await act(async () => {
      FakeRecognition.instances[0].onend?.();
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    expect(FakeRecognition.instances[0].starts).toBe(2);
    root.unmount();
  });
});

describe("speech playback start", () => {
  afterEach(() => {
    stopSpeaking();
  });

  it("falls back to stable browser speech when server TTS is unavailable", async () => {
    let spoken = 0;
    const holder: {
      utterance: {
        onend: (() => void) | null;
        onerror: (() => void) | null;
      } | null;
    } = { utterance: null };

    class FakeUtterance {
      lang = "";
      voice: unknown = null;
      rate = 1;
      pitch = 1;
      volume = 1;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor(public text: string) {}
    }

    Object.assign(window, {
      SpeechSynthesisUtterance: FakeUtterance,
      speechSynthesis: {
        cancel: () => undefined,
        speak: (next: FakeUtterance) => {
          spoken += 1;
          holder.utterance = next;
        },
        getVoices: () => [],
        speaking: false,
        paused: false
      }
    });

    const playback = speakText("您好，我马上为您朗读。", true, "warm");
    await vi.waitFor(() => expect(spoken).toBe(1));
    expect(holder.utterance).not.toBeNull();
    holder.utterance?.onend?.();
    await expect(playback).resolves.toBe(true);
  });

  it("keeps the same Chinese voice when browser voices load later", async () => {
    const spokenVoices: unknown[] = [];
    let voiceReads = 0;
    const firstVoice = { name: "Stable Voice A", lang: "zh-CN", localService: true };
    const secondVoice = { name: "Different Voice B", lang: "zh-CN", localService: true };

    class StableUtterance {
      lang = "";
      voice: unknown = null;
      rate = 1;
      pitch = 1;
      volume = 1;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public text: string) {}
    }

    Object.assign(window, {
      SpeechSynthesisUtterance: StableUtterance,
      speechSynthesis: {
        cancel: () => undefined,
        speak: (next: StableUtterance) => {
          spokenVoices.push(next.voice);
          next.onend?.();
        },
        getVoices: () => {
          voiceReads += 1;
          return [voiceReads === 1 ? firstVoice : secondVoice];
        },
        speaking: false,
        paused: false
      }
    });

    await speakText("第一段朗读", true, "clear");
    await speakText("第二段朗读", true, "clear");
    expect(spokenVoices).toHaveLength(2);
    expect(spokenVoices[0]).toBe(firstVoice);
    expect(spokenVoices[1]).toBe(firstVoice);
  });
});
