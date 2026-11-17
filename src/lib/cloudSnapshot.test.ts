import { afterEach, describe, expect, it, vi } from "vitest";
import type { CloudSnapshot } from "../types";
import {
  CloudRevisionConflictError,
  fetchFamilySnapshotState,
  syncCloudSnapshot
} from "./cloud";
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

afterEach(() => {
  vi.unstubAllGlobals();
});

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

describe("cloud revision sync", () => {
  it("reads the server revision together with a family snapshot", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify(snapshot("2026-11-16T00:00:00.000Z")),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "X-Cloud-Revision": "7"
            }
          }
        )
      )
    );

    const result = await fetchFamilySnapshotState("123456");

    expect(result?.revision).toBe(7);
    expect(result?.snapshot.familyCode).toBe("123456");
  });

  it("sends the known revision and exposes a newer remote snapshot", async () => {
    const remote = snapshot("2026-11-16T00:05:00.000Z");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "云端数据已在其他设备更新",
          revision: 8,
          snapshot: remote
        }),
        {
          status: 409,
          headers: { "Content-Type": "application/json" }
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      syncCloudSnapshot(snapshot("2026-11-16T00:00:00.000Z"), 7)
    ).rejects.toEqual(
      expect.objectContaining({
        name: "CloudRevisionConflictError",
        revision: 8,
        snapshot: remote
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sync",
      expect.objectContaining({
        headers: expect.objectContaining({ "If-Match": "7" })
      })
    );
  });

  it("marks conflicts with a dedicated error type", async () => {
    const remote = snapshot("2026-11-16T00:05:00.000Z");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ revision: 3, snapshot: remote }),
          {
            status: 409,
            headers: { "Content-Type": "application/json" }
          }
        )
      )
    );

    await expect(syncCloudSnapshot(remote, 2)).rejects.toBeInstanceOf(
      CloudRevisionConflictError
    );
  });
});
