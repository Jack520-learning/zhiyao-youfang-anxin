// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  consumeSpeechFallbackNotice,
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

  it("falls back to the default system voice when a custom voice has expired", async () => {
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
    vi.stubGlobal("Audio", FakeAudio);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body || "{}")) as {
          voiceMode?: string;
        };
        if (body.voiceMode === "custom") {
          return new Response(
            JSON.stringify({
              error: "专属音色失效",
              code: "CUSTOM_VOICE_INVALID"
            }),
            { status: 422, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({
            audioUrl: "https://audio.example/fallback-warm.wav",
            voice: "longanhuan_v3.1"
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      })
    );

    await expect(
      speakText(
        "失效专属音色兜底",
        true,
        "custom",
        "qwen-audio-expired-test"
      )
    ).resolves.toBe(true);
    expect(consumeSpeechFallbackNotice()).toContain("已切换到温和女声");
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

  it("keeps playback active while moving between long-answer chunks", async () => {
    const audios: FakeAudio[] = [];
    class FakeAudio {
      paused = false;
      currentTime = 0;
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public src: string) {
        audios.push(this);
      }
      play() {
        return Promise.resolve();
      }
      pause() {
        this.paused = true;
      }
    }
    vi.stubGlobal("Audio", FakeAudio);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            audioUrl: "https://audio.example/chunk.wav",
            voice: "longanhuan_v3.1"
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    const states: string[] = [];
    const onChange = () => states.push(getSpeechStatus());
    window.addEventListener("speech-state-change", onChange);
    const text = [
      "这是需要连续朗读的第一段内容，用来检查长回答不会在分段时被误判为停止。".repeat(3),
      "这是第二段内容，应该在第一段结束后立即继续，不出现等待或丢失状态。".repeat(3),
      "这是最后一段内容，播放结束后才允许恢复空闲状态。".repeat(3)
    ].join("。");

    await expect(speakText(text, true, "warm")).resolves.toBe(true);
    expect(audios).toHaveLength(1);
    expect(getSpeechStatus()).toBe("speaking");

    states.length = 0;
    audios[0].onended?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(audios.length).toBeGreaterThan(1);
    expect(states).not.toContain("idle");
    expect(getSpeechStatus()).toBe("speaking");
    stopSpeaking();
    expect(getSpeechStatus()).toBe("idle");
    window.removeEventListener("speech-state-change", onChange);
  });

  it("lets a new answer take over without the previous answer ending the new playback", async () => {
    const audios: FakeAudio[] = [];
    class FakeAudio {
      paused = false;
      currentTime = 0;
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public src: string) {
        audios.push(this);
      }
      play() {
        return Promise.resolve();
      }
      pause() {
        this.paused = true;
      }
    }
    vi.stubGlobal("Audio", FakeAudio);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            audioUrl: "https://audio.example/switch.wav",
            voice: "longanhuan_v3.1"
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    await expect(
      speakText(
        "旧回答内容很长，需要连续朗读，并准备切换到下一段回答。".repeat(8),
        true,
        "warm"
      )
    ).resolves.toBe(true);
    await expect(
      speakText("新的回答现在开始朗读。", true, "warm")
    ).resolves.toBe(true);
    expect(audios.length).toBeGreaterThanOrEqual(2);

    audios[0].onended?.();
    expect(getSpeechStatus()).toBe("speaking");
    audios[1].onended?.();
    expect(getSpeechStatus()).toBe("idle");
    stopSpeaking();
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

  it("reads the general-knowledge notice only once", async () => {
    let spokenText = "";
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
    vi.stubGlobal("Audio", FakeAudio);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body || "{}")) as {
          text?: string;
        };
        spokenText = body.text || "";
        return new Response(
          JSON.stringify({
            audioUrl: "https://audio.example/notice.wav",
            voice: "longanhuan_v3.1"
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      })
    );

    await expect(
      speakText(
        "温馨提示：这个问题与健康用药无关，以下仅作一般常识参考。\n\n温馨提示：这个问题与健康用药无关，以下仅作一般常识参考。\n\n天空呈蓝色。",
        true,
        "warm"
      )
    ).resolves.toBe(true);
    expect(spokenText.match(/温馨提示/g)).toHaveLength(1);
    expect(spokenText).toContain("天空呈蓝色");
  });

  it("never substitutes an unregistered browser voice when cloud synthesis fails", async () => {
    let spoken = 0;
    class FakeUtterance {
      lang = "";
      rate = 1;
      pitch = 1;
      voice: { name?: string } | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public text: string) {}
    }
    Object.assign(window, {
      SpeechSynthesisUtterance: FakeUtterance,
      speechSynthesis: {
        paused: false,
        cancel: () => undefined,
        pause: () => undefined,
        resume: () => undefined,
        speak: (utterance: FakeUtterance) => {
          spoken += 1;
        },
        getVoices: () => [
          { lang: "zh-CN", name: "Microsoft Yunxi" },
          { lang: "zh-CN", name: "Microsoft Huihui" }
        ]
      }
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "暂时不可用" }), {
          status: 502,
          headers: { "Content-Type": "application/json" }
        })
      )
    );

    await expect(
      speakText("禁用未知音色", true, "warm")
    ).resolves.toBe(false);
    expect(spoken).toBe(0);
    expect(getSpeechStatus()).toBe("idle");
  });
});
