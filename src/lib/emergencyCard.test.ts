import { describe, expect, it } from "vitest";
import type {
  ElderProfile,
  EmergencyContact,
  Medication,
  RiskCheck
} from "../types";
import { buildEmergencyCardData } from "./emergencyCard";

const profile: ElderProfile = {
  name: "张阿姨",
  age: 78,
  conditions: ["高血压"],
  allergies: ["青霉素"],
  timeZone: "Asia/Shanghai",
  healthProfileCompleted: true,
  healthProfilePromptSeen: true,
  visionPreference: "large",
  voiceEnabled: true
};

function medication(
  id: string,
  name: string,
  status: Medication["status"]
): Medication {
  return {
    id,
    name,
    genericName: name,
    ingredients: [name],
    dosage: "1 片",
    frequency: "每日 1 次",
    times: ["08:00"],
    relation: "饭后",
    instructions: "",
    startDate: "2026-01-01",
    status,
    reminderEnabled: true,
    source: {
      type: "medicine-label",
      title: "药盒",
      capturedAt: "2026-01-01T00:00:00.000Z",
      confirmed: true
    },
    confidence: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

const contacts: EmergencyContact[] = [
  {
    id: "caregiver",
    name: "护理员",
    relation: "照护者",
    phone: "13800000001",
    kind: "caregiver"
  },
  {
    id: "family",
    name: "李女士",
    relation: "女儿",
    phone: "13800000002",
    kind: "family"
  }
];

describe("buildEmergencyCardData", () => {
  it("includes active medicines, profile data and ordered contacts", () => {
    const data = buildEmergencyCardData({
      profile,
      medications: [
        medication("warfarin", "华法林钠片", "active"),
        medication("stopped", "已停用药", "stopped")
      ],
      emergencyContacts: contacts,
      riskChecks: []
    });

    expect(data.name).toBe("张阿姨");
    expect(data.medications.map((item) => item.name)).toEqual(["华法林钠片"]);
    expect(data.allergies).toEqual(["青霉素"]);
    expect(data.conditions).toEqual(["高血压"]);
    expect(data.contacts[0].kind).toBe("family");
    expect(data.specialAttention[0].name).toBe("华法林钠片");
  });

  it("uses a recorded high-risk check as a reason for special attention", () => {
    const riskChecks: RiskCheck[] = [
      {
        id: "risk-1",
        level: "high",
        title: "存在高风险相互作用",
        summary: "需要医生复核",
        nextStep: "联系医生",
        reasons: ["测试"],
        sourceIds: [],
        involvedMedicationIds: ["aspirin"],
        medicationSnapshot: ["阿司匹林肠溶片"],
        createdAt: "2026-01-01T00:00:00.000Z"
      }
    ];
    const data = buildEmergencyCardData({
      profile,
      medications: [medication("aspirin", "阿司匹林肠溶片", "active")],
      emergencyContacts: contacts,
      riskChecks
    });

    expect(data.specialAttention).toEqual([
      {
        medicationId: "aspirin",
        name: "阿司匹林肠溶片",
        reason: "系统曾提示：存在高风险相互作用"
      }
    ]);
  });
});
