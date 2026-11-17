let active = false;
let releaseTimer: number | undefined;
const generationEndedListeners = new Set<() => void>();

export function beginChatGeneration(): void {
  active = true;
  if (releaseTimer) {
    window.clearTimeout(releaseTimer);
    releaseTimer = undefined;
  }
}

export function endChatGeneration(delayMs = 1200): void {
  if (releaseTimer) window.clearTimeout(releaseTimer);
  releaseTimer = window.setTimeout(() => {
    active = false;
    releaseTimer = undefined;
    for (const listener of generationEndedListeners) {
      listener();
    }
  }, delayMs);
}

export function isChatGenerationActive(): boolean {
  return active;
}

export function subscribeChatGenerationEnded(
  listener: () => void
): () => void {
  generationEndedListeners.add(listener);
  return () => generationEndedListeners.delete(listener);
}
