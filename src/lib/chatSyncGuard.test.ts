// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  beginChatGeneration,
  endChatGeneration,
  isChatGenerationActive
} from "./chatSyncGuard";

describe("chat sync guard", () => {
  afterEach(() => vi.useRealTimers());

  it("blocks stale snapshot merges until the answer has had time to sync", () => {
    vi.useFakeTimers();
    beginChatGeneration();
    expect(isChatGenerationActive()).toBe(true);
    endChatGeneration(500);
    expect(isChatGenerationActive()).toBe(true);
    vi.advanceTimersByTime(500);
    expect(isChatGenerationActive()).toBe(false);
  });
});
