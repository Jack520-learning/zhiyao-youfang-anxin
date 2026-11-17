import { describe, expect, it } from "vitest";
import { normalizeHandwritingText } from "./handwriting";

describe("handwriting text normalization", () => {
  it("prefers the clearest unique handwritten line", () => {
    expect(
      normalizeHandwritingText("今天怎么吃\n今天怎么吃药\n今天怎么吃药\n")
    ).toBe("今天怎么吃药");
  });

  it("removes whitespace and empty noise", () => {
    expect(normalizeHandwritingText("  阿 司 匹 林 \n—\n")).toBe("阿司匹林");
  });
});
