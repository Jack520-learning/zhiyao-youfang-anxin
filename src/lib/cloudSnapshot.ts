import type {
  CloudSnapshot,
  ChatMessage,
  Conversation,
  IntakeDraft
} from "../types";

export function cloudSnapshotFingerprint(snapshot: CloudSnapshot): string {
  const { updatedAt: _updatedAt, ...content } = snapshot;
  return JSON.stringify(content);
}

export function preserveLocalConversationImages(
  remoteConversations: Conversation[] | undefined,
  localConversations: Conversation[]
): Conversation[] | undefined {
  if (!remoteConversations) return undefined;
  const localImages = new Map<string, string[]>();
  for (const conversation of localConversations) {
    for (const message of conversation.messages) {
      if (message.imageDataUrls?.length) {
        localImages.set(message.id, message.imageDataUrls);
      }
    }
  }
  return remoteConversations.map((conversation) => ({
    ...conversation,
    messages: conversation.messages.map((message) => {
      const images = message.imageDataUrls?.length
        ? message.imageDataUrls
        : localImages.get(message.id);
      return images?.length
        ? { ...message, imageDataUrls: images }
        : message;
    })
  }));
}

export function preserveLocalDraftImage(
  remoteDraft: IntakeDraft | undefined,
  localDraft: IntakeDraft | undefined
): IntakeDraft | undefined {
  if (!remoteDraft) return localDraft;
  return {
    ...remoteDraft,
    imageDataUrl:
      remoteDraft.imageDataUrl || localDraft?.imageDataUrl || undefined
  };
}

export function mergeConversationHistory(
  remoteConversations: Conversation[] = [],
  localConversations: Conversation[] = []
): Conversation[] {
  const merged = new Map<string, Conversation>();

  for (const conversation of remoteConversations) {
    merged.set(conversation.id, {
      ...conversation,
      messages: [...conversation.messages]
    });
  }

  for (const localConversation of localConversations) {
    const remoteConversation = merged.get(localConversation.id);
    if (!remoteConversation) {
      merged.set(localConversation.id, {
        ...localConversation,
        messages: [...localConversation.messages]
      });
      continue;
    }

    const messages = new Map<string, ChatMessage>();
    for (const message of remoteConversation.messages) {
      messages.set(message.id, message);
    }
    for (const message of localConversation.messages) {
      const remoteMessage = messages.get(message.id);
      messages.set(
        message.id,
        !remoteMessage || message.content.length >= remoteMessage.content.length
          ? message
          : remoteMessage
      );
    }

    const localIsNewer =
      new Date(localConversation.updatedAt).getTime() >=
      new Date(remoteConversation.updatedAt).getTime();
    merged.set(localConversation.id, {
      ...(localIsNewer ? localConversation : remoteConversation),
      messages: Array.from(messages.values())
    });
  }

  return Array.from(merged.values()).sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() -
      new Date(left.updatedAt).getTime()
  );
}
