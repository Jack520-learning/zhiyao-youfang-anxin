import { describe, expect, it } from "vitest";
import {
  buildMedicationActivityResponse,
  isMedicationActivityQuery
} from "./medicationActivity";
import type { DoseEvent, ElderProfile, Medication } from "../types";

const profile: ElderProfile = {
  name: "测试老人",
  age: 72,
  conditions: [],
  allergies: [],
  timeZone: "Asia/Shanghai",
  healthProfileCompleted: true,
  healthProfilePromptSeen: true,
  visionPreference: "large",
  voiceEnabled: true
};

const medication: Medication = {
  id: "med-a",
  name: "阿司匹林肠溶片",
  genericName: "阿司匹林",
  ingredients: ["阿司匹林"],
  dosage: "1片",
  frequency: "每日 1 次",
  times: ["08:00"],
  relation: "饭后",
  instructions: "",
  startDate: "2026-11-16",
  status: "active",
  reminderEnabled: true,
  source: {
    type: "medicine-label",
    title: "测试",
    capturedAt: "2026-11-16T00:00:00.000Z",
    confirmed: true
  },
  confidence: 1,
  createdAt: "2026-11-16T00:00:00.000Z",
  updatedAt: "2026-11-16T00:00:00.000Z"
};

describe("medication activity answers", () => {
  it("recognizes today's medication-record questions", () => {
    expect(isMedicationActivityQuery("今天吃了哪些药了")).toBe(true);
    expect(isMedicationActivityQuery("今天的用药提醒正常吗")).toBe(true);
  });

  it("combines planned doses, confirmed records and medication names", () => {
    const event: DoseEvent = {
      id: "2026-11-16-med-a-08:00",
      medicationId: medication.id,
      scheduledAt: "2026-11-16T00:00:00.000Z",
      status: "taken",
      updatedAt: "2026-11-16T00:06:00.000Z"
    };
    const response = buildMedicationActivityResponse(
      "今天吃了哪些药了",
      [medication],
      [event],
      profile,
      new Date("2026-11-16T04:00:00.000Z")
    );
    expect(response.message).toContain("阿司匹林肠溶片");
    expect(response.message).toContain("已确认服用 1 个");
    expect(response.message).not.toContain("公开资料");
    expect(response.groundingOnly).toBe(true);
  });
});
