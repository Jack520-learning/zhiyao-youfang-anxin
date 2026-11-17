import { describe, expect, it } from "vitest";
import { varyRegeneratedAnswer } from "./answerVariation";

const answer =
  "结论：不要自行加倍。\n\n原因：可能增加不良反应。\n\n下一步：联系医生或药师。\n\n### 为什么\n- 药物代谢需要时间。\n\n### 现在先做\n- 查看说明书。";

describe("regenerated answer variation", () => {
  it("produces different presentations while retaining the same safety facts", () => {
    const variants = [0, 1, 2].map((seed) =>
      varyRegeneratedAnswer(answer, "safety", "漏服后应该联系谁", seed)
    );
    expect(new Set(variants).size).toBe(3);
    for (const variant of variants) {
      expect(variant).toContain("不要自行加倍");
      expect(variant).toContain("联系医生或药师");
    }
  });

  it("keeps quick answers concise and heading-free", () => {
    const varied = varyRegeneratedAnswer(
      "结论：不要自行加倍，先联系医生或药师。",
      "quick",
      "漏服了怎么办",
      1
    );
    expect(varied).not.toMatch(/^#/m);
    expect(varied.length).toBeLessThan(120);
  });
});
