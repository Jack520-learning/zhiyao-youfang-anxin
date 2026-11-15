import {
  ArrowLeft,
  Check,
  CircleHelp,
  Clock3,
  PhoneCall,
  ShieldAlert
} from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { RiskBadge } from "../components/RiskBadge";
import { SourcesBlock } from "../components/SourcesBlock";
import { handleMissedDose } from "../lib/riskEngine";
import { getTodayDoses, humanizeRelation } from "../lib/time";
import { useAppStore } from "../store/useAppStore";
import type { RiskCheck } from "../types";

export function ReminderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const medications = useAppStore((state) => state.medications);
  const profile = useAppStore((state) => state.profile);
  const doseEvents = useAppStore((state) => state.doseEvents);
  const contacts = useAppStore((state) => state.emergencyContacts);
  const updateDose = useAppStore((state) => state.updateDose);
  const addRiskCheck = useAppStore((state) => state.addRiskCheck);
  const medication = medications.find((item) => item.id === id);
  const [riskCheck, setRiskCheck] = useState<RiskCheck>();
  const [recorded, setRecorded] = useState(false);

  if (!medication) {
    return (
      <div className="page">
        <div className="card card-pad">
          <h1 className="page-title">没有找到这次提醒</h1>
          <button className="btn btn-primary" type="button" onClick={() => navigate("/today")}>
            返回首页
          </button>
        </div>
      </div>
    );
  }

  const dose = getTodayDoses(
    medications,
    doseEvents,
    new Date(),
    profile.timeZone
  ).find(
    (item) => item.medication.id === medication.id
  );

  function recordMissedDose() {
    const check = handleMissedDose(medication!, medications);
    setRiskCheck(check);
    addRiskCheck(check);
    if (dose) {
      updateDose(medication!.id, dose.scheduledAt, "skipped", dose.doseId);
    }
    setRecorded(true);
  }

  return (
    <div className="page">
      <button className="btn btn-ghost" type="button" onClick={() => navigate("/today")}>
        <ArrowLeft size={19} aria-hidden="true" />
        返回今日
      </button>
      <header className="page-header" style={{ marginTop: 16 }}>
        <div>
          <p className="eyebrow">漏服处理 · 不自动猜测</p>
          <h1 className="page-title">先确认这次真的没有服用</h1>
          <p className="page-description">
            只有明确选择“没有服用”，才会进入漏服处理。忘记点击不等于漏服。
          </p>
        </div>
        <Clock3 size={32} color="var(--primary)" aria-hidden="true" />
      </header>

      <div className="intake-layout">
        <section className="card card-pad progress-panel">
          <div className="notice warm">
            <ShieldAlert size={22} aria-hidden="true" />
            {humanizeRelation(medication.relation)}，{medication.name}，{medication.dosage}。
          </div>
          <p style={{ marginTop: 16, color: "var(--muted)", lineHeight: 1.7 }}>
            如果您已经服用，请返回记录为“已服用”。系统不会因为提醒超时自动认定漏服。
          </p>
          <button
            className="btn btn-primary btn-large"
            type="button"
            style={{ width: "100%", marginTop: 20 }}
            disabled={recorded}
            onClick={recordMissedDose}
          >
            <Check size={21} aria-hidden="true" />
            {recorded ? "已记录为没有服用" : "我确定这次没有服用"}
          </button>
          <button
            className="btn btn-large"
            type="button"
            style={{ width: "100%", marginTop: 10 }}
            onClick={() => navigate("/today")}
          >
            <CircleHelp size={21} aria-hidden="true" />
            我不确定，先返回
          </button>
        </section>

        <section className="card card-pad">
          {!riskCheck ? (
            <>
              <h2 style={{ fontSize: 24 }}>处理规则</h2>
              <div className="notice" style={{ marginTop: 14 }}>
                <ShieldAlert size={21} aria-hidden="true" />
                系统会先检查这是不是华法林、胰岛素等需要谨慎处理的药物。高风险时不会给出具体补服时间或剂量。
              </div>
            </>
          ) : (
            <>
              <div className="message-risk-top">
                <h2 style={{ fontSize: 25 }}>{riskCheck.title}</h2>
                <RiskBadge level={riskCheck.level} />
              </div>
              <p style={{ marginTop: 12, color: "var(--muted)", fontSize: 17, lineHeight: 1.7 }}>
                {riskCheck.summary}
              </p>
              <div className={`risk-card ${riskCheck.level}`} style={{ marginTop: 16 }}>
                <h3>现在怎么做</h3>
                <p>{riskCheck.nextStep}</p>
              </div>
              <SourcesBlock sourceIds={riskCheck.sourceIds} />
              <div className="header-actions" style={{ marginTop: 18 }}>
                {contacts[0] ? (
                  <a className="btn btn-primary btn-large" href={`tel:${contacts[0].phone}`}>
                    <PhoneCall size={21} aria-hidden="true" />
                    联系 {contacts[0].name}
                  </a>
                ) : null}
                <button className="btn btn-large" type="button" onClick={() => navigate("/chat")}>
                  继续问药
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
