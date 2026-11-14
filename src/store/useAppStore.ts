import { get, set, del } from "idb-keyval";
import { create } from "zustand";
import {
  createJSONStorage,
  persist,
  type StateStorage
} from "zustand/middleware";
import { createInitialState } from "../data/seed";
import { createId } from "../lib/ids";
import { nowIso } from "../lib/time";
import type {
  AppPreferences,
  AppState,
  AuditEvent,
  ChatMessage,
  CloudSnapshot,
  ConsentSettings,
  DoseEvent,
  DoseStatus,
  ElderProfile,
  EmergencyContact,
  FamilyAlert,
  IntakeDraft,
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
  setRole: (role: UserRole) => void;
  setFamilyCode: (familyCode: string) => void;
  updateProfile: (profile: Partial<ElderProfile>) => void;
  updateConsent: (consent: Partial<ConsentSettings>) => void;
  updatePreferences: (preferences: Partial<AppPreferences>) => void;
  updateEmergencyContacts: (contacts: EmergencyContact[]) => void;
  addFamilyAlert: (alert: FamilyAlert) => void;
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
  addChatMessage: (message: ChatMessage) => void;
  replaceChatMessage: (id: string, message: ChatMessage) => void;
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
      setRole: (role) =>
        setState((state) => ({
          role,
          auditEvents: [
            auditEvent(
              "settings-updated",
              `切换为${role === "elder" ? "老人端" : "家属端"}`
            ),
            ...state.auditEvents
          ].slice(0, 100)
        })),
      setFamilyCode: (familyCode) =>
        setState({
          familyCode: familyCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)
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
          familyAlerts: [
            alert,
            ...state.familyAlerts.filter((item) => item.id !== alert.id)
          ].slice(0, 30),
          lastLocalSaveAt: nowIso()
        })),
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
      addChatMessage: (message) =>
        setState((state) => ({
          chatMessages: [...state.chatMessages, message].slice(-100),
          riskChecks: message.riskCheck
            ? [message.riskCheck, ...state.riskChecks].slice(0, 50)
            : state.riskChecks
        })),
      replaceChatMessage: (id, message) =>
        setState((state) => ({
          chatMessages: state.chatMessages.map((item) =>
            item.id === id ? message : item
          ),
          riskChecks: message.riskCheck
            ? [message.riskCheck, ...state.riskChecks].slice(0, 50)
            : state.riskChecks
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
              : []
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
            ? state.familyAlerts.slice(0, 20)
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
            allergies: snapshot.profile.allergies
          },
          medications: snapshot.medications,
          doseEvents: snapshot.doseEvents,
          riskChecks: snapshot.riskChecks,
          emergencyContacts: snapshot.emergencyContacts,
          familyAlerts: snapshot.familyAlerts ?? state.familyAlerts,
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
        return {
          ...current,
          ...saved,
          preferences: {
            ...current.preferences,
            ...saved.preferences,
            fontScale:
              saved.preferences?.fontScale ?? current.preferences.fontScale
          },
          medications: (saved.medications ?? current.medications).map(
            (medication) => ({
              ...medication,
              reminderEnabled: medication.reminderEnabled !== false
            })
          ),
          familyAlerts: saved.familyAlerts ?? []
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
