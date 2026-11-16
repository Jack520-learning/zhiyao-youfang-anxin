import { get, set, del } from "idb-keyval";
import { create } from "zustand";
import {
  createJSONStorage,
  persist,
  type StateStorage
} from "zustand/middleware";
import { createInitialState } from "../data/seed";
import {
  createPasswordRecord,
  encryptPassword,
  verifyPassword
} from "../lib/auth";
import {
  createServerLinkedAccount,
  deleteServerAccount,
  loginServerAccount,
  logoutServerAccount,
  registerServerAccount,
  switchServerAccount,
  verifyServerAccountPassword,
  type AccountSessionResponse,
  type ServerAccount
} from "../lib/accountApi";
import { createId } from "../lib/ids";
import { nowIso } from "../lib/time";
import {
  captureWorkspace,
  createBlankWorkspace,
  getLinkedFamilyCodes,
  normalizeFamilyCode,
  saveActiveWorkspace,
  workspaceFromCloud,
  workspaceKey,
  workspacePatch
} from "../lib/workspaces";
import type {
  AccountWorkspace,
  AppPreferences,
  AppState,
  AuditEvent,
  ChatMessage,
  CloudSnapshot,
  Conversation,
  ConsentSettings,
  DoseEvent,
  DoseStatus,
  ElderProfile,
  EmergencyContact,
  FamilyAlert,
  IntakeDraft,
  LocalAccount,
  Medication,
  RiskCheck,
  UserRole
} from "../types";

const STORAGE_NAME = "zhiyao-youfang-anxin-app-state";
const legacyDefaultMedicationSource =
  "\u6f14\u793a\u5904\u65b9\uff08\u5df2\u786e\u8ba4\uff09";

function auditEvent(
  type: AuditEvent["type"],
  summary: string,
  metadata?: AuditEvent["metadata"]
): AuditEvent {
  return {
    id: createId("audit"),
    type,
    summary,
    createdAt: nowIso(),
    metadata
  };
}

function createConversationRecord(title = "新对话"): Conversation {
  const createdAt = nowIso();
  return {
    id: createId("conversation"),
    title,
    createdAt,
    updatedAt: createdAt,
    messages: []
  };
}

function titleFromQuestion(content: string): string {
  const clean = content
    .replace(/^(请问|请帮我|帮我|想问一下|我想问|我想知道)[，,\s]*/u, "")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > 20 ? `${clean.slice(0, 20)}…` : clean || "新的用药咨询";
}

function pruneHandledAlerts(alerts: FamilyAlert[]): FamilyAlert[] {
  const cutoff = Date.now() - 15 * 24 * 60 * 60 * 1000;
  return alerts.filter(
    (alert) =>
      !alert.handledAt || new Date(alert.handledAt).getTime() >= cutoff
  );
}

function normalizeAccount(account: LocalAccount): LocalAccount {
  return {
    ...account,
    linkedFamilyCodes: getLinkedFamilyCodes(account)
  };
}

function removeAccountWorkspaces(
  workspaces: Record<string, AccountWorkspace>,
  accountIds: Iterable<string>
): Record<string, AccountWorkspace> {
  const removed = new Set(accountIds);
  return Object.fromEntries(
    Object.entries(workspaces).filter(
      ([key]) => !removed.has(key.split("::")[0] || "")
    )
  );
}

function accountFromServer(
  serverAccount: ServerAccount,
  existing?: LocalAccount,
  token?: string
): LocalAccount {
  return {
    id: existing?.id ?? `server-${serverAccount.id}`,
    username: serverAccount.username,
    displayName: serverAccount.displayName,
    role: serverAccount.role,
    familyCode: serverAccount.familyCode,
    linkedFamilyCodes: serverAccount.linkedFamilyCodes,
    serverAccountId: serverAccount.id,
    sessionToken: token ?? existing?.sessionToken,
    passwordHash: existing?.passwordHash ?? "",
    passwordSalt: existing?.passwordSalt ?? "",
    createdAt: serverAccount.createdAt
  };
}

function mergeServerAccounts(
  localAccounts: LocalAccount[],
  serverAccounts: ServerAccount[],
  activeServerAccountId: string,
  token: string
): LocalAccount[] {
  const merged = localAccounts.map(normalizeAccount);
  for (const serverAccount of serverAccounts) {
    const index = merged.findIndex(
      (account) =>
        account.serverAccountId === serverAccount.id ||
        account.username === serverAccount.username
    );
    const existing = index >= 0 ? merged[index] : undefined;
    const next = accountFromServer(
      serverAccount,
      existing,
      serverAccount.id === activeServerAccountId ? token : undefined
    );
    if (index >= 0) merged[index] = next;
    else merged.push(next);
  }
  return merged;
}

function activeLocalAccount(
  accounts: LocalAccount[],
  accountId: string
): LocalAccount | undefined {
  return accounts.find((account) => account.id === accountId);
}

const indexedDbStorage: StateStorage = {
  getItem: async (name) => (await get<string>(name)) ?? null,
  setItem: async (name, value) => {
    await set(name, value);
  },
  removeItem: async (name) => {
    await del(name);
  }
};

interface AppActions {
  hydrated: boolean;
  setHydrated: (value: boolean) => void;
  registerAccount: (input: {
    username: string;
    password: string;
    displayName: string;
    role: UserRole;
    familyCode?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  createLinkedAccount: (input: {
    username: string;
    password: string;
    displayName: string;
    role: UserRole;
    familyCode?: string;
  }) => Promise<{ ok: boolean; error?: string; accountId?: string }>;
  loginAccount: (
    username: string,
    password: string
  ) => Promise<{ ok: boolean; error?: string }>;
  switchAccount: (
    accountId: string
  ) => Promise<{ ok: boolean; error?: string }>;
  verifyAccountPassword: (
    accountId: string,
    password: string
  ) => Promise<boolean>;
  deleteLinkedAccount: (
    accountId: string,
    password: string
  ) => Promise<{ ok: boolean; error?: string }>;
  activateFamilyCode: (
    familyCode: string
  ) => { ok: boolean; error?: string };
  logoutAccount: () => void;
  verifyCurrentPassword: (password: string) => Promise<boolean>;
  cancelCurrentAccount: () => void;
  clearFamilyAccountData: (familyCode: string) => void;
  setRole: (role: UserRole) => void;
  setFamilyCode: (familyCode: string) => void;
  updateProfile: (profile: Partial<ElderProfile>) => void;
  updateConsent: (consent: Partial<ConsentSettings>) => void;
  updatePreferences: (preferences: Partial<AppPreferences>) => void;
  updateEmergencyContacts: (contacts: EmergencyContact[]) => void;
  mergeFamilyEmergencyContacts: (contacts: EmergencyContact[]) => void;
  addFamilyAlert: (alert: FamilyAlert) => void;
  markFamilyAlertHandled: (id: string) => void;
  saveIntakeDraft: (draft: IntakeDraft) => void;
  clearIntakeDraft: () => void;
  addMedication: (medication: Medication, riskCheck: RiskCheck) => void;
  updateMedication: (id: string, patch: Partial<Medication>) => void;
  deleteMedication: (id: string) => void;
  addRiskCheck: (riskCheck: RiskCheck) => void;
  updateDose: (
    medicationId: string,
    scheduledAt: string,
    status: DoseStatus,
    doseId: string
  ) => void;
  addChatMessage: (message: ChatMessage, conversationId?: string) => void;
  replaceChatMessage: (
    id: string,
    message: ChatMessage,
    conversationId?: string
  ) => void;
  createConversation: () => string;
  setActiveConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  setConversationMedicineContext: (
    draft?: IntakeDraft,
    conversationId?: string
  ) => void;
  addAuditEvent: (
    type: AuditEvent["type"],
    summary: string,
    metadata?: AuditEvent["metadata"]
  ) => void;
  markSynced: (revision?: number) => void;
  clearAllData: () => Promise<void>;
  exportSnapshot: () => string;
  getCloudSnapshot: () => CloudSnapshot;
  mergeFamilySummary: (snapshot: CloudSnapshot) => void;
}

export type AppStore = AppState & AppActions;

const initial = createInitialState();

export const useAppStore = create<AppStore>()(
  persist(
    (setState, getState) => ({
      ...initial,
      hydrated: false,
      setHydrated: (hydrated) => setState({ hydrated }),
      registerAccount: async ({
        username,
        password,
        displayName,
        role,
        familyCode
      }) => {
        const normalizedUsername = username.trim().toLowerCase();
        if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]{3,24}$/u.test(normalizedUsername)) {
          return {
            ok: false,
            error: "账号需为 3 到 24 位中文、字母、数字或下划线"
          };
        }
        if (password.length < 6) {
          return { ok: false, error: "密码至少需要 6 位" };
        }
        const state = getState();
        if (
          state.accounts.some(
            (account) => account.username === normalizedUsername
          )
        ) {
          return { ok: false, error: "这个账号已经注册，请直接登录" };
        }
        const cleanFamilyCode = normalizeFamilyCode(
          familyCode || state.familyCode
        );
        if (cleanFamilyCode.length < 6) {
          return {
            ok: false,
            error:
              role === "elder"
                ? "请设置 6 到 8 位家庭连接码"
                : "请输入老人端提供的 6 到 8 位家庭连接码"
          };
        }
        let serverSession: AccountSessionResponse;
        try {
          serverSession = await registerServerAccount({
            username: normalizedUsername,
            password,
            displayName: displayName.trim() || normalizedUsername,
            role,
            familyCode: cleanFamilyCode
          });
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "无法连接账号服务，请稍后重试"
          };
        }
        const passwordRecord = await createPasswordRecord(password);
        const encryptedPassword = await encryptPassword(password, normalizedUsername);
        const cleanDisplayName = displayName.trim() || normalizedUsername;
        const account: LocalAccount = {
          ...accountFromServer(
            serverSession.account,
            undefined,
            serverSession.token
          ),
          ...passwordRecord,
          encryptedPassword,
          displayName: cleanDisplayName
        };
        const latest = getState();
        const blankWorkspace = serverSession.snapshot
          ? workspaceFromCloud(serverSession.snapshot)
          : createBlankWorkspace(cleanFamilyCode);
        if (role === "elder") {
          blankWorkspace.profile = {
            ...blankWorkspace.profile,
            name: cleanDisplayName,
            healthProfileCompleted: false,
            healthProfilePromptSeen: false
          };
        }
        const workspaces = {
          ...saveActiveWorkspace(latest),
          [workspaceKey(account.id, cleanFamilyCode)]: blankWorkspace
        };
        const registrationAudit = auditEvent(
          "settings-updated",
          `注册并登录${role === "elder" ? "老人端" : "家属端"}账号`
        );
        setState((current) => ({
          ...workspacePatch(blankWorkspace),
          accounts: mergeServerAccounts(
            current.accounts,
            serverSession.accounts,
            serverSession.account.id,
            serverSession.token
          ).map((item) =>
            item.id === account.id
              ? { ...item, ...passwordRecord, displayName: cleanDisplayName }
              : item
          ),
          workspaces,
          sessionAccountId: account.id,
          role,
          auditEvents: [
            registrationAudit,
            ...blankWorkspace.auditEvents
          ].slice(0, 100)
        }));
        return { ok: true };
      },
      createLinkedAccount: async ({
        username,
        password,
        displayName,
        role,
        familyCode
      }) => {
        const normalizedUsername = username.trim().toLowerCase();
        if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]{3,24}$/u.test(normalizedUsername)) {
          return {
            ok: false,
            error: "账号需为 3 到 24 位中文、字母、数字或下划线"
          };
        }
        if (password.length < 6) {
          return { ok: false, error: "密码至少需要 6 位" };
        }
        const state = getState();
        const currentAccount = state.accounts
          .map(normalizeAccount)
          .find((account) => account.id === state.sessionAccountId);
        if (!currentAccount) {
          return { ok: false, error: "请先登录当前账号" };
        }
        if (
          state.accounts.some(
            (account) => account.username === normalizedUsername
          )
        ) {
          return { ok: false, error: "这个账号已经注册，请换一个账号" };
        }
        if (role === "elder" && currentAccount.role !== "family") {
          return {
            ok: false,
            error: "只有家属账号可以新建老人档案"
          };
        }
        const targetFamilyCode =
          role === "family"
            ? currentAccount.familyCode
            : normalizeFamilyCode(familyCode || "");
        if (targetFamilyCode.length < 6) {
          return {
            ok: false,
            error: "新老人档案需要设置 6 到 8 位家庭连接码"
          };
        }
        if (
          role === "elder" &&
          state.accounts.some(
            (account) =>
              getLinkedFamilyCodes(account).includes(targetFamilyCode) &&
              account.role === "elder"
          )
        ) {
          return {
            ok: false,
            error: "这个连接码已经对应其他老人，请换一个连接码"
          };
        }
        if (!currentAccount.sessionToken) {
          return {
            ok: false,
            error: "账号会话已失效，请重新登录后再添加账号"
          };
        }
        let serverResult: {
          account: ServerAccount;
          accounts: ServerAccount[];
        };
        try {
          serverResult = await createServerLinkedAccount(
            currentAccount.sessionToken,
            {
              username: normalizedUsername,
              password,
              displayName: displayName.trim() || normalizedUsername,
              role,
              familyCode: targetFamilyCode
            }
          );
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "账号添加失败，请稍后重试"
          };
        }
        const passwordRecord = await createPasswordRecord(password);
        const encryptedPassword = await encryptPassword(password, normalizedUsername);
        const cleanDisplayName = displayName.trim() || normalizedUsername;
        const account = {
          ...accountFromServer(serverResult.account),
          ...passwordRecord,
          encryptedPassword,
          displayName: cleanDisplayName
        };
        let accounts = mergeServerAccounts(
          state.accounts,
          serverResult.accounts,
          currentAccount.serverAccountId || "",
          currentAccount.sessionToken
        );
        if (!accounts.some((item) => item.id === account.id)) {
          accounts = [...accounts, account];
        }
        let workspaces = state.workspaces;
        if (role === "elder") {
          const blankWorkspace = createBlankWorkspace(targetFamilyCode);
          blankWorkspace.profile = {
            ...blankWorkspace.profile,
            name: cleanDisplayName
          };
          workspaces = {
            ...workspaces,
            [workspaceKey(account.id, targetFamilyCode)]: blankWorkspace
          };
        }
        setState({
          accounts,
          workspaces,
          auditEvents: [
            auditEvent(
              "settings-updated",
              `新增${role === "elder" ? "老人档案" : "家属账号"}：${cleanDisplayName}`,
              { familyCode: targetFamilyCode }
            ),
            ...state.auditEvents
          ].slice(0, 100)
        });
        return { ok: true, accountId: account.id };
      },
      loginAccount: async (username, password) => {
        const normalizedUsername = username.trim().toLowerCase();
        const state = getState();
        const localAccount = state.accounts.find(
          (item) => item.username === normalizedUsername
        );
        const localPasswordValid = localAccount
          ? await verifyPassword(
              password,
              localAccount.passwordHash,
              localAccount.passwordSalt
            )
          : false;
        let serverSession: AccountSessionResponse | undefined;
        let serverError = "";

        try {
          serverSession = await loginServerAccount(
            normalizedUsername,
            password
          );
        } catch (error) {
          serverError =
            error instanceof Error ? error.message : "无法连接账号服务";
        }

        if (!serverSession && localAccount && localPasswordValid) {
          try {
            serverSession = await registerServerAccount({
              username: localAccount.username,
              password,
              displayName: localAccount.displayName,
              role: localAccount.role,
              familyCode: localAccount.familyCode
            });
          } catch {
            // Existing local accounts remain usable while the account service is
            // temporarily unavailable.
          }
        }

        if (serverSession) {
          const accounts = mergeServerAccounts(
            state.accounts,
            serverSession.accounts,
            serverSession.account.id,
            serverSession.token
          );
          const accountIdx = accounts.findIndex(
            (item) => item.serverAccountId === serverSession!.account.id
          );
          if (accountIdx < 0) return { ok: false, error: "账号数据不完整" };
          // 登录成功后写本地密码 hash，确保以后可在本地验证密码（删除账号等场景）
          const currentPasswordRecord = await createPasswordRecord(password);
          const encryptedPassword = await encryptPassword(
            password,
            accounts[accountIdx].username
          );
          const account = {
            ...accounts[accountIdx],
            ...currentPasswordRecord,
            encryptedPassword
          };
          accounts[accountIdx] = account;
          const workspaces = saveActiveWorkspace(state);
          const targetKey = workspaceKey(account.id, account.familyCode);
          const existingWorkspace = workspaces[targetKey];
          const targetWorkspace =
            existingWorkspace ||
            (serverSession.snapshot
              ? workspaceFromCloud(serverSession.snapshot)
              : createBlankWorkspace(account.familyCode));
          setState({
            ...workspacePatch(targetWorkspace),
            accounts,
            workspaces: {
              ...workspaces,
              [targetKey]: targetWorkspace
            },
            sessionAccountId: account.id,
            role: account.role,
            auditEvents: [
              auditEvent(
                "settings-updated",
                `登录${account.role === "elder" ? "老人端" : "家属端"}账号`
              ),
              ...targetWorkspace.auditEvents
            ].slice(0, 100)
          });
          return { ok: true };
        }

        if (localAccount && localPasswordValid) {
          const workspaces = saveActiveWorkspace(state);
          const targetKey = workspaceKey(
            localAccount.id,
            localAccount.familyCode
          );
          const targetWorkspace =
            workspaces[targetKey] ??
            createBlankWorkspace(localAccount.familyCode);
          setState({
            ...workspacePatch(targetWorkspace),
            workspaces: {
              ...workspaces,
              [targetKey]: targetWorkspace
            },
            sessionAccountId: localAccount.id,
            role: localAccount.role,
            auditEvents: [
              auditEvent("settings-updated", "使用本地账号登录"),
              ...targetWorkspace.auditEvents
            ].slice(0, 100)
          });
          return { ok: true };
        }

        return {
          ok: false,
          error: serverError || "账号或密码不正确"
        };
      },
      switchAccount: async (accountId) => {
        const state = getState();
        const selectedAccount = state.accounts
          .map(normalizeAccount)
          .find((item) => item.id === accountId);
        if (!selectedAccount) return { ok: false, error: "账号不存在" };
        const currentAccount = activeLocalAccount(
          state.accounts.map(normalizeAccount),
          state.sessionAccountId || ""
        );
        let serverSession: AccountSessionResponse | undefined;
        if (currentAccount?.sessionToken) {
          try {
            serverSession = await switchServerAccount(
              currentAccount.sessionToken,
              {
                accountId: selectedAccount.serverAccountId,
                username: selectedAccount.username
              }
            );
          } catch {
            // Local switching remains available as a temporary offline fallback.
          }
        }
        let accounts = state.accounts.map(normalizeAccount);
        let account = selectedAccount;
        if (serverSession) {
          accounts = mergeServerAccounts(
            accounts,
            serverSession.accounts,
            serverSession.account.id,
            serverSession.token
          );
          account =
            accounts.find(
              (item) => item.serverAccountId === serverSession!.account.id
            ) || selectedAccount;
        }
        const workspaces = saveActiveWorkspace(state);
        const targetKey = workspaceKey(account.id, account.familyCode);
        const existingWorkspace = workspaces[targetKey];
        const targetWorkspace =
          existingWorkspace ||
          (serverSession?.snapshot
            ? workspaceFromCloud(serverSession.snapshot)
            : createBlankWorkspace(account.familyCode));
        setState({
          ...workspacePatch(targetWorkspace),
          accounts,
          workspaces: {
            ...workspaces,
            [targetKey]: targetWorkspace
          },
          sessionAccountId: account.id,
          role: account.role,
          auditEvents: [
            auditEvent(
              "settings-updated",
              `切换为${account.displayName}的${
                account.role === "elder" ? "老人端" : "家属端"
              }`
            ),
            ...targetWorkspace.auditEvents
          ].slice(0, 100)
        });
        return { ok: true };
      },
      verifyAccountPassword: async (accountId, password) => {
        const state = getState();
        const account = state.accounts.find(
          (item) => item.id === accountId
        );
        if (!account) return false;
        // 优先用本地 hash 验证
        const localValid =
          Boolean(account.passwordHash) &&
          (await verifyPassword(
            password,
            account.passwordHash,
            account.passwordSalt
          ));
        if (localValid) return true;
        // 本地没有 hash 或验证失败，若有服务端账号则直接请求服务端验证
        if (!account.serverAccountId) return false;
        return verifyServerAccountPassword({
          token: "",
          accountId: account.serverAccountId,
          password
        });
      },
      deleteLinkedAccount: async (accountId, password) => {
        const state = getState();
        const targetAccount = state.accounts
          .map(normalizeAccount)
          .find((account) => account.id === accountId);
        if (!targetAccount) {
          return { ok: false, error: "找不到这个账号" };
        }
        // 服务端账号：尽力调后端删除，失败不阻断（密码已由上层 verifyAccountPassword 验证）
        if (targetAccount.serverAccountId) {
          try {
            await deleteServerAccount({
              token: "",
              accountId: targetAccount.serverAccountId,
              password
            });
          } catch {
            // 后端删除失败不阻断本地删除，用户在当前设备仍能删除
          }
        } else {
          // 纯本地账号：本地 hash 验证
          const valid = await verifyPassword(
            password,
            targetAccount.passwordHash,
            targetAccount.passwordSalt
          );
          if (!valid) {
            return { ok: false, error: "密码不正确，账号尚未删除" };
          }
        }

        const latest = getState();
        let accounts = latest.accounts
          .map(normalizeAccount)
          .filter((account) => account.id !== targetAccount.id);
        let workspaces = removeAccountWorkspaces(latest.workspaces, [
          targetAccount.id
        ]);

        if (targetAccount.role === "elder") {
          const deletedFamilyCode = targetAccount.familyCode;
          accounts = accounts.map((account) => {
            if (account.role !== "family") return account;
            const remainingCodes = getLinkedFamilyCodes(account).filter(
              (code) => code !== deletedFamilyCode
            );
            if (!remainingCodes.length) {
              return {
                ...account,
                linkedFamilyCodes: []
              };
            }
            return normalizeAccount({
              ...account,
              familyCode:
                account.familyCode === deletedFamilyCode
                  ? remainingCodes[0]
                  : account.familyCode,
              linkedFamilyCodes: remainingCodes
            });
          });
          workspaces = Object.fromEntries(
            Object.entries(workspaces).filter(
              ([key]) => !key.endsWith(`::${deletedFamilyCode}`)
            )
          );
        }

        const wasCurrent = latest.sessionAccountId === targetAccount.id;
        setState({
          accounts,
          workspaces,
          sessionAccountId: wasCurrent
            ? undefined
            : latest.sessionAccountId,
          auditEvents: [
            auditEvent(
              "data-deleted",
              `删除${targetAccount.role === "elder" ? "老人" : "家属"}账号：${targetAccount.displayName}`,
              { familyCode: targetAccount.familyCode }
            ),
            ...latest.auditEvents
          ].slice(0, 100)
        });
        return { ok: true };
      },
      activateFamilyCode: (familyCode) => {
        const clean = normalizeFamilyCode(familyCode);
        const state = getState();
        const account = state.accounts
          .map(normalizeAccount)
          .find((item) => item.id === state.sessionAccountId);
        if (!account || account.role !== "family") {
          return { ok: false, error: "只有家属账号可以切换老人档案" };
        }
        if (!getLinkedFamilyCodes(account).includes(clean)) {
          return { ok: false, error: "当前账号没有关联这个家庭连接码" };
        }
        const workspaces = saveActiveWorkspace(state);
        const targetKey = workspaceKey(account.id, clean);
        const targetWorkspace =
          workspaces[targetKey] ?? createBlankWorkspace(clean);
        setState({
          ...workspacePatch(targetWorkspace),
          accounts: state.accounts.map((item) =>
            normalizeAccount(
              item.id === account.id ? { ...item, familyCode: clean } : item
            )
          ),
          workspaces: {
            ...workspaces,
            [targetKey]: targetWorkspace
          },
          sessionAccountId: account.id,
          role: "family",
          auditEvents: [
            auditEvent("settings-updated", `切换正在查看的老人档案：${clean}`),
            ...targetWorkspace.auditEvents
          ].slice(0, 100)
        });
        return { ok: true };
      },
      logoutAccount: () => {
        const state = getState();
        const account = activeLocalAccount(
          state.accounts,
          state.sessionAccountId || ""
        );
        if (account?.sessionToken) {
          void logoutServerAccount(account.sessionToken).catch(() => undefined);
        }
        setState((current) => ({
          workspaces: saveActiveWorkspace(current),
          sessionAccountId: undefined,
          auditEvents: [
            auditEvent("settings-updated", "退出当前账号，数据已保留"),
            ...current.auditEvents
          ].slice(0, 100)
        }));
      },
      verifyCurrentPassword: async (password) => {
        const state = getState();
        const account = state.accounts.find(
          (item) => item.id === state.sessionAccountId
        );
        if (!account) return false;
        return state.verifyAccountPassword(account.id, password);
      },
      cancelCurrentAccount: () =>
        setState((state) => {
          const account = state.accounts.find(
            (item) => item.id === state.sessionAccountId
          );
          if (!account) return state;
          const accounts = state.accounts.filter(
            (item) => item.id !== account.id
          );
          const workspaces = removeAccountWorkspaces(state.workspaces, [
            account.id
          ]);
          if (account.role === "family") {
            return {
              accounts,
              workspaces,
              sessionAccountId: undefined,
              auditEvents: [
                auditEvent("data-deleted", "注销家属账号，老人档案继续保留"),
                ...state.auditEvents
              ].slice(0, 100)
            };
          }
          return {
            ...createInitialState({ role: "elder" }),
            accounts,
            workspaces,
            sessionAccountId: undefined,
            hydrated: true,
            auditEvents: [
              auditEvent(
                "data-deleted",
                "注销老人账号并删除老人健康数据，家属账号保留"
              )
            ]
          };
        }),
      clearFamilyAccountData: (familyCode) =>
        setState((state) => {
          const account = state.accounts.find(
            (item) => item.id === state.sessionAccountId
          );
          const cleanFamilyCode = normalizeFamilyCode(familyCode);
          const removedAccounts = state.accounts.filter((item) =>
            getLinkedFamilyCodes(item).includes(cleanFamilyCode)
          );
          const accounts = state.accounts.filter(
            (item) => !getLinkedFamilyCodes(item).includes(cleanFamilyCode)
          );
          return {
            ...createInitialState({ role: "elder" }),
            accounts,
            workspaces: removeAccountWorkspaces(
              state.workspaces,
              removedAccounts.map((item) => item.id)
            ),
            sessionAccountId: undefined,
            hydrated: true,
            auditEvents: [
              auditEvent(
                "data-deleted",
                `注销账号并删除家庭 ${cleanFamilyCode}`,
                { account: account?.username || "family" }
              )
            ]
          };
        }),
      setRole: (role) =>
        setState((state) => {
          const account = state.accounts.find(
            (item) => item.id === state.sessionAccountId
          );
          if (!account || account.role !== role) return state;
          return {
            role,
            auditEvents: [
              auditEvent(
                "settings-updated",
                `恢复${role === "elder" ? "老人端" : "家属端"}登录身份`
              ),
              ...state.auditEvents
            ].slice(0, 100)
          };
        }),
      setFamilyCode: (familyCode) =>
        setState((state) => {
          const clean = normalizeFamilyCode(familyCode);
          const account = state.accounts
            .map(normalizeAccount)
            .find((item) => item.id === state.sessionAccountId);
          if (!account) return state;
          const workspaces = saveActiveWorkspace(state);
          const targetKey = workspaceKey(account.id, clean);
          const targetWorkspace =
            workspaces[targetKey] ?? createBlankWorkspace(clean);
          return {
            ...workspacePatch(targetWorkspace),
            accounts: state.accounts.map((item) =>
              item.id === account.id
                ? normalizeAccount({
                    ...item,
                    familyCode: clean,
                    linkedFamilyCodes: Array.from(
                      new Set([
                        ...getLinkedFamilyCodes(account),
                        clean
                      ])
                    )
                  })
                : normalizeAccount(item)
            ),
            workspaces: {
              ...workspaces,
              [targetKey]: targetWorkspace
            }
          };
        }),
      updateProfile: (profile) =>
        setState((state) => ({
          profile: { ...state.profile, ...profile }
        })),
      updateConsent: (consent) =>
        setState((state) => ({
          consent: { ...state.consent, ...consent },
          auditEvents: [
            auditEvent("settings-updated", "更新家属共享范围"),
            ...state.auditEvents
          ].slice(0, 100)
        })),
      updatePreferences: (preferences) =>
        setState((state) => ({
          preferences: { ...state.preferences, ...preferences }
        })),
      updateEmergencyContacts: (emergencyContacts) =>
        setState((state) => ({
          emergencyContacts,
          auditEvents: [
            auditEvent("settings-updated", "更新紧急联系人"),
            ...state.auditEvents
          ].slice(0, 100)
        })),
      mergeFamilyEmergencyContacts: (emergencyContacts) =>
        setState((state) => {
          if (
            JSON.stringify(state.emergencyContacts) ===
            JSON.stringify(emergencyContacts)
          ) {
            return {};
          }
          return {
            emergencyContacts,
            lastSyncedAt: nowIso()
          };
        }),
      addFamilyAlert: (alert) =>
        setState((state) => ({
          familyAlerts: pruneHandledAlerts([
            alert,
            ...state.familyAlerts.filter((item) => item.id !== alert.id)
          ]).slice(0, 100),
          lastLocalSaveAt: nowIso()
        })),
      markFamilyAlertHandled: (id) =>
        setState((state) => {
          const account = state.accounts.find(
            (item) => item.id === state.sessionAccountId
          );
          return {
            familyAlerts: state.familyAlerts.map((alert) =>
              alert.id === id
                ? {
                    ...alert,
                    handledAt: nowIso(),
                    handledBy: account?.displayName || "家属"
                  }
                : alert
            )
          };
        }),
      saveIntakeDraft: (intakeDraft) =>
        setState({
          intakeDraft,
          lastLocalSaveAt: nowIso()
        }),
      clearIntakeDraft: () => setState({ intakeDraft: undefined }),
      addMedication: (medication, riskCheck) =>
        setState((state) => ({
          medications: [medication, ...state.medications],
          riskChecks: [riskCheck, ...state.riskChecks].slice(0, 50),
          intakeDraft: undefined,
          lastLocalSaveAt: nowIso(),
          auditEvents: [
            auditEvent(
              "medication-added",
              `新增药物并完成风险核查：${medication.name}`,
              { riskLevel: riskCheck.level }
            ),
            ...state.auditEvents
          ].slice(0, 100)
        })),
      updateMedication: (id, patch) =>
        setState((state) => ({
          medications: state.medications.map((medication) =>
            medication.id === id
              ? { ...medication, ...patch, updatedAt: nowIso() }
              : medication
          ),
          auditEvents: [
            auditEvent(
              "medication-updated",
              `修改药物信息：${
                state.medications.find((item) => item.id === id)?.name ?? id
              }`
            ),
            ...state.auditEvents
          ].slice(0, 100)
        })),
      deleteMedication: (id) =>
        setState((state) => {
          const medication = state.medications.find((item) => item.id === id);
          return {
            medications: state.medications.filter((item) => item.id !== id),
            doseEvents: state.doseEvents.filter(
              (dose) => dose.medicationId !== id
            ),
            riskChecks: state.riskChecks.filter(
              (riskCheck) => !riskCheck.involvedMedicationIds.includes(id)
            ),
            auditEvents: [
              auditEvent(
                "medication-updated",
                `删除药物：${medication?.name ?? id}`
              ),
              ...state.auditEvents
            ].slice(0, 100)
          };
        }),
      addRiskCheck: (riskCheck) =>
        setState((state) => ({
          riskChecks: [riskCheck, ...state.riskChecks].slice(0, 50),
          auditEvents: [
            auditEvent(
              "risk-checked",
              `完成风险核查：${riskCheck.title}`,
              { riskLevel: riskCheck.level }
            ),
            ...state.auditEvents
          ].slice(0, 100)
        })),
      updateDose: (medicationId, scheduledAt, status, doseId) =>
        setState((state) => {
          const event: DoseEvent = {
            id: doseId,
            medicationId,
            scheduledAt,
            status,
            updatedAt: nowIso()
          };
          return {
            doseEvents: [
              event,
              ...state.doseEvents.filter((item) => item.id !== doseId)
            ].slice(0, 500),
            lastLocalSaveAt: nowIso(),
            auditEvents: [
              auditEvent(
                "dose-updated",
                `更新服药状态：${status}`,
                { medicationId, scheduledAt }
              ),
              ...state.auditEvents
            ].slice(0, 100)
          };
        }),
      addChatMessage: (message, requestedConversationId) =>
        setState((state) => {
          const activeId =
            requestedConversationId ||
            state.activeConversationId ||
            state.conversations[0]?.id;
          const existing =
            state.conversations.find((item) => item.id === activeId) ??
            createConversationRecord();
          const shouldRename =
            message.role === "user" &&
            (existing.title === "新对话" ||
              existing.title === "新的用药咨询" ||
              existing.messages.length === 0);
          const updated: Conversation = {
            ...existing,
            title: shouldRename
              ? titleFromQuestion(message.content)
              : existing.title,
            updatedAt: message.createdAt,
            messages: [...existing.messages, message].slice(-120)
          };
          const conversations = [
            updated,
            ...state.conversations.filter((item) => item.id !== updated.id)
          ];
          return {
            conversations,
            activeConversationId: requestedConversationId
              ? state.activeConversationId
              : updated.id,
            riskChecks: message.riskCheck
              ? [message.riskCheck, ...state.riskChecks].slice(0, 50)
              : state.riskChecks
          };
        }),
      replaceChatMessage: (id, message, requestedConversationId) =>
        setState((state) => ({
          conversations: state.conversations.map((conversation) =>
            conversation.id ===
            (requestedConversationId || state.activeConversationId)
              ? {
                  ...conversation,
                  updatedAt: nowIso(),
                  messages: conversation.messages.map((item) =>
                    item.id === id ? message : item
                  )
                }
              : conversation
          ),
          riskChecks: message.riskCheck
            ? [message.riskCheck, ...state.riskChecks].slice(0, 50)
            : state.riskChecks
        })),
      createConversation: () => {
        const conversation = createConversationRecord();
        setState((state) => ({
          conversations: [conversation, ...state.conversations],
          activeConversationId: conversation.id
        }));
        return conversation.id;
      },
      setActiveConversation: (id) =>
        setState((state) =>
          state.conversations.some((item) => item.id === id)
            ? { activeConversationId: id }
            : state
        ),
      deleteConversation: (id) =>
        setState((state) => {
          const remaining = state.conversations.filter(
            (conversation) => conversation.id !== id
          );
          const replacement =
            remaining[0] ?? createConversationRecord();
          const conversations = remaining.length ? remaining : [replacement];
          return {
            conversations,
            activeConversationId:
              state.activeConversationId === id
                ? replacement.id
                : state.activeConversationId,
            auditEvents: [
              auditEvent("settings-updated", "删除一条问药对话记录"),
              ...state.auditEvents
            ].slice(0, 100)
          };
        }),
      setConversationMedicineContext: (draft, conversationId) =>
        setState((state) => ({
          conversations: state.conversations.map((conversation) =>
            conversation.id ===
            (conversationId || state.activeConversationId)
              ? { ...conversation, medicineContext: draft }
              : conversation
          )
        })),
      addAuditEvent: (type, summary, metadata) =>
        setState((state) => ({
          auditEvents: [
            auditEvent(type, summary, metadata),
            ...state.auditEvents
          ].slice(0, 100)
        })),
      markSynced: (cloudRevision) =>
        setState({
          lastSyncedAt: nowIso(),
          cloudRevision
        }),
      clearAllData: async () => {
        await indexedDbStorage.removeItem(STORAGE_NAME);
        const currentRole = getState().role;
        const replacement = createInitialState({
          familyCode: getState().familyCode,
          role: currentRole
        });
        setState({
          ...replacement,
          role: currentRole,
          auditEvents: [
            auditEvent("data-deleted", "删除本地用药档案")
          ],
          hydrated: true
        });
      },
      exportSnapshot: () => {
        const state = getState();
        return JSON.stringify(
          {
            exportedAt: nowIso(),
            familyCode: state.familyCode,
            profile: state.profile,
            emergencyContacts: state.emergencyContacts,
            medications: state.medications,
            doseEvents: state.doseEvents,
            riskChecks: state.riskChecks,
            consent: state.consent,
            auditEvents: state.auditEvents
          },
          null,
          2
        );
      },
      getCloudSnapshot: () => {
        const state = getState();
        const visibleMedications = state.medications.filter(
          (medication) => medication.status !== "stopped"
        );
        return {
          version: 1,
          familyCode: state.familyCode,
          updatedAt: nowIso(),
          elderName: state.profile.name,
          profile: {
            age: state.profile.age,
            conditions: state.consent.shareMedicationSummary
              ? state.profile.conditions
              : [],
            allergies: state.consent.shareMedicationSummary
              ? state.profile.allergies
              : [],
            timeZone: state.profile.timeZone || "Asia/Shanghai",
            visionPreference: state.profile.visionPreference,
            healthProfileCompleted: state.profile.healthProfileCompleted,
            healthProfilePromptSeen: state.profile.healthProfilePromptSeen,
            voiceEnabled: state.profile.voiceEnabled
          },
          consent: state.consent,
          medications: state.consent.shareMedicationSummary
            ? visibleMedications.map((medication) => ({
                ...medication,
                source: {
                  ...medication.source,
                  imageDataUrl: undefined
                }
              }))
            : [],
          doseEvents: state.consent.shareMissedDose
            ? state.doseEvents.slice(0, 100)
            : [],
          riskChecks: state.consent.shareHighRisk
            ? state.riskChecks.slice(0, 20)
            : state.riskChecks
                .filter((riskCheck) => riskCheck.level !== "high")
                .slice(0, 20),
          emergencyContacts: state.emergencyContacts,
          familyAlerts: state.consent.shareEmergency
            ? pruneHandledAlerts(state.familyAlerts).slice(0, 100)
            : [],
          conversations: state.conversations.map((conversation) => ({
            ...conversation,
            messages: conversation.messages.map((message) => ({
              ...message,
              imageDataUrls: undefined
            }))
          })),
          preferences: {
            ...state.preferences,
            customVoices: [...state.preferences.customVoices]
          },
          intakeDraft: state.intakeDraft
            ? {
                ...state.intakeDraft,
                imageDataUrl: undefined
              }
            : undefined
        };
      },
      mergeFamilySummary: (snapshot) =>
        setState((state) => {
          const familyAlerts = pruneHandledAlerts(
            snapshot.familyAlerts ?? state.familyAlerts
          );
          const next = {
          profile: {
            ...state.profile,
            name: snapshot.elderName,
            age: snapshot.profile.age,
            conditions: snapshot.profile.conditions,
            allergies: snapshot.profile.allergies,
            timeZone: snapshot.profile.timeZone || state.profile.timeZone,
            visionPreference:
              snapshot.profile.visionPreference ?? state.profile.visionPreference,
            healthProfileCompleted:
              snapshot.profile.healthProfileCompleted ??
              state.profile.healthProfileCompleted,
            healthProfilePromptSeen:
              snapshot.profile.healthProfilePromptSeen ??
              state.profile.healthProfilePromptSeen,
            voiceEnabled:
              snapshot.profile.voiceEnabled ?? state.profile.voiceEnabled
          },
          medications: snapshot.medications,
          doseEvents: snapshot.doseEvents,
          riskChecks: snapshot.riskChecks,
          emergencyContacts: snapshot.emergencyContacts,
          familyAlerts,
          consent: snapshot.consent,
          conversations: snapshot.conversations ?? state.conversations,
          preferences: snapshot.preferences
            ? {
                ...state.preferences,
                ...snapshot.preferences,
                customVoices:
                  snapshot.preferences.customVoices ??
                  state.preferences.customVoices
              }
            : state.preferences,
          intakeDraft: snapshot.intakeDraft ?? state.intakeDraft,
          lastSyncedAt: snapshot.updatedAt,
          hydrated: true
          };
          const mergedState = { ...state, ...next };
          return {
            ...next,
            workspaces: state.sessionAccountId
              ? {
                  ...state.workspaces,
                  [workspaceKey(
                    state.sessionAccountId,
                    snapshot.familyCode
                  )]: captureWorkspace(mergedState)
                }
              : state.workspaces
          };
        })
    }),
    {
      name: STORAGE_NAME,
      storage: createJSONStorage(() => indexedDbStorage),
      version: 1,
      merge: (persisted, current) => {
        const saved = persisted as Partial<AppStore>;
        const legacyMessages = (
          saved as unknown as { chatMessages?: ChatMessage[] }
        ).chatMessages;
        const legacyFirstQuestion = legacyMessages?.find(
          (message) => message.role === "user"
        )?.content;
        const migratedConversation = createConversationRecord(
          legacyFirstQuestion
            ? titleFromQuestion(legacyFirstQuestion)
            : "新的用药咨询"
        );
        migratedConversation.messages = legacyMessages ?? [];
        const conversations =
          saved.conversations?.length
            ? saved.conversations.map((conversation) => ({
                ...conversation,
                messages: Array.isArray(conversation.messages)
                  ? conversation.messages
                  : []
              }))
            : legacyMessages?.length
              ? [migratedConversation]
              : current.conversations;
        const activeConversationId = conversations.some(
          (conversation) =>
            conversation.id === saved.activeConversationId
        )
          ? saved.activeConversationId!
          : conversations[0].id;
        return {
          ...current,
          ...saved,
          conversations,
          activeConversationId,
          accounts: (saved.accounts ?? current.accounts).map(normalizeAccount),
          workspaces: saved.workspaces ?? current.workspaces,
          preferences: {
            ...current.preferences,
            ...saved.preferences,
            voiceMode:
              saved.preferences?.voiceMode ?? current.preferences.voiceMode,
            customVoices: (
              saved.preferences?.customVoices ??
              (saved.preferences?.customVoiceId
                ? [
                    {
                      id: saved.preferences.customVoiceId,
                      name:
                        saved.preferences.customVoiceName || "我的专属音色",
                      createdAt: nowIso()
                    }
                  ]
                : current.preferences.customVoices)
            ).map((voice, index) => ({
              ...voice,
              name: `我的专属音色 ${index + 1}`
            })),
            fontScale:
              saved.preferences?.fontScale ?? current.preferences.fontScale,
            remindersEnabled:
              saved.preferences?.remindersEnabled ??
              current.preferences.remindersEnabled
          },
          medications: (saved.medications ?? current.medications)
            .filter(
              (medication) =>
                medication.source?.title !== legacyDefaultMedicationSource
            )
            .map((medication) => ({
              ...medication,
              reminderEnabled: medication.reminderEnabled !== false
            })),
          profile: {
            ...current.profile,
            ...saved.profile,
            healthProfileCompleted:
              saved.profile?.healthProfileCompleted ?? false,
            healthProfilePromptSeen:
              saved.profile?.healthProfilePromptSeen ?? false,
            timeZone:
              saved.profile?.timeZone ||
              Intl.DateTimeFormat().resolvedOptions().timeZone ||
              "Asia/Shanghai"
          },
          familyAlerts: pruneHandledAlerts(saved.familyAlerts ?? [])
        };
      },
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      }
    }
  )
);

// Ensure an IDB read failure does not leave the interface permanently in a loading state.
if (typeof window !== "undefined") {
  window.setTimeout(() => {
    if (!useAppStore.getState().hydrated) {
      useAppStore.getState().setHydrated(true);
    }
  }, 1500);
}
