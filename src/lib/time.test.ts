import { describe, expect, it } from "vitest";
import {
  dateKey,
  formatTimeZoneLabel,
  scheduledDateTime
} from "./time";

describe("elder timezone calculations", () => {
  it("uses a Chinese label for the timezone shown in the interface", () => {
    expect(formatTimeZoneLabel("Asia/Shanghai")).toBe(
      "中国标准时间（上海）"
    );
    expect(formatTimeZoneLabel("Custom/Zone")).toBe("本地时区");
  });

  it("keeps the elder's local date when the device timezone differs", () => {
    expect(
      dateKey(new Date("2026-11-15T01:00:00.000Z"), "America/New_York")
    ).toBe("2026-11-14");
  });

  it("converts a scheduled wall-clock time using the elder's timezone", () => {
    expect(
      scheduledDateTime(
        "08:00",
        new Date("2026-11-15T00:00:00.000Z"),
        "Asia/Shanghai"
      ).toISOString()
    ).toBe("2026-11-15T00:00:00.000Z");
  });
});
