import type {
  CloudSnapshot,
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
