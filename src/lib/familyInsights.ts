import type { DoseEvent, Medication, RiskCheck } from "../types";
import { getTodayDoses } from "./time";
import { trackableRiskChecks } from "./riskTracking";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface FamilyMedicationDay {
  dateKey: string;
  weekdayLabel: string;
  dateLabel: string;
  scheduled: number;
  taken: number;
  skipped: number;
  unsure: number;
  pending: number;
  confirmationRate: number | null;
}

export interface FamilyRiskCategory {
  key: "high" | "medium" | "low" | "unknown";
  label: string;
  count: number;
}

export function buildMedicationTrend(
  medications: Medication[],
  doseEvents: DoseEvent[],
  options?: {
    days?: number;
    now?: Date;
    timeZone?: string;
  }
): FamilyMedicationDay[] {
  const days = Math.max(1, Math.min(options?.days ?? 7, 31));
  const now = options?.now ?? new Date();
  const timeZone = options?.timeZone ?? "Asia/Shanghai";

  return Array.from({ length: days }, (_, index) => {
    const day = new Date(now.getTime() - (days - index - 1) * DAY_MS);
    const doses = getTodayDoses(medications, doseEvents, day, timeZone);
    const taken = doses.filter((dose) => dose.status === "taken").length;
    const skipped = doses.filter((dose) => dose.status === "skipped").length;
    const unsure = doses.filter((dose) => dose.status === "unsure").length;
    const pending = doses.filter(
      (dose) => dose.status === "pending" || dose.status === "later"
    ).length;
    return {
      dateKey: new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(day),
      weekdayLabel: new Intl.DateTimeFormat("zh-CN", {
        timeZone,
        weekday: "short"
      }).format(day),
      dateLabel: new Intl.DateTimeFormat("zh-CN", {
        timeZone,
        month: "numeric",
        day: "numeric"
      }).format(day),
      scheduled: doses.length,
      taken,
      skipped,
      unsure,
      pending,
      confirmationRate: doses.length
        ? Math.round((taken / doses.length) * 100)
        : null
    };
  });
}

export function buildRiskDistribution(
  riskChecks: RiskCheck[],
  options?: {
    includeHighRisk?: boolean;
    days?: number;
    now?: Date;
  }
): FamilyRiskCategory[] {
  const includeHighRisk = options?.includeHighRisk ?? true;
  const days = Math.max(1, Math.min(options?.days ?? 30, 365));
  const cutoff = (options?.now ?? new Date()).getTime() - days * DAY_MS;
  const visible = trackableRiskChecks(riskChecks).filter((riskCheck) => {
    const createdAt = new Date(riskCheck.createdAt).getTime();
    return (
      Number.isFinite(createdAt) &&
      createdAt >= cutoff &&
      (includeHighRisk ||
        (riskCheck.level !== "high" && riskCheck.level !== "emergency"))
    );
  });

  const count = (...levels: RiskCheck["level"][]) =>
    visible.filter((riskCheck) => levels.includes(riskCheck.level)).length;

  return [
    { key: "high", label: "高风险", count: count("high", "emergency") },
    { key: "medium", label: "需关注", count: count("medium") },
    { key: "low", label: "低风险", count: count("low") },
    { key: "unknown", label: "待核对", count: count("unknown") }
  ];
}
