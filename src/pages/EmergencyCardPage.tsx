import {
  ArrowLeft,
  ContactRound,
  HeartPulse,
  Pill,
  Printer,
  ShieldAlert,
  Stethoscope
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { buildEmergencyCardData } from "../lib/emergencyCard";
import { useAppStore } from "../store/useAppStore";

export function EmergencyCardPage() {
  const navigate = useNavigate();
  const profile = useAppStore((state) => state.profile);
  const medications = useAppStore((state) => state.medications);
  const emergencyContacts = useAppStore((state) => state.emergencyContacts);
  const riskChecks = useAppStore((state) => state.riskChecks);
  const data = buildEmergencyCardData({
    profile,
    medications,
    emergencyContacts,
    riskChecks
  });
  const updatedAt = new Date().toLocaleString("zh-CN", {
    timeZone: profile.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });

  function printCard() {
    document.body.classList.add("printing-emergency-card");
    window.print();
    window.setTimeout(
      () => document.body.classList.remove("printing-emergency-card"),
      500
    );
  }

  return (
    <div className="page emergency-card-page">
      <button
        type="button"
        className="btn btn-ghost page-back"
        onClick={() => navigate("/medications")}
      >
        <ArrowLeft size={19} aria-hidden="true" />
        返回用药清单
      </button>

      <header className="page-header">
        <div>
          <p className="eyebrow">就诊与紧急沟通</p>
          <h1 className="page-title">个人用药急救卡</h1>
          <p className="page-description">
            可打印后放进钱包或贴在冰箱上。信息来自当前用药档案，不代替处方，也不能据此自行停药或调整剂量。
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-large emergency-card-print"
          onClick={printCard}
        >
          <Printer size={21} aria-hidden="true" />
          打印或保存为文件
        </button>
      </header>

      <article className="emergency-card-sheet" aria-label="个人用药急救卡">
        <header className="emergency-card-head">
          <div className="emergency-card-brand">
            <span>
              <HeartPulse size={28} aria-hidden="true" />
            </span>
            <div>
              <p>智药有方 · 安心药伴</p>
              <h2>个人用药急救卡</h2>
            </div>
          </div>
          <div className="emergency-card-updated">
            <strong>{data.name}</strong>
            <span>{data.age}</span>
            <small>更新：{updatedAt}</small>
          </div>
        </header>

        <div className="emergency-card-grid">
          <section className="emergency-card-section emergency-card-medications">
            <h3>
              <Pill size={20} aria-hidden="true" />
              正在使用的药物
            </h3>
            {data.medications.length ? (
              <ol>
                {data.medications.map((medication) => (
                  <li key={medication.id}>
                    <strong>{medication.name}</strong>
                    <span>
                      {medication.dosage} · {medication.frequency}
                      {medication.relation ? ` · ${medication.relation}` : ""}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="emergency-card-empty">尚未记录当前用药。</p>
            )}
          </section>

          <section className="emergency-card-section">
            <h3>
              <ShieldAlert size={20} aria-hidden="true" />
              药物过敏史
            </h3>
            {data.allergies.length ? (
              <div className="emergency-card-tags">
                {data.allergies.map((allergy) => (
                  <strong className="danger" key={allergy}>
                    {allergy}
                  </strong>
                ))}
              </div>
            ) : (
              <p className="emergency-card-empty">未记录已知药物过敏。</p>
            )}
          </section>

          <section className="emergency-card-section">
            <h3>
              <Stethoscope size={20} aria-hidden="true" />
              主要慢性病
            </h3>
            {data.conditions.length ? (
              <div className="emergency-card-tags">
                {data.conditions.map((condition) => (
                  <strong key={condition}>{condition}</strong>
                ))}
              </div>
            ) : (
              <p className="emergency-card-empty">未记录慢性病。</p>
            )}
          </section>

          <section className="emergency-card-section">
            <h3>
              <ContactRound size={20} aria-hidden="true" />
              紧急联系人
            </h3>
            {data.contacts.length ? (
              <ul className="emergency-card-contacts">
                {data.contacts.map((contact) => (
                  <li key={contact.id}>
                    <span>
                      <strong>{contact.name}</strong>
                      {contact.relation ? ` · ${contact.relation}` : ""}
                    </span>
                    <a href={`tel:${contact.phone}`}>{contact.phone}</a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="emergency-card-empty">尚未设置紧急联系人。</p>
            )}
          </section>

          <section className="emergency-card-section emergency-card-attention">
            <h3>
              <ShieldAlert size={20} aria-hidden="true" />
              需要医生特别注意的药物
            </h3>
            {data.specialAttention.length ? (
              <ul>
                {data.specialAttention.map((item) => (
                  <li key={item.medicationId}>
                    <strong>{item.name}</strong>
                    <span>{item.reason}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="emergency-card-empty">
                暂无系统高风险标记。就诊时仍请让医生复核全部药物。
              </p>
            )}
          </section>
        </div>

        <footer className="emergency-card-foot">
          <strong>就医提醒</strong>
          <span>
            请携带实际药盒或处方。对任何药物有疑问、需要停药、补服、掰开或调整剂量时，请先联系医生或药师；紧急情况拨打 120。
          </span>
        </footer>
      </article>
    </div>
  );
}
