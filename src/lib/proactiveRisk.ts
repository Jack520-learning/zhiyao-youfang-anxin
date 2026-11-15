import type {
  DoseEvent,
  FamilyAlert,
  Medication,
  RiskCheck
} from "../types";

export interface ProactiveRiskInsight {
  id: string;
  level: "high" | "medium" | "low";
  title: string;
  detail: string;
  action: string;
  metric?: string;
}

interface ProactiveRiskInput {
  medications: Medication[];
  doseEvents: DoseEvent[];
  riskChecks: RiskCheck[];
  familyAlerts: FamilyAlert[];
  now?: Date;
}

function normalize(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function withinDays(value: string, days: number, now: Date): boolean {
  const time = new Date(value).getTime();
  return Number.isFinite(time) && now.getTime() - time <= days * 86_400_000;
}

export function buildProactiveRiskInsights({
  medications,
  doseEvents,
  riskChecks,
  familyAlerts,
  now = new Date()
}: ProactiveRiskInput): ProactiveRiskInsight[] {
  const activeMedications = medications.filter(
    (medication) => medication.status === "active"
  );
  const insights: ProactiveRiskInsight[] = [];
  const recentDoseEvents = doseEvents.filter((event) =>
    withinDays(event.scheduledAt, 7, now)
  );
  const taken = recentDoseEvents.filter(
    (event) => event.status === "taken"
  ).length;
  const missed = recentDoseEvents.filter(
    (event) => event.status === "skipped" || event.status === "unsure"
  ).length;
  const actionable = taken + missed;
  const adherenceRate = actionable
    ? Math.round((taken / actionable) * 100)
    : null;

  if (missed >= 2) {
    insights.push({
      id: "repeated-missed-doses",
      level: missed >= 3 ? "high" : "medium",
      title: "近 7 天多次未确认或未服药",
      detail: `过去 7 天记录了 ${missed} 次“没有服用”或“还不确定”。`,
      action:
        "先联系老人确认原因；不要直接补服或加倍，涉及抗凝药、胰岛素等药物时联系医生或药师。",
      metric: `${missed} 次`
    });
  }

  const duplicateGroups = new Map<string, Medication[]>();
  for (const medication of activeMedications) {
    for (const ingredient of medication.ingredients) {
      const key = normalize(ingredient);
      if (!key) continue;
      duplicateGroups.set(key, [
        ...(duplicateGroups.get(key) || []),
        medication
      ]);
    }
  }
  const duplicate = [...duplicateGroups.entries()].find(
    ([, group]) => new Set(group.map((item) => item.id)).size > 1
  );
  if (duplicate) {
    insights.push({
      id: "duplicate-active-ingredient",
      level: "high",
      title: `当前清单可能出现重复成分：${duplicate[0]}`,
      detail: duplicate[1].map((item) => item.name).join("、"),
      action:
        "不要自行叠加服用。请让医生或药师核对总剂量，并确认是否需要停用其中一种。"
    });
  }

  const highRiskReminderOff = activeMedications.find(
    (medication) =>
      medication.reminderEnabled === false &&
      /华法林|阿司匹林|胰岛素|抗凝|氯吡格雷|替格瑞洛|利伐沙班|地高辛|胺碘酮/.test(
        `${medication.name}${medication.ingredients.join("")}`
      )
  );
  if (highRiskReminderOff) {
    insights.push({
      id: "high-risk-reminder-off",
      level: "high",
      title: `${highRiskReminderOff.name}的提醒处于关闭状态`,
      detail: "这类药物漏服后通常不能自行加倍补服。",
      action:
        "打开提醒，并让开药医生或药师确认漏服处理方式；不要自行停药或补双倍。"
    });
  }

  if (activeMedications.length >= 5) {
    insights.push({
      id: "polypharmacy",
      level: "medium",
      title: "当前同时使用 5 种或更多药物",
      detail: `当前清单共有 ${activeMedications.length} 种在用药物。`,
      action:
        "复诊时携带完整药盒或用药清单，请医生或药师集中核对相互作用和重复成分。",
      metric: `${activeMedications.length} 种`
    });
  }

  const recentHighRisk = riskChecks.find(
    (riskCheck) =>
      (riskCheck.level === "high" || riskCheck.level === "emergency") &&
      withinDays(riskCheck.createdAt, 14, now)
  );
  if (recentHighRisk) {
    insights.push({
      id: "recent-high-risk",
      level: "high",
      title: "最近仍有未解决的高风险用药提示",
      detail: recentHighRisk.title,
      action:
        recentHighRisk.nextStep ||
        "请让医生或药师核对此项风险，不要自行调整药物。"
    });
  }

  const unhandledAlerts = familyAlerts.filter(
    (alert) =>
      !alert.handledAt &&
      withinDays(alert.createdAt, 15, now)
  );
  if (unhandledAlerts.length) {
    insights.push({
      id: "unhandled-family-alert",
      level: "high",
      title: "有尚未处理的身体不适或求助",
      detail: unhandledAlerts[0].message,
      action:
        "尽快联系老人确认当前状态；胸痛、呼吸困难、意识异常或明显出血时立即拨打 120。",
      metric: `${unhandledAlerts.length} 条`
    });
  }

  if (adherenceRate !== null && adherenceRate < 70 && missed < 2) {
    insights.push({
      id: "low-adherence",
      level: "medium",
      title: "近 7 天服药确认率偏低",
      detail: `已记录操作中，确认服用的比例为 ${adherenceRate}%。`,
      action:
        "先确认是否只是忘记点击记录，再询问是否存在吞咽、取药或记忆困难。",
      metric: `${adherenceRate}%`
    });
  }

  if (!insights.length) {
    insights.push(
      activeMedications.length
        ? {
            id: "stable-trend",
            level: "low",
            title: "近 7 天暂未发现明显用药异常趋势",
            detail: adherenceRate === null
              ? "当前没有足够的服药操作记录。"
              : `已记录操作中的确认服用比例为 ${adherenceRate}%。`,
            action:
              "继续保持按时确认和记录；新增药物或出现身体不适时及时重新核查。"
          }
        : {
            id: "start-profile",
            level: "low",
            title: "还没有当前用药数据",
            detail: "建立用药清单后，系统才能分析趋势和主动风险。",
            action: "根据实际处方添加药物，不要为了体验功能填写不存在的药。"
          }
    );
  }

  const rank: Record<ProactiveRiskInsight["level"], number> = {
    high: 0,
    medium: 1,
    low: 2
  };
  return insights.sort((left, right) => rank[left.level] - rank[right.level]);
}
