import {
  BellOff,
  BellRing,
  Camera,
  CircleCheck,
  Clock3,
  Eye,
  Pill,
  Printer,
  ShieldCheck,
  Trash2
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { AddMedicationPage } from "./AddMedicationPage";
import { DosageFormSafetyNotice } from "../components/DosageFormSafetyNotice";
import { useAppStore } from "../store/useAppStore";

export function MedicationsPage() {
  const navigate = useNavigate();
  const role = useAppStore((state) => state.role);
  const medications = useAppStore((state) => state.medications);
  const riskChecks = useAppStore((state) => state.riskChecks);
  const deleteMedication = useAppStore((state) => state.deleteMedication);
  const updateMedication = useAppStore((state) => state.updateMedication);
  const readOnly = role === "family";
  const [addMode, setAddMode] = useState<"photo" | "manual" | null>(null);
  const [addSession, setAddSession] = useState(0);

  function startAdding(mode: "photo" | "manual") {
    setAddMode(mode);
    setAddSession((current) => current + 1);
  }

  function removeMedication(id: string, name: string) {
    if (
      window.confirm(
        `确定删除“${name}”吗？该药的提醒和历史服药状态也会一起移除。`
      )
    ) {
      deleteMedication(id);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">{readOnly ? "家属端 · 用药摘要" : "当前用药"}</p>
          <h1 className="page-title">{readOnly ? "老人正在使用的药物" : "先核对，再安心使用"}</h1>
          <p className="page-description">
            {readOnly
              ? "这里只展示老人授权共享的用药摘要。家属不能代替老人确认已服药。"
              : "每种药都能看到用法、来源和最近核查结果。看不清的字段可以随时纠正。"}
          </p>
        </div>
        <div className="header-actions">
          {!readOnly ? (
            <>
              <button
                className={`btn btn-large medication-action-button ${
                  addMode === "photo" ? "btn-primary is-active" : ""
                }`}
                type="button"
                aria-current={addMode === "photo" ? "step" : undefined}
                onClick={() => startAdding("photo")}
              >
                <Camera size={21} aria-hidden="true" />
                拍照加药
              </button>
              <button
                className={`btn btn-large medication-action-button ${
                  addMode === "manual" ? "btn-primary is-active" : ""
                }`}
                type="button"
                aria-current={addMode === "manual" ? "step" : undefined}
                onClick={() => startAdding("manual")}
              >
                <Pill size={21} aria-hidden="true" />
                输入药名加药
              </button>
            </>
          ) : null}
          <button
            className="btn btn-large medication-action-button"
            type="button"
            onClick={() => navigate("/emergency-card")}
          >
            <Printer size={21} aria-hidden="true" />
            个人急救卡
          </button>
        </div>
      </header>

      {addMode ? (
        <AddMedicationPage
          key={`${addMode}-${addSession}`}
          embedded
          captureOnOpen={addMode === "photo"}
          manualOnOpen={addMode === "manual"}
          onExit={() => setAddMode(null)}
        />
      ) : !medications.length ? (
        <section className="card card-pad empty-medication-state">
          <span className="upload-icon">
            <Pill size={32} aria-hidden="true" />
          </span>
          <h2>还没有添加自己的药品</h2>
          <p>
            系统不会自动放入演示药物。请按照医生处方或您实际在用的药，
            使用页面上方入口添加。
          </p>
          <div className="empty-medication-guidance">
            <div className="empty-medication-feature-grid">
              <article>
                <span>
                  <CircleCheck size={21} aria-hidden="true" />
                </span>
                <h3>先核对，再加入</h3>
                <p>药名、剂量和服用时间都能修改，确认后才进入用药清单。</p>
              </article>
              <article>
                <span>
                  <ShieldCheck size={21} aria-hidden="true" />
                </span>
                <h3>自动检查风险</h3>
                <p>结合过敏史、慢性病和当前药物，提示重复成分与相互作用。</p>
              </article>
              <article>
                <span>
                  <Pill size={21} aria-hidden="true" />
                </span>
                <h3>剂型安全提醒</h3>
                <p>单独说明能否掰开、碾碎或嚼碎，缓释和肠溶制剂重点提示。</p>
              </article>
            </div>
            <div className="empty-medication-capture-tip">
              <Camera size={23} aria-hidden="true" />
              <div>
                <strong>拍照录入更省事</strong>
                <p>尽量拍清药盒正面、规格和用法那一面；看不清时可以再手动修改。</p>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <div className="medication-list">
          {medications.map((medication) => {
          const relatedRisk = riskChecks.find((riskCheck) =>
            riskCheck.involvedMedicationIds.includes(medication.id)
          );
          return (
            <article
              className="card medication-card"
              key={medication.id}
            >
              <span className="medication-icon">
                <Pill size={28} aria-hidden="true" />
              </span>
              <span className="medication-info">
                <h3>{medication.name}</h3>
                <p>
                  {medication.dosage} · {medication.times.join("、")} · {medication.relation}
                </p>
                <span className="medication-meta">
                  <span className={medication.status === "active" ? "chip risk-low" : "chip"}>
                    <CircleCheck size={14} aria-hidden="true" />
                    {medication.status === "active"
                      ? "当前服用"
                      : medication.status === "pending"
                        ? "待核对"
                        : "已停用"}
                  </span>
                  <span className="chip">
                    <Clock3 size={14} aria-hidden="true" />
                    {medication.frequency}
                  </span>
                  {relatedRisk ? (
                    <span className={`chip risk-${relatedRisk.level}`}>
                      最近核查：{relatedRisk.title}
                    </span>
                  ) : null}
                </span>
                <DosageFormSafetyNotice
                  medicationName={medication.name}
                  instructions={medication.instructions}
                  compact
                />
              </span>
              <span className="medication-side">
                {!readOnly ? (
                  <label className="medication-reminder-toggle">
                    {medication.reminderEnabled === false ? (
                      <BellOff size={18} aria-hidden="true" />
                    ) : (
                      <BellRing size={18} aria-hidden="true" />
                    )}
                    <span>{medication.reminderEnabled === false ? "提醒关" : "提醒开"}</span>
                    <span className="switch">
                      <input
                        type="checkbox"
                        checked={medication.reminderEnabled !== false}
                        aria-label={`${medication.name}吃药提醒`}
                        onChange={(event) =>
                          updateMedication(medication.id, {
                            reminderEnabled: event.target.checked
                          })
                        }
                      />
                      <span aria-hidden="true" />
                    </span>
                  </label>
                ) : (
                  <span className="chip">
                    {medication.reminderEnabled === false ? "提醒关闭" : "提醒开启"}
                  </span>
                )}
                <button
                  type="button"
                  className="btn"
                  onClick={() => navigate(`/medications/${medication.id}`)}
                >
                  <Eye size={18} aria-hidden="true" />
                  查看
                </button>
                {!readOnly ? (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`删除${medication.name}`}
                    onClick={() => removeMedication(medication.id, medication.name)}
                  >
                    <Trash2 size={20} aria-hidden="true" />
                  </button>
                ) : null}
              </span>
            </article>
          );
          })}
        </div>
      )}
    </div>
  );
}
