import { describe, expect, it } from "vitest";
import {
  addGeneralKnowledgeNotice,
  GENERAL_KNOWLEDGE_NOTICE,
  stripGeneralKnowledgeNotices
} from "./generalNotice";

describe("general knowledge notice", () => {
  it("keeps exactly one notice when the answer already contains duplicates", () => {
    const text = `${GENERAL_KNOWLEDGE_NOTICE}\n\n${GENERAL_KNOWLEDGE_NOTICE}\n\n天空呈蓝色。`;
    const result = addGeneralKnowledgeNotice(text);
    expect(result.match(/温馨提示/g)).toHaveLength(1);
    expect(result).toContain("天空呈蓝色。");
  });

  it("strips every notice before speech generation", () => {
    const result = stripGeneralKnowledgeNotices(
      `${GENERAL_KNOWLEDGE_NOTICE}\n正文\n${GENERAL_KNOWLEDGE_NOTICE}`
    );
    expect(result).toBe("正文");
  });
});
