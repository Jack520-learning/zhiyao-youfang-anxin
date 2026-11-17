export function resolveInitialChatView(input: {
  query?: string | null;
  messageCount: number;
  hasMedicineContext: boolean;
  savedConversationId?: string | null;
  activeConversationId?: string;
}): "home" | "conversation" {
  const restoredConversation =
    Boolean(input.savedConversationId) &&
    input.savedConversationId === input.activeConversationId;
  return input.query ||
    input.messageCount > 0 ||
    input.hasMedicineContext ||
    restoredConversation
    ? "conversation"
    : "home";
}
