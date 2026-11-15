import { get, set, del } from "idb-keyval";
import { create } from "zustand";
import {
  createJSONStorage,
  persist,
  type StateStorage
} from "zustand/middleware";
import { createInitialState } from "../data/seed";
import { createPasswordRecord, verifyPassword } from "../lib/auth";
import { createId } from "../lib/ids";
import { nowIso } from "../lib/time";
import type {
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
  loginAccount: (
    username: string,
    password: string
  ) => Promise<{ ok: boolean; error?: string }>;
  switchAccount: (accountId: string) => { ok: boolean; error?: string };
  logoutAccount: () => void;
  verifyCurrentPassword: (password: string) => Promise<boolean>;
  clearFamilyAccountData: (familyCode: string) => void;
  setRole: (role: UserRole) => void;
  setFamilyCode: (familyCode: string) => void;
  updateProfile: (profile: Partial<ElderProfile>) => void;
  updateConsent: (consent: Partial<ConsentSettings>) => void;
  updatePreferences: (preferences: Partial<AppPreferences>) => void;
  updateEmergencyContacts: (contacts: EmergencyContact[]) => void;
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
  replaceChatMessage: (id: string, message: ChatMessage) => void;
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
  resetDemo: () => void;
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
        const cleanFamilyCode = String(familyCode || state.familyCode)
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "")
          .slice(0, 8);
        if (cleanFamilyCode.length < 6) {
          return {
            ok: false,
            error:
              role === "elder"
                ? "请设置 6 到 8 位家庭连接码"
                : "请输入老人端提供的 6 到 8 位家庭连接码"
          };
        }
        const passwordRecord = await createPasswordRecord(password);
        const account: LocalAccount = {
          id: createId("account"),
          username: normalizedUsername,
          displayName: displayName.trim() || normalizedUsername,
          role,
          familyCode: cleanFamilyCode,
          ...passwordRecord,
          createdAt: nowIso()
        };
        setState((current) => ({
          accounts: [...current.accounts, account],
          sessionAccountId: account.id,
          role,
          familyCode: account.familyCode,
          profile:
            role === "elder" && account.displayName
              ? {
                  ...current.profile,
                  name: account.displayName,
                  healthProfileCompleted: false,
                  healthProfilePromptSeen: false
                }
              : current.profile,
          auditEvents: [
            auditEvent(
              "settings-updated",
              `注册并登录${role === "elder" ? "老人端" : "家属端"}账号`
            ),
            ...current.auditEvents
          ].slice(0, 100)
        }));
        return { ok: true };
      },
      loginAccount: async (username, password) => {
        const normalizedUsername = username.trim().toLowerCase();
        const account = getState().accounts.find(
          (item) => item.username === normalizedUsername
        );
        if (!account) return { ok: false, error: "账号或密码不正确" };
        const valid = await verifyPassword(
          password,
          account.passwordHash,
          account.passwordSalt
        );
        if (!valid) return { ok: false, error: "账号或密码不正确" };
        setState((current) => ({
          sessionAccountId: account.id,
          role: account.role,
          familyCode: account.familyCode,
          auditEvents: [
            auditEvent(
              "settings-updated",
              `登录${account.role === "elder" ? "老人端" : "家属端"}账号`
            ),
            ...current.auditEvents
          ].slice(0, 100)
        }));
        return { ok: true };
      },
      switchAccount: (accountId) => {
        const account = getState().accounts.find(
          (item) => item.id === accountId
        );
        if (!account) return { ok: false, error: "账号不存在" };
        setState((current) => ({
          sessionAccountId: account.id,
          role: account.role,
          familyCode: account.familyCode,
          auditEvents: [
            auditEvent(
              "settings-updated",
              `切换为${account.displayName}的${
                account.role === "elder" ? "老人端" : "家属端"
              }`
            ),
            ...current.auditEvents
          ].slice(0, 100)
        }));
        return { ok: true };
      },
      logoutAccount: () =>
        setState((state) => ({
          sessionAccountId: undefined,
          auditEvents: [
            auditEvent("settings-updated", "退出当前账号，数据已保留"),
            ...state.auditEvents
          ].slice(0, 100)
        })),
      verifyCurrentPassword: async (password) => {
        const state = getState();
        const account = state.accounts.find(
          (item) => item.id === state.sessionAccountId
        );
        if (!account || account.role !== "family") return false;
        return verifyPassword(
          password,
          account.passwordHash,
          account.passwordSalt
        );
      },
      clearFamilyAccountData: (familyCode) =>
        setState((state) => {
          const account = state.accounts.find(
            (item) => item.id === state.sessionAccountId
          );
          const accounts = state.accounts.filter(
            (item) => item.familyCode !== familyCode
          );
          return {
            ...createInitialState({ role: "elder" }),
            accounts,
            sessionAccountId: undefined,
            hydrated: true,
            auditEvents: [
              auditEvent(
                "data-deleted",
                `注销账号并删除家庭 ${familyCode}`,
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
          const clean = familyCode
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "")
            .slice(0, 8);
          return {
            familyCode: clean,
            accounts: state.accounts.map((account) =>
              account.id === state.sessionAccountId
                ? { ...account, familyCode: clean }
                : account
            )
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
      replaceChatMessage: (id, message) =>
        setState((state) => ({
          conversations: state.conversations.map((conversation) =>
            conversation.id === state.activeConversationId
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
      resetDemo: () => {
        const current = getState();
        setState({
          ...createInitialState({
            role: current.role,
            familyCode: current.familyCode
          }),
          role: current.role,
          familyCode: current.familyCode,
          accounts: current.accounts,
          sessionAccountId: current.sessionAccountId,
          hydrated: true
        });
      },
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
            auditEvent("data-deleted", "删除本地演示档案")
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
            timeZone: state.profile.timeZone || "Asia/Shanghai"
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
            : []
        };
      },
      mergeFamilySummary: (snapshot) =>
        setState((state) => ({
          profile: {
            ...state.profile,
            name: snapshot.elderName,
            age: snapshot.profile.age,
            conditions: snapshot.profile.conditions,
            allergies: snapshot.profile.allergies,
            timeZone: snapshot.profile.timeZone || state.profile.timeZone
          },
          medications: snapshot.medications,
          doseEvents: snapshot.doseEvents,
          riskChecks: snapshot.riskChecks,
          emergencyContacts: snapshot.emergencyContacts,
          familyAlerts: pruneHandledAlerts(
            snapshot.familyAlerts ?? state.familyAlerts
          ),
          consent: snapshot.consent,
          lastSyncedAt: snapshot.updatedAt,
          hydrated: true
        }))
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
          preferences: {
            ...current.preferences,
            ...saved.preferences,
            voiceMode: "warm",
            fontScale:
              saved.preferences?.fontScale ?? current.preferences.fontScale
          },
          medications: (saved.medications ?? current.medications)
            .filter(
              (medication) =>
                medication.source?.title !== "演示处方（已确认）"
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
