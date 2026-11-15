import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createServerLinkedAccount,
  loginServerAccount
} from "./accountApi";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("account service client", () => {
  it("logs in through the server account endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          token: "session-token",
          account: {
            id: "account-1",
            username: "family1",
            displayName: "家属一",
            role: "family",
            familyCode: "ABC123",
            linkedFamilyCodes: ["ABC123"],
            createdAt: "2026-01-01T00:00:00.000Z"
          },
          accounts: []
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const session = await loginServerAccount("family1", "secret123");

    expect(session.token).toBe("session-token");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("uses the active session token when creating a linked account", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          account: {
            id: "account-2",
            username: "family2",
            displayName: "家属二",
            role: "family",
            familyCode: "ABC123",
            linkedFamilyCodes: ["ABC123"],
            createdAt: "2026-01-01T00:00:00.000Z"
          },
          accounts: []
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await createServerLinkedAccount("session-token", {
      username: "family2",
      password: "secret123",
      displayName: "家属二",
      role: "family",
      familyCode: "ABC123"
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/linked-account",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer session-token"
        })
      })
    );
  });
});
