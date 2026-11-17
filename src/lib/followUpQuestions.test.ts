import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../types";
import { buildFollowUpQuestions } from "./followUpQuestions";

function userMessage(id: string, content: string): ChatMessage {
  return {
    id,
    role: "user",
    content,
    createdAt: "2026-11-17T00:00:00.000Z"
  };
}

describe("contextual follow-up questions", () => {
  it("builds capability follow-ups without treating them as unrelated knowledge", () => {
    const questions = buildFollowUpQuestions({
      query: "你能干什么",
      answer: "我是智药有方·安心药伴，您的家庭用药管家和用药助手。"
    });
    expect(questions).toContain("帮我识别药盒照片");
    expect(questions).toContain("怎么核对我现在吃的药？");
  });

  it("uses the recognized medicine name in photo follow-ups", () => {
    const questions = buildFollowUpQuestions({
      query: "我拍了一张药盒照片",
      answer: "已完成硝酸甘油片的图像分析",
      medicineName: "硝酸甘油片",
      hasCurrentMedications: true
    });
    expect(questions[0]).toBe("硝酸甘油片每天怎么吃？");
    expect(questions).toContain("硝酸甘油片和我现在吃的药有冲突吗？");
  });

  it("uses the current symptom instead of generic recommendations", () => {
    const questions = buildFollowUpQuestions({
      query: "我心脏不舒服",
      answer: "先排查胸痛、气短和晕厥等危险信号。"
    });
    expect(questions[0]).toContain("120");
    expect(questions.some((question) => question.includes("心脏不适"))).toBe(
      true
    );
  });

  it("removes questions already asked in the conversation history", () => {
    const questions = buildFollowUpQuestions({
      query: "帮我识别药盒照片",
      answer: "已识别",
      medicineName: "阿司匹林肠溶片",
      history: [userMessage("1", "阿司匹林肠溶片每天怎么吃？")]
    });
    expect(questions).not.toContain("阿司匹林肠溶片每天怎么吃？");
    expect(questions.length).toBeGreaterThan(0);
  });

  it("uses herb-specific follow-ups after a Chinese herb photo", () => {
    const questions = buildFollowUpQuestions({
      query: "我拍了一张中药材照片",
      answer: "已识别为枸杞子",
      medicineName: "枸杞子"
    });
    expect(questions[0]).toContain("传统功用");
    expect(questions.some((question) => question.includes("西药"))).toBe(true);
    expect(questions).not.toContain("枸杞子每天怎么吃？");
  });
});
