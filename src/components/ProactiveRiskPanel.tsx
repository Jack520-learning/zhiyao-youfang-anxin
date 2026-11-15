import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronRight
} from "lucide-react";
import { buildProactiveRiskInsights } from "../lib/proactiveRisk";
import { useAppStore } from "../store/useAppStore";

export function ProactiveRiskPanel({ limit = 3 }: { limit?: number }) {
  const medications = useAppStore((state) => state.medications);
  const doseEvents = useAppStore((state) => state.doseEvents);
  const riskChecks = useAppStore((state) => state.riskChecks);
  const familyAlerts = useAppStore((state) => state.familyAlerts);
  const insights = buildProactiveRiskInsights({
    medications,
    doseEvents,
    riskChecks,
    familyAlerts
  });
  const visible = insights.slice(0, limit);

  return (
    <section className="card card-pad proactive-risk-panel" aria-live="polite">
      <div className="section-heading">
        <div>
          <p className="eyebrow">主动安全趋势</p>
          <h2>系统提前发现的风险</h2>
          <p>综合分析近 7 天服药记录、当前药物和家庭求助。</p>
        </div>
        <Activity size={24} color="var(--primary)" aria-hidden="true" />
      </div>
      <div className="proactive-risk-list">
        {visible.map((insight) => (
          <article
            className={`proactive-risk-item ${insight.level}`}
            key={insight.id}
          >
            <span className="proactive-risk-icon" aria-hidden="true">
              {insight.level === "low" ? (
                <CheckCircle2 size={20} />
              ) : (
                <AlertTriangle size={20} />
              )}
            </span>
            <div>
              <div className="proactive-risk-title">
                <strong>{insight.title}</strong>
                {insight.metric ? <b>{insight.metric}</b> : null}
              </div>
              <p>{insight.detail}</p>
              <span>{insight.action}</span>
            </div>
          </article>
        ))}
      </div>
      {insights.length > visible.length ? (
        <details className="proactive-risk-more">
          <summary>
            查看其余 {insights.length - visible.length} 项趋势
            <ChevronRight size={16} aria-hidden="true" />
          </summary>
          <div className="proactive-risk-list">
            {insights.slice(visible.length).map((insight) => (
              <article
                className={`proactive-risk-item ${insight.level}`}
                key={`more-${insight.id}`}
              >
                <span className="proactive-risk-icon" aria-hidden="true">
                  <AlertTriangle size={20} />
                </span>
                <div>
                  <strong>{insight.title}</strong>
                  <p>{insight.detail}</p>
                  <span>{insight.action}</span>
                </div>
              </article>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}
