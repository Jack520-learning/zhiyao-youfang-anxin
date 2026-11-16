// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getSpeechStatus,
  preloadSpeech,
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
    vi.unstubAllGlobals();
  });

  it("uses the exact fixed voice for each system voice mode", async () => {
    const expected = {
      warm: "longanhuan_v3.1",
      clear: "longxiaoxia_v3.1",
      male: "longanyang_v3.1",
      calm: "longcheng_v3.1"
    } as const;
    const requestedVoices: string[] = [];

    class FakeAudio {
      paused = false;
      currentTime = 0;
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public src: string) {}
      play() {
        return Promise.resolve();
      }
      pause() {
        this.paused = true;
      }
    }

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body || "{}")) as {
          voiceMode: keyof typeof expected;
        };
        requestedVoices.push(expected[body.voiceMode]);
        return new Response(
          JSON.stringify({
            audioUrl: `https://audio.example/${body.voiceMode}.wav`,
            voice: expected[body.voiceMode]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      })
    );
    vi.stubGlobal("Audio", FakeAudio);

    for (const mode of ["warm", "clear", "male", "calm"] as const) {
      await expect(
        speakText(`固定音色测试-${mode}`, true, mode)
      ).resolves.toBe(true);
    }
    expect(requestedVoices).toEqual([
      expected.warm,
      expected.clear,
      expected.male,
      expected.calm
    ]);
  });

  it("does not play a mismatched voice returned by the service", async () => {
    let browserSpeechCalls = 0;
    class FakeAudio {
      paused = false;
      currentTime = 0;
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      play() {
        return Promise.resolve();
      }
      pause() {}
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            audioUrl: "https://audio.example/wrong.wav",
            voice: "wrong_female_voice"
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    vi.stubGlobal("Audio", FakeAudio);
    Object.assign(window, {
      speechSynthesis: {
        cancel: () => undefined,
        speak: () => {
          browserSpeechCalls += 1;
        },
        getVoices: () => [],
        speaking: false,
        paused: false
      }
    });

    await expect(
      speakText("音色不匹配测试", true, "male")
    ).resolves.toBe(false);
    expect(browserSpeechCalls).toBe(0);
  });

  it("rejects an unregistered or mismatched custom voice", async () => {
    class FakeAudio {
      paused = false;
      currentTime = 0;
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      play() {
        return Promise.resolve();
      }
      pause() {}
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            audioUrl: "https://audio.example/wrong-custom.wav",
            voice: "qwen-audio-another-custom"
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    vi.stubGlobal("Audio", FakeAudio);

    await expect(
      speakText(
        "专属音色校验",
        true,
        "custom",
        "qwen-audio-selected-custom"
      )
    ).resolves.toBe(false);
  });

  it("aborts a pending speech request immediately when stopped", async () => {
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            requestSignal = init?.signal || undefined;
            requestSignal?.addEventListener(
              "abort",
              () =>
                reject(
                  new DOMException("语音朗读已停止", "AbortError")
                ),
              { once: true }
            );
          })
      )
    );

    const playback = speakText("停止朗读测试", true, "clear");
    expect(requestSignal).toBeDefined();
    expect(getSpeechStatus()).toBe("loading");
    stopSpeaking();

    await expect(playback).resolves.toBe(false);
    expect(requestSignal?.aborted).toBe(true);
    expect(getSpeechStatus()).toBe("idle");
  });

  it("deduplicates background preparation for the same message and voice", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          audioUrl: "https://audio.example/prepared.wav",
          voice: "longanhuan_v3.1"
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([
      preloadSpeech("同一条回答朗读预取", "warm"),
      preloadSpeech("同一条回答朗读预取", "warm")
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
