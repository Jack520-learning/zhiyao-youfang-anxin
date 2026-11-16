import type {
  AssistantResponse,
  DoseEvent,
  ElderProfile,
  Medication
} from "../types";
import {
  dateKey,
  formatTime,
  scheduledDateTime
} from "./time";

export function isMedicationActivityQuery(query: string): boolean {
  const normalized = query.replace(/\s+/g, "");
  return /(今天|今日).*(吃(了|过)?(哪些|什么|哪几种|几种)?药|服药|用药)|(吃(了|过)?哪些药)|(吃过什么药)|用药记录|服药记录|提醒.*(情况|状态)|今天吃药了吗/i.test(
    normalized
  );
}

export function buildMedicationActivityResponse(
  query: string,
  medications: Medication[],
  doseEvents: DoseEvent[],
  profile: ElderProfile,
  now = new Date()
): AssistantResponse {
  const active = medications.filter((item) => item.status === "active");
  const key = dateKey(now, profile.timeZone);
  const scheduled = active.flatMap((medication) =>
    medication.times.map((time) => {
      const scheduledAt = scheduledDateTime(
        time,
        now,
        profile.timeZone
      ).toISOString();
      const doseId = `${key}-${medication.id}-${time}`;
      const event = doseEvents.find((item) => item.id === doseId);
      return {
        medication,
        scheduledAt,
        status: event?.status || "pending",
        recordedAt: event?.updatedAt
      };
    })
  );
  const taken = scheduled.filter((item) => item.status === "taken");
  const pending = scheduled.filter((item) => item.status === "pending");
  const later = scheduled.filter((item) => item.status === "later");
  const skipped = scheduled.filter((item) => item.status === "skipped");
  const unsure = scheduled.filter((item) => item.status === "unsure");
  const asNeeded = active.filter((item) => item.frequency === "按需服用");
  const reminderOff = active.filter(
    (item) => item.reminderEnabled === false && item.frequency !== "按需服用"
  );
  const lines: string[] = [];

  if (!active.length) {
    lines.push(
      "当前用药档案中没有已确认的在用药物，因此无法判断今天服用过哪些药。"
    );
  } else if (!scheduled.length) {
    lines.push("当前用药没有设置固定服用时间。");
  } else {
    lines.push(
      `今天共有 ${scheduled.length} 个固定用药窗口，已确认服用 ${taken.length} 个，尚未确认 ${pending.length} 个。`
    );
  }

  if (taken.length) {
    lines.push(
      "",
      "### 今天已确认服用",
      ...taken.map((item) => {
        const planned = formatTime(
          new Date(item.scheduledAt),
          profile.timeZone
        );
        const recorded = item.recordedAt
          ? formatTime(new Date(item.recordedAt), profile.timeZone)
          : "未记录";
        return `- ${item.medication.name}：每次 ${item.medication.dosage}，计划 ${planned}，记录 ${recorded}`;
      })
    );
  } else {
    lines.push("", "### 今天已确认服用", "今天还没有已点击确认的服药记录。");
  }

  const unconfirmed = [...pending, ...later];
  if (unconfirmed.length) {
    lines.push(
      "",
      "### 尚未确认",
      ...unconfirmed.map((item) => {
        const planned = formatTime(
          new Date(item.scheduledAt),
          profile.timeZone
        );
        return `- ${item.medication.name}：计划 ${planned}，${item.status === "later" ? "已选择稍后提醒" : "尚未点击确认"}`;
      })
    );
  }

  if (skipped.length || unsure.length) {
    lines.push(
      "",
      "### 特殊情况记录",
      ...skipped.map(
        (item) => `- ${item.medication.name}：记录为跳过本次`
      ),
      ...unsure.map(
        (item) => `- ${item.medication.name}：记录为不确定是否服用`
      )
    );
  }

  if (asNeeded.length) {
    lines.push(
      "",
      "### 按需服用",
      ...asNeeded.map(
        (item) => `- ${item.name}：不固定时间，不产生每日确认记录`
      )
    );
  }

  if (reminderOff.length) {
    lines.push(
      "",
      "### 提醒状态",
      ...reminderOff.map(
        (item) => `- ${item.name}：固定提醒当前已关闭`
      )
    );
  }

  lines.push(
    "",
    "### 下一步",
    "如果刚服用了药但还没有记录，请到“今日”页面确认；在确认前不要因为忘记是否服用而自行重复服药。"
  );

  return {
    message: [
      `## ${/提醒/.test(query) ? "今天的用药与提醒状态" : "今天的服药记录"}`,
      ...lines
    ].join("\n"),
    riskCheck: {
      id: `medication-activity-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      level: "low",
      title: "已结合今日计划和服药确认记录",
      summary: `当前档案有 ${active.length} 种在用药物，今日已确认 ${taken.length} 个服药窗口。`,
      nextStep:
        "未记录的服药不要直接重复服用，请先在今日页面核对或联系医生或药师。",
      reasons: [
        `读取日期：${key}`,
        `今日固定用药窗口：${scheduled.length}`,
        `提醒已关闭药物：${reminderOff.length}`
      ],
      sourceIds: ["src-user-profile"],
      involvedMedicationIds: active.map((item) => item.id),
      medicationSnapshot: active.map((item) => item.name),
      createdAt: now.toISOString()
    },
    stages: [
      { id: "medication-records", label: "读取当前用药记录", status: "done" },
      { id: "dose-events", label: "核对今日服药确认状态", status: "done" },
      { id: "reminders", label: "合并提醒设置", status: "done" }
    ],
    mode: "rules",
    groundingOnly: true
  };
}
