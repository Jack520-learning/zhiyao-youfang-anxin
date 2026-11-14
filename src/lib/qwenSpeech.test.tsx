// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useQwenSpeechRecognition } from "./qwenSpeech";

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  state: RecordingState = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor() {
    FakeMediaRecorder.instances.push(this);
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.onstop?.();
  }

  static isTypeSupported() {
    return true;
  }
}

function Harness() {
  const speech = useQwenSpeechRecognition(() => undefined);
  return (
    <>
      <button type="button" onClick={speech.start}>
        start
      </button>
      <button type="button" onClick={speech.stop}>
        stop
      </button>
      <output>{speech.listening ? "held" : "released"}</output>
    </>
  );
}

describe("useQwenSpeechRecognition hold behavior", () => {
  beforeEach(() => {
    FakeMediaRecorder.instances = [];
    Object.assign(window, { MediaRecorder: FakeMediaRecorder });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => ({
          getTracks: () => [{ stop: () => undefined }]
        })
      }
    });
    document.body.innerHTML = '<div id="root"></div>';
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("keeps recording beyond the old two-second cutoff and stops on release", async () => {
    const root = createRoot(document.getElementById("root")!);
    await act(async () => root.render(<Harness />));
    const buttons = document.querySelectorAll("button");

    await act(async () => {
      buttons[0].click();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(FakeMediaRecorder.instances[0].state).toBe("recording");

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2200));
    });
    expect(FakeMediaRecorder.instances[0].state).toBe("recording");
    expect(document.querySelector("output")?.textContent).toBe("held");

    await act(async () => buttons[1].click());
    expect(FakeMediaRecorder.instances[0].state).toBe("inactive");
    expect(document.querySelector("output")?.textContent).toBe("released");
    root.unmount();
  });
});
