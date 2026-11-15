import type {
  AppState,
  AuditEvent,
  ElderProfile,
  EmergencyContact
} from "../types";
import { createFamilyCode, createId } from "../lib/ids";
import { nowIso } from "../lib/time";

const createdAt = nowIso();

export function createInitialState(options?: {
  role?: AppState["role"];
  familyCode?: string;
}): AppState {
  const initialConversationId = "conversation-welcome";
  const profile: ElderProfile = {
    name: "",
    age: 0,
    conditions: [],
    allergies: [],
    timeZone:
      Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai",
    healthProfileCompleted: false,
    visionPreference: "large",
    voiceEnabled: true
  };

  const emergencyContacts: EmergencyContact[] = [];

  const auditEvent: AuditEvent = {
    id: createId("audit"),
    type: "settings-updated",
    summary: "载入安全用药演示档案",
    createdAt
  };

  return {
    schemaVersion: 1,
    role: options?.role ?? "elder",
    accounts: [],
    familyCode: options?.familyCode ?? createFamilyCode(),
    profile,
    emergencyContacts,
    consent: {
      shareMedicationSummary: true,
      shareMissedDose: true,
      shareHighRisk: true,
      shareEmergency: true,
      allowSosContact: true
    },
    medications: [],
    doseEvents: [],
    riskChecks: [],
    conversations: [
      {
        id: initialConversationId,
        title: "新的用药咨询",
        createdAt,
        updatedAt: createdAt,
        messages: [
          {
            id: "welcome-message",
            role: "assistant",
            content:
              "您好，我是智药有方。您可以按住说话、拍药盒，或打开药品百科和识中药材。涉及高风险用药时，我会先核对来源并提示联系医生。",
            createdAt
          }
        ]
      }
    ],
    activeConversationId: initialConversationId,
    auditEvents: [auditEvent],
    familyAlerts: [],
    preferences: {
      notificationsEnabled: false,
      soundEnabled: true,
      voiceMode: "warm",
      highContrast: false,
      fontScale: "large"
    },
    lastLocalSaveAt: createdAt
  };
}
