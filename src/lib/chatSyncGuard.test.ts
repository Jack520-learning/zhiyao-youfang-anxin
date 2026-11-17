// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  beginChatGeneration,
  endChatGeneration,
  isChatGenerationActive,
  subscribeChatGenerationEnded
} from "./chatSyncGuard";

describe("chat sync guard", () => {
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("blocks stale snapshot merges until the answer has had time to sync", () => {
    vi.useFakeTimers();
    beginChatGeneration();
    expect(isChatGenerationActive()).toBe(true);
    endChatGeneration(500);
    expect(isChatGenerationActive()).toBe(true);
    vi.advanceTimersByTime(500);
    expect(isChatGenerationActive()).toBe(false);
  });

  it("notifies the sync writer after the answer is ready", () => {
    vi.useFakeTimers();
    const listener = vi.fn();
    const unsubscribe = subscribeChatGenerationEnded(listener);
    beginChatGeneration();
    endChatGeneration(500);
    expect(listener).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    beginChatGeneration();
    endChatGeneration(10);
    vi.advanceTimersByTime(10);
    expect(listener).toHaveBeenCalledOnce();
  });
});
