import type { ChatMessage } from "../types";

export interface ChatRegenerationContext {
  question: string;
  targetIndex: number;
  userIndex: number;
  historyMessages: ChatMessage[];
}

export function resolveChatRegeneration(
  messages: ChatMessage[],
  targetMessageId: string
): ChatRegenerationContext | null {
  const targetIndex = messages.findIndex(
    (message) =>
      message.id === targetMessageId && message.role === "assistant"
  );
  if (targetIndex < 0) return null;
  for (let index = targetIndex - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "user") {
      return {
        question: message.content,
        targetIndex,
        userIndex: index,
        historyMessages: messages.slice(0, index)
      };
    }
  }
  return null;
}
