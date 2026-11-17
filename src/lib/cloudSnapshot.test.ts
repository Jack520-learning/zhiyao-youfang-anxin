import { describe, expect, it } from "vitest";
import type { CloudSnapshot } from "../types";
import {
  cloudSnapshotFingerprint,
  preserveLocalConversationImages,
  preserveLocalDraftImage
} from "./cloudSnapshot";

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

  it("keeps local chat photos when a cloud snapshot omits image data", () => {
    const localConversation = {
      id: "conversation-photo",
      title: "药盒照片",
      createdAt: "2026-11-16T00:00:00.000Z",
      updatedAt: "2026-11-16T00:00:00.000Z",
      messages: [
        {
          id: "message-photo",
          role: "user" as const,
          content: "拍了一张药盒照片",
          createdAt: "2026-11-16T00:00:00.000Z",
          imageDataUrls: ["data:image/jpeg;base64,local"]
        }
      ]
    };
    const remoteConversation = {
      ...localConversation,
      messages: localConversation.messages.map((message) => ({
        ...message,
        imageDataUrls: undefined
      }))
    };

    expect(
      preserveLocalConversationImages(
        [remoteConversation],
        [localConversation]
      )?.[0].messages[0].imageDataUrls
    ).toEqual(["data:image/jpeg;base64,local"]);
  });

  it("keeps the local intake photo when cloud sync strips it", () => {
    const draft = {
      imageDataUrl: undefined,
      rawText: "识别文字",
      name: "硝酸甘油片",
      genericName: "硝酸甘油",
      ingredientsText: "硝酸甘油",
      dosage: "",
      frequency: "按需服用",
      times: [],
      relation: "按需",
      instructions: "",
      confidence: 0.8,
      lowConfidenceFields: ["dosage"],
      createdAt: "2026-11-16T00:00:00.000Z"
    };
    expect(
      preserveLocalDraftImage(draft, {
        ...draft,
        imageDataUrl: "data:image/jpeg;base64,draft"
      })?.imageDataUrl
    ).toBe("data:image/jpeg;base64,draft");
  });
});
