let active = false;
let releaseTimer: number | undefined;

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
  }, delayMs);
}

export function isChatGenerationActive(): boolean {
  return active;
}
