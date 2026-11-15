import { describe, expect, it } from "vitest";
import type { ElderProfile, Medication } from "../types";
import {
  executeAgentTool,
  planAgentTools,
  safetyResponseFromRuns
} from "./agentTools";

const profile: ElderProfile = {
  name: "张阿姨",
  age: 70,
  conditions: ["高血压"],
  allergies: [],
  timeZone: "Asia/Shanghai",
  healthProfileCompleted: true,
  healthProfilePromptSeen: true,
  visionPreference: "large",
  voiceEnabled: true
};

const medication: Medication = {
  id: "med-aspirin",
  name: "阿司匹林肠溶片",
  genericName: "阿司匹林",
  ingredients: ["阿司匹林"],
  dosage: "100mg",
  frequency: "每日 1 次",
  times: ["08:00"],
  relation: "饭后",
  instructions: "整片吞服",
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
};

describe("agent tool workflow", () => {
  it("plans medication, profile and safety tools for a drug question", () => {
    expect(planAgentTools("阿司匹林能喝酒吗")).toEqual(
      expect.arrayContaining([
        "get_elder_profile_context",
        "lookup_drug_catalog",
        "check_safety_rules"
      ])
    );
  });

  it("executes the safety tool and returns a structured risk result", () => {
    const run = executeAgentTool("check_safety_rules", {
      query: "阿司匹林怎么吃",
      profile,
      medications: [medication]
    });
    const response = safetyResponseFromRuns([run]);

    expect(run.summary).toContain("安全核对");
    expect(response?.riskCheck.title).toBeTruthy();
    expect(run.durationMs).toBeGreaterThan(0);
  });

  it("retrieves explainable catalog fields", () => {
    const run = executeAgentTool("lookup_drug_catalog", {
      query: "阿司匹林",
      profile,
      medications: [medication]
    });
    const result = run.result as {
      match?: { medicine: { displayName: string }; matchedField: string };
    };

    expect(result.match?.medicine.displayName).toContain("阿司匹林");
    expect(result.match?.matchedField).toBeTruthy();
  });
});
