import { describe, expect, it } from "vitest";
import { answerHerbQuestion } from "./HerbDetailPage";

const herb = {
  aliases: ["枸杞"],
  nature: "平",
  flavor: "甘",
  meridians: ["肝", "肾"],
  functions: ["滋补肝肾", "益精明目"],
  traditionalUse: "用于肝肾阴虚相关表现。",
  safety: ["正在使用抗凝药时先咨询医生或药师。"],
  identification: ["果实呈纺锤形或椭圆形。"]
};

describe("herb detail question answering", () => {
  it("answers traditional functions from the current herb record", () => {
    const answer = answerHerbQuestion("枸杞子", "有什么功效", false, herb);
    expect(answer).toContain("滋补肝肾");
    expect(answer).toContain("益精明目");
    expect(answer).not.toContain("不能仅凭“枸杞子”名称给您推荐自行用量");
  });

  it("does not invent chemical composition data", () => {
    const answer = answerHerbQuestion("枸杞子", "主要成分是什么", false, herb);
    expect(answer).toContain("没有足够可靠数据");
  });

  it("answers identification questions from identification fields", () => {
    const answer = answerHerbQuestion("枸杞子", "怎么辨识", false, herb);
    expect(answer).toContain("纺锤形");
    expect(answer).toContain("枸杞");
  });
});
