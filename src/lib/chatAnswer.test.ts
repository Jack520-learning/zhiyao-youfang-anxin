import { describe, expect, it } from "vitest";
import { cleanAnswerForChat } from "./chatAnswer";

describe("chat answer cleanup", () => {
  it("removes generic headings and risk labels while keeping useful content", () => {
    const cleaned = cleanAnswerForChat(
      "## 结论\n\n我是智药有方。\n\n## 回答边界\n\n可以继续提问。\n\n**风险等级：低**"
    );
    expect(cleaned).toBe("我是智药有方。\n\n可以继续提问。");
  });

  it("keeps the off-topic notice for non-daily questions", () => {
    const content =
      "> 温馨提示：这个问题与健康用药无关，以下仅作一般常识参考。\n\n天空呈蓝色。";
    expect(cleanAnswerForChat(content)).toBe(content);
  });
});
