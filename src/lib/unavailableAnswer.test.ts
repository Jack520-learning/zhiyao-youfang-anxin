import { describe, expect, it } from "vitest";
import { buildUnavailableAnswer } from "./unavailableAnswer";

describe("unavailable answer fallback", () => {
  it("keeps the fallback short and asks only for relevant medication details", () => {
    const answer = buildUnavailableAnswer("这种复方药怎么用");
    expect(answer).toContain("无法准确回答");
    expect(answer).toContain("药名、规格");
    expect(answer.length).toBeLessThan(100);
  });

  it("asks for symptom details and keeps emergency guidance", () => {
    const answer = buildUnavailableAnswer("最近总是头晕");
    expect(answer).toContain("症状开始时间");
    expect(answer).toContain("120");
  });
});
