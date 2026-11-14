import {
  ArrowLeft,
  BellRing,
  Camera,
  Clock3,
  FileCheck2,
  Pill,
  ShieldCheck,
  Trash2
} from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { RiskBadge } from "../components/RiskBadge";
import { SourcesBlock } from "../components/SourcesBlock";
import { answerWithRules } from "../lib/riskEngine";
import {
  frequencyOptions,
  resizeTimes,
  validateDosageText,
  validateTimes
} from "../lib/dosage";
import { humanizeRelation } from "../lib/time";
import { useAppStore } from "../store/useAppStore";

export function MedicationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const role = useAppStore((state) => state.role);
  const medications = useAppStore((state) => state.medications);
  const profile = useAppStore((state) => state.profile);
  const riskChecks = useAppStore((state) => state.riskChecks);
  const doseEvents = useAppStore((state) => state.doseEvents);
  const addRiskCheck = useAppStore((state) => state.addRiskCheck);
  const updateMedication = useAppStore((state) => state.updateMedication);
  const deleteMedication = useAppStore((state) => state.deleteMedication);
  const medication = medications.find((item) => item.id === id);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(medication?.name ?? "");
  const [dosage, setDosage] = useState(medication?.dosage ?? "");
  const [relation, setRelation] = useState(medication?.relation ?? "");
  const [frequency, setFrequency] = useState(medication?.frequency ?? "每日 1 次");
  const [times, setTimes] = useState(medication?.times ?? ["08:00"]);
  const [doseError, setDoseError] = useState("");

  if (!medication) {
    return (
      <div className="page">
        <div className="card card-pad">
          <h1 className="page-title">没有找到这个药</h1>
          <button className="btn btn-primary" onClick={() => navigate("/medications")}>
            返回用药清单
          </button>
        </div>
      </div>
    );
  }

  const latestRisk = riskChecks.find((riskCheck) =>
    riskCheck.involvedMedicationIds.includes(medication.id)
  );

  function runSafetyCheck() {
    const currentMedication = medication;
    if (!currentMedication) return;
    const result = answerWithRules(
      `${currentMedication.name} 和当前这些药一起用要注意什么`,
      medications.filter((item) => item.status === "active"),
      profile
    );
    addRiskCheck(result.riskCheck);
  }

  function saveCorrection() {
    if (!medication) return;
    const dosageValidation = validateDosageText(dosage);
    if (!dosageValidation.valid) {
      setDoseError(dosageValidation.message ?? "剂量填写不正确");
      return;
    }
    const timeValidation = validateTimes(times);
    if (!timeValidation.valid) {
      setDoseError(timeValidation.message ?? "用药时间填写不正确");
      return;
    }
    updateMedication(medication.id, {
      name,
      dosage,
      relation,
      frequency,
      times
    });
    setDoseError("");
    setEditing(false);
  }

  function deleteCurrentMedication() {
    if (!medication) return;
    if (
      window.confirm(
        `确定删除“${medication.name}”吗？对应的提醒和服药记录也会被删除。`
      )
    ) {
      deleteMedication(medication.id);
      navigate("/medications");
    }
  }

  return (
    <div className="page">
      <button type="button" className="btn btn-ghost" onClick={() => navigate("/medications")}>
        <ArrowLeft size={19} aria-hidden="true" />
        返回用药清单
      </button>
      <header className="page-header" style={{ marginTop: 16 }}>
        <div>
          <p className="eyebrow">药物详情 · {medication.source.title}</p>
          <h1 className="page-title">{medication.name}</h1>
          <p className="page-description">
            {medication.genericName ? `通用名：${medication.genericName} · ` : ""}
            {medication.status === "active"
              ? "已加入当前用药"
              : medication.status === "pending"
                ? "待人工核对"
                : "已停用"}
          </p>
        </div>
        {latestRisk ? <RiskBadge level={latestRisk.level} /> : null}
      </header>

      <div className="intake-layout">
        <aside className="card card-pad progress-panel">
          <span className="medication-icon" style={{ width: 80, height: 80 }}>
            <Pill size={36} aria-hidden="true" />
          </span>
          <h2 style={{ marginTop: 18, fontSize: 24 }}>
            {humanizeRelation(medication.relation, medication.instructions)}
          </h2>
          <p style={{ marginTop: 9, color: "var(--muted)", lineHeight: 1.7 }}>
            {medication.dosage}
            <br />
            {medication.frequency}
            <br />
            提醒时间：{medication.times.join("、")}
            <br />
            参考价格：{medication.price || "暂无可靠价格"}
          </p>
          <div className="chip-row" style={{ marginTop: 16 }}>
            <span className="chip">
              <FileCheck2 size={14} aria-hidden="true" />
              来源已确认
            </span>
            <span className="chip">
              <Clock3 size={14} aria-hidden="true" />
              {medication.reminderEnabled === false ? "提醒已关闭" : "提醒已开启"}
            </span>
          </div>
          <div className="settings-row" style={{ marginTop: 14 }}>
            <div className="settings-copy">
              <strong>吃药提醒</strong>
              <span>{medication.reminderEnabled === false ? "当前不会提醒" : "按设置时间提醒"}</span>
            </div>
            <label className="switch">
              <span className="sr-only">吃药提醒</span>
              <input
                type="checkbox"
                checked={medication.reminderEnabled !== false}
                disabled={role !== "elder"}
                onChange={(event) =>
                  updateMedication(medication.id, {
                    reminderEnabled: event.target.checked
                  })
                }
              />
              <span aria-hidden="true" />
            </label>
          </div>
        </aside>

        <div style={{ display: "grid", gap: 18 }}>
          <section className="card card-pad">
            <div className="section-heading">
              <div>
                <h2>这盒药怎么吃</h2>
                <p>把专业说法转成日常生活里的时间。</p>
              </div>
              <ShieldCheck size={24} color="var(--primary)" aria-hidden="true" />
            </div>
            {editing && role === "elder" ? (
              <div className="form-grid">
                <label className="field">
                  <span className="field-label">药名</span>
                  <input className="input" value={name} onChange={(event) => setName(event.target.value)} />
                </label>
                <label className="field">
                  <span className="field-label">剂量</span>
                  <input className="input" value={dosage} onChange={(event) => setDosage(event.target.value)} />
                  <span className="field-hint">例如 5mg、1片；单次剂量不能超过合理填写上限。</span>
                </label>
                <label className="field">
                  <span className="field-label">饭前饭后</span>
                  <select className="select" value={relation} onChange={(event) => setRelation(event.target.value)}>
                    <option value="饭前">饭前</option>
                    <option value="饭后">饭后</option>
                    <option value="随餐">随餐</option>
                    <option value="睡前">睡前</option>
                    <option value="按需">按需</option>
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">每日次数</span>
                  <select
                    className="select"
                    value={frequency}
                    onChange={(event) => {
                      const option = frequencyOptions.find(
                        (item) => item.value === event.target.value
                      );
                      setFrequency(event.target.value);
                      setTimes(resizeTimes(times, option?.count ?? 1));
                    }}
                  >
                    {frequencyOptions.map((option) => (
                      <option value={option.value} key={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="field full">
                  <span className="field-label">第几次用药的时间</span>
                  <div className="time-slot-grid">
                    {times.map((time, index) => (
                      <label className="time-slot" key={`${index}-${time}`}>
                        <span>第 {index + 1} 次</span>
                        <input
                          className="input"
                          type="time"
                          value={time}
                          onChange={(event) => {
                            const nextTimes = [...times];
                            nextTimes[index] = event.target.value;
                            setTimes(nextTimes);
                          }}
                        />
                      </label>
                    ))}
                  </div>
                </div>
                <div className="field" style={{ alignSelf: "end" }}>
                  <button className="btn btn-primary" type="button" onClick={saveCorrection}>
                    保存纠正
                  </button>
                </div>
                {doseError ? (
                  <p className="field-error full" role="alert">{doseError}</p>
                ) : null}
              </div>
            ) : (
              <>
                <div className="notice">
                  <Clock3 size={20} aria-hidden="true" />
                  {humanizeRelation(medication.relation)}，{medication.dosage}。具体用法以已确认的处方或说明书为准。
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
                  <button className="btn btn-primary" type="button" onClick={runSafetyCheck}>
                    <ShieldCheck size={19} aria-hidden="true" />
                    检查当前用药风险
                  </button>
                  {role === "elder" ? (
                    <>
                      <button className="btn" type="button" onClick={() => setEditing(true)}>
                        说错了，我来改
                      </button>
                      <button className="btn btn-danger" type="button" onClick={deleteCurrentMedication}>
                        <Trash2 size={19} aria-hidden="true" />
                        删除这个药
                      </button>
                    </>
                  ) : null}
                </div>
              </>
            )}
          </section>

          <section className="card card-pad">
            <div className="section-heading">
              <div>
                <h2>服药记录时间</h2>
                <p>显示计划时间和实际点击记录的时间。</p>
              </div>
              <BellRing size={22} color="var(--primary)" aria-hidden="true" />
            </div>
            <div className="source-list">
              {doseEvents.filter((event) => event.medicationId === medication.id).length ? (
                doseEvents
                  .filter((event) => event.medicationId === medication.id)
                  .slice(0, 8)
                  .map((event) => (
                    <div className="source-item" key={event.id}>
                      <strong>
                        计划 {new Date(event.scheduledAt).toLocaleString("zh-CN")}
                      </strong>
                      <span>
                        记录时间 {new Date(event.updatedAt).toLocaleString("zh-CN")} ·
                        状态：{event.status}
                      </span>
                    </div>
                  ))
              ) : (
                <p className="field-hint">还没有服药操作记录。</p>
              )}
            </div>
          </section>

          <section className="card card-pad">
            <div className="section-heading">
              <div>
                <h2>最近一次风险核查</h2>
                <p>系统会核对当前全部在用药物和过敏史。</p>
              </div>
              {latestRisk ? <RiskBadge level={latestRisk.level} /> : null}
            </div>
            {latestRisk ? (
              <>
                <div className={`risk-card ${latestRisk.level}`}>
                  <h3>{latestRisk.title}</h3>
                  <p>{latestRisk.summary}</p>
                  <p>{latestRisk.nextStep}</p>
                </div>
                <div style={{ marginTop: 14 }}>
                  <strong style={{ fontSize: 15 }}>依据</strong>
                  <SourcesBlock sourceIds={latestRisk.sourceIds} />
                </div>
              </>
            ) : (
              <div className="notice warm">
                <Camera size={20} aria-hidden="true" />
                还没有核查记录。点击“检查当前用药风险”开始。
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
