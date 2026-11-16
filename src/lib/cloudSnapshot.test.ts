import { describe, expect, it } from "vitest";
import type { CloudSnapshot } from "../types";
import { cloudSnapshotFingerprint } from "./cloudSnapshot";

function snapshot(updatedAt: string): CloudSnapshot {
  return {
    version: 1,
    familyCode: "123456",
    updatedAt,
    elderName: "测试老人",
    profile: {
      age: 76,
      conditions: ["高血压"],
      allergies: [],
      timeZone: "Asia/Shanghai",
      visionPreference: "large",
      healthProfileCompleted: true,
      healthProfilePromptSeen: true,
      voiceEnabled: true
    },
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
    emergencyContacts: [],
    familyAlerts: [],
    conversations: [
      {
        id: "conversation-1",
        title: "用药咨询",
        createdAt: "2026-11-16T00:00:00.000Z",
        updatedAt: "2026-11-16T00:00:00.000Z",
        messages: []
      }
    ]
  };
}

describe("cloud snapshot fingerprint", () => {
  it("ignores the timestamp so a device does not re-upload unchanged data", () => {
    expect(
      cloudSnapshotFingerprint(snapshot("2026-11-16T00:00:00.000Z"))
    ).toBe(cloudSnapshotFingerprint(snapshot("2026-11-16T00:01:00.000Z")));
  });

  it("changes when a conversation is added", () => {
    const first = snapshot("2026-11-16T00:00:00.000Z");
    const next = {
      ...first,
      conversations: [
        first.conversations![0],
        {
          id: "conversation-2",
          title: "新增对话",
          createdAt: "2026-11-16T00:02:00.000Z",
          updatedAt: "2026-11-16T00:02:00.000Z",
          messages: []
        }
      ]
    };
    expect(cloudSnapshotFingerprint(first)).not.toBe(
      cloudSnapshotFingerprint(next)
    );
  });
});
