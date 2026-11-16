import type { DoseEvent, DoseStatus, Medication } from "../types";

export function nowIso(): string {
  return new Date().toISOString();
}

export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
}

export function formatTimeZoneLabel(timeZone: string): string {
  const labels: Record<string, string> = {
    "Asia/Shanghai": "中国标准时间（上海）",
    "Asia/Chongqing": "中国标准时间（重庆）",
    "Asia/Harbin": "中国标准时间（哈尔滨）",
    "Asia/Hong_Kong": "香港时间",
    "Asia/Macau": "澳门时间",
    "Asia/Taipei": "台北时间",
    "Asia/Tokyo": "日本时间",
    "Asia/Seoul": "韩国时间",
    UTC: "协调世界时"
  };
  return labels[timeZone] || "本地时区";
}

function dateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
    hour: Number(parts.find((part) => part.type === "hour")?.value),
    minute: Number(parts.find((part) => part.type === "minute")?.value),
    second: Number(parts.find((part) => part.type === "second")?.value)
  };
}

function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = dateParts(date, timeZone);
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return representedAsUtc - Math.floor(date.getTime() / 1000) * 1000;
}

export function dateKey(
  date = new Date(),
  timeZone = localTimeZone()
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function formatChineseDate(
  date = new Date(),
  timeZone = localTimeZone()
): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(date);
}

export function formatTime(date: Date, timeZone = localTimeZone()): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

/**
 * 消息时间戳格式化：今天 HH:mm / 昨天 HH:mm / MM月DD日 HH:mm / YYYY年MM月DD日 HH:mm
 */
export function formatMessageTime(
  isoOrDate: string | Date,
  now = new Date(),
  timeZone = localTimeZone()
): string {
  const date = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (isNaN(date.getTime())) return "";
  const parts = dateParts(date, timeZone);
  const nowParts = dateParts(now, timeZone);
  const time = formatTime(date, timeZone);
  const sameDay =
    parts.year === nowParts.year &&
    parts.month === nowParts.month &&
    parts.day === nowParts.day;
  if (sameDay) return `今天 ${time}`;
  // 昨天
  const yesterday = new Date(now.getTime() - 86_400_000);
  const yParts = dateParts(yesterday, timeZone);
  if (
    parts.year === yParts.year &&
    parts.month === yParts.month &&
    parts.day === yParts.day
  )
    return `昨天 ${time}`;
  // 同一年
  if (parts.year === nowParts.year)
    return `${parts.month}月${parts.day}日 ${time}`;
  return `${parts.year}年${parts.month}月${parts.day}日 ${time}`;
}

export function scheduledDateTime(
  time: string,
  day = new Date(),
  timeZone = localTimeZone()
): Date {
  const [hours, minutes] = time.split(":").map(Number);
  const parts = dateParts(day, timeZone);
  let utcValue = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    hours,
    minutes,
    0
  );
  for (let index = 0; index < 2; index += 1) {
    utcValue =
      Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        hours,
        minutes,
        0
      ) - timeZoneOffsetMs(new Date(utcValue), timeZone);
  }
  return new Date(utcValue);
}

export function getTodayDoses(
  medications: Medication[],
  doseEvents: DoseEvent[],
  day = new Date(),
  timeZone = localTimeZone()
): Array<{
  medication: Medication;
  scheduledAt: string;
  status: DoseStatus;
  doseId: string;
  recordedAt?: string;
}> {
  const key = dateKey(day, timeZone);
  return medications
    .filter(
      (medication) =>
        medication.status === "active" && medication.reminderEnabled !== false
    )
    .flatMap((medication) =>
      medication.times.map((time) => {
        const scheduled = scheduledDateTime(time, day, timeZone);
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
  day = new Date(),
  timeZone = localTimeZone()
) {
  const doses = getTodayDoses(medications, doseEvents, day, timeZone);
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
