import { describe, expect, it } from "vitest";
import {
  GENERAL_KNOWLEDGE_NOTICE,
  isGeneralKnowledgeQuestion,
  withGeneralKnowledgeNotice
} from "./generalKnowledge";

describe("general knowledge questions", () => {
  it("recognizes non-health knowledge questions", () => {
    expect(isGeneralKnowledgeQuestion("为什么天空是蓝色的")).toBe(true);
    expect(isGeneralKnowledgeQuestion("一公里等于多少米")).toBe(true);
    expect(
      isGeneralKnowledgeQuestion(
        "用吹风机的吹风机吹吹风机，吹风机，会被吹风机的吹风机给吹毁吗？"
      )
    ).toBe(true);
  });

  it("keeps health questions in the medical flow", () => {
    expect(isGeneralKnowledgeQuestion("阿司匹林怎么吃")).toBe(false);
    expect(isGeneralKnowledgeQuestion("高血压该注意什么")).toBe(false);
    expect(
      isGeneralKnowledgeQuestion("枸杞子、葛根、黄芪，还有菟丝子分别是什么作用？")
    ).toBe(false);
  });

  it("never applies the off-topic notice when a skill is explicitly selected", () => {
    expect(isGeneralKnowledgeQuestion("为什么天空是蓝色的", true)).toBe(false);
  });

  it("allows science questions that mention everyday objects", () => {
    expect(isGeneralKnowledgeQuestion("太阳为什么东升西落")).toBe(true);
  });

  it("adds an off-topic health notice before the answer", () => {
    expect(withGeneralKnowledgeNotice("天空呈现蓝色与光散射有关。")).toBe(
      `> ${GENERAL_KNOWLEDGE_NOTICE}\n\n天空呈现蓝色与光散射有关。`
    );
  });
});
