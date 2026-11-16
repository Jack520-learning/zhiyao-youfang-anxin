import { ArrowLeft, Clock3, ShieldAlert, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { RiskBadge } from "../components/RiskBadge";
import { SourcesBlock } from "../components/SourcesBlock";
import { FamilyRiskReviewButton } from "../components/FamilyRiskReviewButton";
import { useAppStore } from "../store/useAppStore";
import { trackableRiskChecks } from "../lib/riskTracking";

export function SafetyPage() {
  const navigate = useNavigate();
  const riskChecks = useAppStore((state) => state.riskChecks);
  const role = useAppStore((state) => state.role);
  const consent = useAppStore((state) => state.consent);
  const trackedRisks = trackableRiskChecks(riskChecks);
  const risks =
    role === "family" && !consent.shareHighRisk
      ? trackedRisks.filter((riskCheck) => riskCheck.level !== "high")
      : trackedRisks;

  return (
    <div className="page">
      <button
        className="btn btn-ghost page-back"
        type="button"
        onClick={() => navigate(role === "family" ? "/family" : "/today")}
      >
        <ArrowLeft size={19} aria-hidden="true" />
        {role === "family" ? "返回家人概览" : "返回今日"}
      </button>
      <header className="page-header">
        <div>
          <p className="eyebrow">{role === "family" ? "家属端 · 风险提醒" : "安全核查记录"}</p>
          <h1 className="page-title">先处理真正需要介入的风险</h1>
          <p className="page-description">
            高风险信息不能被静默关闭。家属可以协助老人联系医生，但不能替老人确认已服药。
          </p>
        </div>
      </header>

      {risks.length ? (
        <div style={{ display: "grid", gap: 14 }}>
          {risks.map((riskCheck) => (
            <section className="card card-pad" key={riskCheck.id}>
              <div className="section-heading">
                <div>
                  <h2>{riskCheck.title}</h2>
                  <p>
                    <Clock3 size={14} style={{ verticalAlign: "middle" }} aria-hidden="true" />{" "}
                    {new Date(riskCheck.createdAt).toLocaleString("zh-CN")}
                  </p>
                </div>
                <RiskBadge level={riskCheck.level} />
              </div>
              <div className={`risk-card ${riskCheck.level}`}>
                <h3>{riskCheck.summary}</h3>
                <p>{riskCheck.nextStep}</p>
              </div>
              <div className="chip-row" style={{ marginTop: 12 }}>
                <span className="chip">
                  <ShieldCheck size={14} aria-hidden="true" />
                  已核对 {riskCheck.medicationSnapshot.length} 种药物
                </span>
                {riskCheck.reasons.map((reason) => (
                  <span className="chip" key={reason}>{reason}</span>
                ))}
              </div>
              {role === "family" ? (
                <FamilyRiskReviewButton riskCheck={riskCheck} />
              ) : null}
              <details style={{ marginTop: 14 }}>
                <summary className="text-link">查看核查依据</summary>
                <SourcesBlock sourceIds={riskCheck.sourceIds} />
              </details>
            </section>
          ))}
        </div>
      ) : (
        <section className="card card-pad">
          <div className="notice">
            <ShieldAlert size={21} aria-hidden="true" />
            当前没有授权范围内的风险记录。老人完成一次药物核查后，摘要会出现在这里。
          </div>
          <button className="btn btn-primary" type="button" style={{ marginTop: 16 }} onClick={() => navigate(role === "family" ? "/family" : "/chat")}>
            {role === "family" ? "返回家人概览" : "去问药"}
          </button>
        </section>
      )}
    </div>
  );
}
