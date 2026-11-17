import { describe, expect, it } from "vitest";
import { resolveInitialChatView } from "./chatView";

describe("chat view restoration", () => {
  it("restores the active conversation after leaving and returning to chat", () => {
    expect(
      resolveInitialChatView({
        messageCount: 4,
        hasMedicineContext: false
      })
    ).toBe("conversation");
  });

  it("restores a newly opened blank conversation in the same tab", () => {
    expect(
      resolveInitialChatView({
        messageCount: 0,
        hasMedicineContext: false,
        savedConversationId: "conversation-new",
        activeConversationId: "conversation-new"
      })
    ).toBe("conversation");
  });

  it("keeps a genuinely fresh chat on the home view", () => {
    expect(
      resolveInitialChatView({
        messageCount: 0,
        hasMedicineContext: false
      })
    ).toBe("home");
  });
});
