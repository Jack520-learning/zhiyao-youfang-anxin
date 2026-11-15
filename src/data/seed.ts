import type {
  AppState,
  AuditEvent,
  ElderProfile,
  EmergencyContact,
  Medication
} from "../types";
import { createFamilyCode, createId } from "../lib/ids";
import { dateKey, nowIso } from "../lib/time";

const createdAt = nowIso();

function demoMedication(
  id: string,
  name: string,
  genericName: string,
  ingredients: string[],
  dosage: string,
  times: string[],
  relation: string,
  instructions: string
): Medication {
  return {
    id,
    name,
    genericName,
    ingredients,
    dosage,
    frequency: times.length > 1 ? "每日 2 次" : "每日 1 次",
    times,
    relation,
    instructions,
    startDate: dateKey(),
    status: "active",
    reminderEnabled: true,
    source: {
      type: "prescription",
      title: "演示处方（已确认）",
      capturedAt: createdAt,
      confirmed: true
    },
    confidence: 0.98,
    createdAt,
    updatedAt: createdAt
  };
}

export function createInitialState(options?: {
  role?: AppState["role"];
  familyCode?: string;
}): AppState {
  const initialConversationId = "conversation-welcome";
  const profile: ElderProfile = {
    name: "林阿姨",
    age: 72,
    conditions: ["高血压"],
    allergies: ["青霉素"],
    timeZone:
      Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai",
    visionPreference: "large",
    voiceEnabled: true
  };

  const emergencyContacts: EmergencyContact[] = [
    {
      id: "contact-daughter",
      name: "林晓",
      relation: "女儿",
      phone: "13800000000",
      kind: "family"
    },
    {
      id: "contact-caregiver",
      name: "王护工",
      relation: "日常照护",
      phone: "13900000000",
      kind: "caregiver"
    }
  ];

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
    medications: [
      demoMedication(
        "med-amlodipine",
        "苯磺酸氨氯地平片",
        "氨氯地平",
        ["氨氯地平"],
        "5mg，每次 1 片",
        ["08:00"],
        "早饭后",
        "按演示处方记录使用，不用于真实医疗决策。"
      ),
      demoMedication(
        "med-aspirin",
        "阿司匹林肠溶片",
        "阿司匹林",
        ["阿司匹林"],
        "100mg，每次 1 片",
        ["18:30"],
        "晚饭后",
        "按演示处方记录使用，不用于真实医疗决策。"
      )
    ],
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
      highContrast: false,
      fontScale: "large"
    },
    lastLocalSaveAt: createdAt
  };
}
