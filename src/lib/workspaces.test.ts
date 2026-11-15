import { describe, expect, it } from "vitest";
import { createInitialState } from "../data/seed";
import type { LocalAccount } from "../types";
import {
  captureWorkspace,
  getLinkedFamilyCodes,
  normalizeFamilyCode,
  workspaceKey,
  workspacePatch
} from "./workspaces";

const account: LocalAccount = {
  id: "account-family-1",
  username: "family1",
  displayName: "家属一",
  role: "family",
  familyCode: "ABC123",
  linkedFamilyCodes: ["ABC123", "DEF456"],
  passwordHash: "hash",
  passwordSalt: "salt",
  createdAt: "2026-01-01T00:00:00.000Z"
};

describe("account workspace helpers", () => {
  it("normalizes family codes and keeps every linked elder", () => {
    expect(normalizeFamilyCode(" ab-c123 ")).toBe("ABC123");
    expect(getLinkedFamilyCodes(account)).toEqual(["ABC123", "DEF456"]);
  });

  it("uses account and family code as an isolated workspace key", () => {
    expect(workspaceKey(account.id, "def456")).toBe(
      "account-family-1::DEF456"
    );
  });

  it("captures and restores the active elder archive independently", () => {
    const state = createInitialState({
      role: "elder",
      familyCode: "ABC123"
    });
    state.profile.name = "张阿姨";
    state.medications = [
      {
        id: "med-1",
        name: "阿司匹林肠溶片",
        genericName: "阿司匹林",
        ingredients: ["阿司匹林"],
        dosage: "100mg",
        frequency: "每日 1 次",
        times: ["08:00"],
        relation: "饭后",
        instructions: "",
        startDate: "2026-01-01",
        status: "active",
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
      }
    ];

    const workspace = captureWorkspace(state);
    const restored = workspacePatch(workspace);

    expect(restored.profile.name).toBe("张阿姨");
    expect(restored.medications).toHaveLength(1);
    expect(restored.familyCode).toBe("ABC123");
  });
});
