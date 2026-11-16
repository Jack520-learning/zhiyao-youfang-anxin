import { createInitialState } from "../data/seed";
import { collectTrackableRiskChecks } from "./riskTracking";
import { normalizeVoiceMode } from "./voiceDefaults";
import type {
  AccountWorkspace,
  AppState,
  CloudSnapshot,
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

export function workspaceFromCloud(
  snapshot: CloudSnapshot
): AccountWorkspace {
  const workspace = createBlankWorkspace(snapshot.familyCode);
  return {
    ...workspace,
    profile: {
      ...workspace.profile,
      name: snapshot.elderName || "",
      age: snapshot.profile.age || 0,
      conditions: snapshot.profile.conditions || [],
      allergies: snapshot.profile.allergies || [],
      timeZone: snapshot.profile.timeZone || workspace.profile.timeZone,
      visionPreference:
        snapshot.profile.visionPreference ?? workspace.profile.visionPreference,
      healthProfileCompleted:
        snapshot.profile.healthProfileCompleted ??
        Boolean(snapshot.elderName),
      healthProfilePromptSeen:
        snapshot.profile.healthProfilePromptSeen ?? Boolean(snapshot.elderName),
      voiceEnabled:
        snapshot.profile.voiceEnabled ?? workspace.profile.voiceEnabled
    },
    emergencyContacts: snapshot.emergencyContacts || [],
    consent: snapshot.consent,
    medications: snapshot.medications || [],
    doseEvents: snapshot.doseEvents || [],
    riskChecks: collectTrackableRiskChecks(
      snapshot.riskChecks || [],
      snapshot.conversations || []
    ),
    familyAlerts: snapshot.familyAlerts || [],
    conversations: snapshot.conversations || workspace.conversations,
    preferences: snapshot.preferences
      ? {
          ...workspace.preferences,
          ...snapshot.preferences,
          voiceMode: normalizeVoiceMode(
            snapshot.preferences.voiceMode ??
              workspace.preferences.voiceMode,
            snapshot.preferences.customVoiceId ??
              workspace.preferences.customVoiceId
          ),
          customVoices:
            snapshot.preferences.customVoices ??
            workspace.preferences.customVoices
        }
      : workspace.preferences,
    intakeDraft: snapshot.intakeDraft ?? workspace.intakeDraft,
    lastSyncedAt: snapshot.updatedAt
  };
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
