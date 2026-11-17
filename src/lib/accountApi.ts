import type { CloudSnapshot, UserRole } from "../types";

export interface ServerAccount {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  familyCode: string;
  linkedFamilyCodes: string[];
  createdAt: string;
  disabled?: boolean;
}

export interface AccountSessionResponse {
  token: string;
  account: ServerAccount;
  accounts: ServerAccount[];
  snapshot?: CloudSnapshot | null;
  revision?: number;
}

export class AccountRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AccountRequestError";
    this.status = status;
  }
}

interface AccountRequest {
  username: string;
  password: string;
  displayName: string;
  role: UserRole;
  familyCode?: string;
}

async function accountRequest<T>(
  path: string,
  options: {
    method?: "GET" | "POST";
    token?: string;
    body?: unknown;
  } = {}
): Promise<T> {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.token
        ? { Authorization: `Bearer ${options.token}` }
        : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  if (!response.ok) {
    throw new AccountRequestError(
      payload.error || `账号服务请求失败：${response.status}`,
      response.status
    );
  }
  return payload as T;
}

export function registerServerAccount(
  input: AccountRequest
): Promise<AccountSessionResponse> {
  return accountRequest("/api/auth/register", {
    method: "POST",
    body: input
  });
}

export function loginServerAccount(
  username: string,
  password: string
): Promise<AccountSessionResponse> {
  return accountRequest("/api/auth/login", {
    method: "POST",
    body: { username, password }
  });
}

export function fetchServerAccounts(
  token: string
): Promise<Omit<AccountSessionResponse, "token">> {
  return accountRequest("/api/auth/accounts", { token });
}

export function createServerLinkedAccount(
  token: string,
  input: AccountRequest
): Promise<{ account: ServerAccount; accounts: ServerAccount[] }> {
  return accountRequest("/api/auth/linked-account", {
    method: "POST",
    token,
    body: input
  });
}

export function switchServerAccount(
  token: string,
  account: { accountId?: string; username?: string }
): Promise<AccountSessionResponse> {
  return accountRequest("/api/auth/switch", {
    method: "POST",
    token,
    body: account
  });
}

export async function logoutServerAccount(token?: string): Promise<void> {
  if (!token) return;
  await accountRequest("/api/auth/logout", {
    method: "POST",
    token
  });
}

export async function verifyServerAccountPassword(input: {
  token: string;
  accountId: string;
  password: string;
}): Promise<boolean> {
  try {
    await accountRequest("/api/auth/verify-password", {
      method: "POST",
      token: input.token,
      body: {
        accountId: input.accountId,
        password: input.password
      }
    });
    return true;
  } catch {
    return false;
  }
}

export async function deleteServerAccount(input: {
  token: string;
  accountId: string;
  password: string;
}): Promise<void> {
  await accountRequest("/api/auth/delete", {
    method: "POST",
    token: input.token,
    body: {
      accountId: input.accountId,
      password: input.password
    }
  });
}

export interface AdminOverview {
  totalAccounts: number;
  elderAccounts: number;
  familyAccounts: number;
  adminAccounts: number;
  disabledAccounts: number;
  linkedFamilies: number;
  syncedFamilies: number;
  medicationRecords: number;
  riskRecords: number;
  generatedAt: string;
}

export interface AdminAccountSummary extends ServerAccount {
  hasSession: boolean;
}

export function fetchAdminOverview(token: string): Promise<{
  overview: AdminOverview;
  accounts: AdminAccountSummary[];
}> {
  return accountRequest("/api/admin/overview", { token });
}

export function setAdminAccountDisabled(
  token: string,
  accountId: string,
  disabled: boolean
): Promise<{ ok: boolean; account: ServerAccount }> {
  return accountRequest("/api/admin/accounts/status", {
    method: "POST",
    token,
    body: { accountId, disabled }
  });
}

export async function updateServerAccount(input: {
  accountId: string;
  currentPassword: string;
  newUsername?: string;
  newPassword?: string;
  displayName?: string;
}): Promise<{ ok: boolean; changes?: Record<string, unknown> }> {
  return accountRequest("/api/auth/update", {
    method: "POST",
    token: "",
    body: {
      accountId: input.accountId,
      currentPassword: input.currentPassword,
      ...(input.newUsername ? { newUsername: input.newUsername } : {}),
      ...(input.newPassword ? { newPassword: input.newPassword } : {}),
      ...(input.displayName ? { displayName: input.displayName } : {})
    }
  });
}
