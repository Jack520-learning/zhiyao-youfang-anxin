// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useSpeechRecognition } from "./speech";

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
