import { createInitialState } from "../data/seed";
import type {
  AccountWorkspace,
  AppState,
  LocalAccount
} from "../types";

export function normalizeFamilyCode(value: string): string {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

export function getLinkedFamilyCodes(account: LocalAccount): string[] {
  const storedCodes = Array.isArray(account.linkedFamilyCodes)
    ? account.linkedFamilyCodes
    : [account.familyCode];
  return Array.from(
    new Set(
      storedCodes
        .map(normalizeFamilyCode)
        .filter(Boolean)
    )
  );
}

export function workspaceKey(accountId: string, familyCode: string): string {
  return `${accountId}::${normalizeFamilyCode(familyCode)}`;
}

export function captureWorkspace(state: AppState): AccountWorkspace {
  return {
    familyCode: state.familyCode,
    profile: { ...state.profile },
    emergencyContacts: [...state.emergencyContacts],
    consent: { ...state.consent },
    medications: [...state.medications],
    doseEvents: [...state.doseEvents],
    riskChecks: [...state.riskChecks],
    conversations: [...state.conversations],
    activeConversationId: state.activeConversationId,
    intakeDraft: state.intakeDraft,
    auditEvents: [...state.auditEvents],
    familyAlerts: [...state.familyAlerts],
    preferences: {
      ...state.preferences,
      customVoices: [...state.preferences.customVoices]
    },
    lastLocalSaveAt: state.lastLocalSaveAt,
    lastSyncedAt: state.lastSyncedAt,
    cloudRevision: state.cloudRevision
  };
}

export function workspacePatch(
  workspace: AccountWorkspace
): Pick<
  AppState,
  | "familyCode"
  | "profile"
  | "emergencyContacts"
  | "consent"
  | "medications"
  | "doseEvents"
  | "riskChecks"
  | "conversations"
  | "activeConversationId"
  | "intakeDraft"
  | "auditEvents"
  | "familyAlerts"
  | "preferences"
  | "lastLocalSaveAt"
  | "lastSyncedAt"
  | "cloudRevision"
> {
  return {
    familyCode: workspace.familyCode,
    profile: workspace.profile,
    emergencyContacts: workspace.emergencyContacts,
    consent: workspace.consent,
    medications: workspace.medications,
    doseEvents: workspace.doseEvents,
    riskChecks: workspace.riskChecks,
    conversations: workspace.conversations,
    activeConversationId: workspace.activeConversationId,
    intakeDraft: workspace.intakeDraft,
    auditEvents: workspace.auditEvents,
    familyAlerts: workspace.familyAlerts,
    preferences: workspace.preferences,
    lastLocalSaveAt: workspace.lastLocalSaveAt,
    lastSyncedAt: workspace.lastSyncedAt,
    cloudRevision: workspace.cloudRevision
  };
}

export function createBlankWorkspace(familyCode: string): AccountWorkspace {
  return captureWorkspace(createInitialState({ familyCode }));
}

export function saveActiveWorkspace(
  state: AppState
): Record<string, AccountWorkspace> {
  if (!state.sessionAccountId) return state.workspaces;
  return {
    ...state.workspaces,
    [workspaceKey(state.sessionAccountId, state.familyCode)]:
      captureWorkspace(state)
  };
}
