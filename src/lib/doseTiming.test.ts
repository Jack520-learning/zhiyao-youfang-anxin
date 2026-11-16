import { describe, expect, it } from "vitest";
import { buildDoseTimingNotice } from "./doseTiming";

const timeZone = "Asia/Shanghai";

describe("dose timing notice", () => {
  it("warns when a pending dose is recorded far before schedule", () => {
    const notice = buildDoseTimingNotice({
      scheduledAt: "2026-11-17T08:00:00+08:00",
      status: "pending",
      now: new Date("2026-11-17T00:44:00+08:00"),
      timeZone
    });
    expect(notice?.kind).toBe("early");
    expect(notice?.detail).toContain("提前约");
  });

  it("warns when a recorded dose differs substantially from schedule", () => {
    const notice = buildDoseTimingNotice({
      scheduledAt: "2026-11-17T08:00:00+08:00",
      status: "taken",
      recordedAt: "2026-11-17T00:44:00+08:00",
      now: new Date("2026-11-17T12:00:00+08:00"),
      timeZone
    });
    expect(notice?.kind).toBe("mismatch");
    expect(notice?.detail).toContain("相差约");
  });

  it("does not warn for a dose within the expected window", () => {
    expect(
      buildDoseTimingNotice({
        scheduledAt: "2026-11-17T08:00:00+08:00",
        status: "pending",
        now: new Date("2026-11-17T07:45:00+08:00"),
        timeZone
      })
    ).toBeNull();
  });
});
