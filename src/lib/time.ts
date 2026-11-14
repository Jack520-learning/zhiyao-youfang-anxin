import type { DoseEvent, DoseStatus, Medication } from "../types";

export function nowIso(): string {
  return new Date().toISOString();
}

export function dateKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function formatChineseDate(date = new Date()): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(date);
}

export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

export function scheduledDateTime(time: string, day = new Date()): Date {
  const [hours, minutes] = time.split(":").map(Number);
  const result = new Date(day);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

export function getTodayDoses(
  medications: Medication[],
  doseEvents: DoseEvent[],
  day = new Date()
): Array<{
  medication: Medication;
  scheduledAt: string;
  status: DoseStatus;
  doseId: string;
  recordedAt?: string;
}> {
  const key = dateKey(day);
  return medications
    .filter(
      (medication) =>
        medication.status === "active" && medication.reminderEnabled !== false
    )
    .flatMap((medication) =>
      medication.times.map((time) => {
        const scheduled = scheduledDateTime(time, day);
        const scheduledAt = scheduled.toISOString();
        const doseId = `${key}-${medication.id}-${time}`;
        const event = doseEvents.find((item) => item.id === doseId);
        return {
          medication,
          scheduledAt,
          status: event?.status ?? "pending",
          doseId,
          recordedAt: event?.updatedAt
        };
      })
    )
    .sort(
      (left, right) =>
        new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime()
    );
}

export function getNextDose(
  medications: Medication[],
  doseEvents: DoseEvent[],
  day = new Date()
) {
  const doses = getTodayDoses(medications, doseEvents, day);
  return (
    doses.find(
      (dose) =>
        dose.status === "pending" &&
        new Date(dose.scheduledAt).getTime() >= day.getTime() - 60 * 60 * 1000
    ) ?? doses.find((dose) => dose.status === "pending")
  );
}

export function humanizeRelation(relation: string, instructions = ""): string {
  const text = `${relation} ${instructions}`;
  if (/饭前/.test(text)) return "吃饭前半小时";
  if (/饭后/.test(text)) return "吃完饭以后";
  if (/随餐/.test(text)) return "吃饭时";
  if (/睡前/.test(text)) return "准备睡觉前";
  return relation || "按说明书或处方使用";
}

export function relativeStatus(scheduledAt: string, now = new Date()): string {
  const diff = (new Date(scheduledAt).getTime() - now.getTime()) / 60000;
  if (diff > 60) return `${Math.round(diff / 60)} 小时后`;
  if (diff > 0) return `${Math.round(diff)} 分钟后`;
  if (diff > -120) return `已过 ${Math.round(Math.abs(diff))} 分钟`;
  return `已过 ${Math.round(Math.abs(diff) / 60)} 小时`;
}
