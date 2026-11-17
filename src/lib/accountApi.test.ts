import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AccountRequestError,
  createServerLinkedAccount,
  loginServerAccount,
  switchServerAccount
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

  it("preserves an authoritative login rejection from the server", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "账号或密码不正确" }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        })
      )
    );

    await expect(
      loginServerAccount("deleted-account", "secret123")
    ).rejects.toEqual(
      expect.objectContaining<Partial<AccountRequestError>>({
        name: "AccountRequestError",
        status: 401,
        message: "账号或密码不正确"
      })
    );
  });

  it("sends the administrator password when switching to a management account", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          token: "admin-session",
          account: {
            id: "admin-1",
            username: "manage",
            displayName: "管理员",
            role: "admin",
            familyCode: "",
            linkedFamilyCodes: [],
            createdAt: "2026-01-01T00:00:00.000Z"
          },
          accounts: []
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await switchServerAccount("current-session", {
      accountId: "admin-1",
      password: "admin-password"
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/switch",
      expect.objectContaining({
        body: JSON.stringify({
          accountId: "admin-1",
          password: "admin-password"
        })
      })
    );
  });
});
