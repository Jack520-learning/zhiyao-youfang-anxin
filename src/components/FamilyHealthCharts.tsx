import {
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  PieChart,
  ShieldCheck
} from "lucide-react";
import { useMemo, type CSSProperties } from "react";
import {
  buildMedicationTrend,
  buildRiskDistribution
} from "../lib/familyInsights";
import type { DoseEvent, Medication, RiskCheck } from "../types";

interface FamilyHealthChartsProps {
  medications: Medication[];
  doseEvents: DoseEvent[];
  riskChecks: RiskCheck[];
  timeZone: string;
  shareMedicationSummary: boolean;
  shareMissedDose: boolean;
  shareHighRisk: boolean;
}

const riskColors: Record<string, string> = {
  high: "var(--red)",
  medium: "var(--amber)",
  low: "var(--primary)",
  unknown: "#86958f"
};

export function FamilyHealthCharts({
  medications,
  doseEvents,
  riskChecks,
  timeZone,
  shareMedicationSummary,
  shareMissedDose,
  shareHighRisk
}: FamilyHealthChartsProps) {
  const trend = useMemo(
    () =>
      buildMedicationTrend(medications, doseEvents, {
        days: 7,
        timeZone
      }),
    [medications, doseEvents, timeZone]
  );
  const riskDistribution = useMemo(
    () =>
      buildRiskDistribution(riskChecks, {
        days: 30,
        includeHighRisk: shareHighRisk
      }),
    [riskChecks, shareHighRisk]
  );

  const totalScheduled = trend.reduce(
    (total, day) => total + day.scheduled,
    0
  );
  const totalTaken = trend.reduce((total, day) => total + day.taken, 0);
  const overallRate = totalScheduled
    ? Math.round((totalTaken / totalScheduled) * 100)
    : null;
  const riskTotal = riskDistribution.reduce(
    (total, category) => total + category.count,
    0
  );
  let gradientCursor = 0;
  const donutBackground = riskTotal
    ? `conic-gradient(${riskDistribution
        .map((category) => {
          const start = gradientCursor;
          gradientCursor += (category.count / riskTotal) * 100;
          return `${riskColors[category.key]} ${start}% ${gradientCursor}%`;
        })
        .join(", ")})`
    : "var(--surface-soft)";

  const canShowTrend = shareMedicationSummary && shareMissedDose;

  return (
    <section className="card card-pad family-health-charts">
      <div className="section-heading">
        <div>
          <h2>近 7 天用药与风险概览</h2>
          <p>直接使用老人端最近同步的用药和风险记录。</p>
        </div>
        <ChartNoAxesColumnIncreasing
          size={24}
          color="var(--primary)"
          aria-hidden="true"
        />
      </div>

      <div className="family-chart-grid">
        <figure className="family-chart-panel">
          <figcaption>
            <span className="family-chart-title">
              <CalendarDays size={19} aria-hidden="true" />
              <span>
                <strong>服药确认趋势</strong>
                <small>
                  已确认 {totalTaken} / {totalScheduled} 个用药窗口
                </small>
              </span>
            </span>
            <span className="family-chart-badge">
              {overallRate === null ? "暂无计划" : `近 7 天 ${overallRate}%`}
            </span>
          </figcaption>

          {canShowTrend ? (
            <div
              className="family-adherence-chart"
              role="img"
              aria-label={`近7天服药确认趋势，共${totalScheduled}个用药窗口，已确认${totalTaken}个。`}
            >
              {trend.map((day) => {
                const height = day.confirmationRate ?? 0;
                return (
                  <div className="family-adherence-day" key={day.dateKey}>
                    <span className="family-chart-value">
                      {day.confirmationRate === null
                        ? "—"
                        : `${day.confirmationRate}%`}
                    </span>
                    <span className="family-chart-track" aria-hidden="true">
                      <i
                        style={{ height: `${height}%` }}
                        className={height === 100 ? "complete" : ""}
                      />
                    </span>
                    <strong>{day.weekdayLabel}</strong>
                    <small>{day.dateLabel}</small>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="family-chart-restricted">
              <ShieldCheck size={22} aria-hidden="true" />
              老人尚未授权共享用药摘要与服药记录，因此暂不显示趋势。
            </div>
          )}
        </figure>

        <figure className="family-chart-panel">
          <figcaption>
            <span className="family-chart-title">
              <PieChart size={19} aria-hidden="true" />
              <span>
                <strong>近 30 天风险分布</strong>
                <small>共 {riskTotal} 次风险核查记录</small>
              </span>
            </span>
          </figcaption>

          <div className="family-risk-chart">
            <div
              className="family-risk-donut"
              style={{ background: donutBackground } as CSSProperties}
              role="img"
              aria-label={`近30天风险分布：${riskDistribution
                .map((category) => `${category.label}${category.count}次`)
                .join("，")}。`}
            >
              <span>
                <strong>{riskTotal}</strong>
                <small>次核查</small>
              </span>
            </div>
            <div className="family-risk-legend">
              {riskDistribution.map((category) => (
                <div key={category.key}>
                  <span
                    className={`family-risk-dot ${category.key}`}
                    aria-hidden="true"
                  />
                  <span>{category.label}</span>
                  <strong>{category.count}</strong>
                </div>
              ))}
            </div>
          </div>
        </figure>
      </div>

      <p className="family-chart-footnote">
        “待确认”不等于漏服；只统计药品启用后的真实窗口和老人端已同步的核查记录，不用于疾病诊断。
      </p>
    </section>
  );
}
