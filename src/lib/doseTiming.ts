import type { DoseStatus } from "../types";
import { formatTime } from "./time";

export interface DoseTimingNotice {
  kind: "early" | "late" | "mismatch";
  title: string;
  detail: string;
  differenceMinutes: number;
}

interface DoseTimingInput {
  scheduledAt: string;
  status: DoseStatus;
  now: Date;
  recordedAt?: string;
  timeZone: string;
}

function durationLabel(minutes: number): string {
  const rounded = Math.max(1, Math.round(Math.abs(minutes)));
  if (rounded < 60) return `${rounded} 分钟`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}

export function buildDoseTimingNotice({
  scheduledAt,
  status,
  now,
  recordedAt,
  timeZone
}: DoseTimingInput): DoseTimingNotice | null {
  const scheduled = new Date(scheduledAt);
  if (!Number.isFinite(scheduled.getTime())) return null;

  if (
    status !== "pending" &&
    recordedAt &&
    Number.isFinite(new Date(recordedAt).getTime())
  ) {
    const recorded = new Date(recordedAt);
    const differenceMinutes =
      (recorded.getTime() - scheduled.getTime()) / 60000;
    if (Math.abs(differenceMinutes) <= 60) return null;
    return {
      kind: "mismatch",
      title: "记录时间与计划时间不一致",
      detail: `计划 ${formatTime(
        scheduled,
        timeZone
      )}，记录于 ${formatTime(
        recorded,
        timeZone
      )}，相差约 ${durationLabel(differenceMinutes)}。请核对是否点错了时间。`,
      differenceMinutes
    };
  }

  const differenceMinutes =
    (now.getTime() - scheduled.getTime()) / 60000;
  if (differenceMinutes < -60) {
    return {
      kind: "early",
      title: "还没到计划服药时间",
      detail: `计划 ${formatTime(
        scheduled,
        timeZone
      )}，当前 ${formatTime(now, timeZone)}，提前约 ${durationLabel(
        differenceMinutes
      )}。确认已服前请先核对时间。`,
      differenceMinutes
    };
  }
  if (differenceMinutes > 90) {
    return {
      kind: "late",
      title: "已超过计划服药时间",
      detail: `计划 ${formatTime(
        scheduled,
        timeZone
      )}，当前 ${formatTime(now, timeZone)}，已延后约 ${durationLabel(
        differenceMinutes
      )}。请先核对此前是否已经服用，不要自行加倍。`,
      differenceMinutes
    };
  }
  return null;
}
