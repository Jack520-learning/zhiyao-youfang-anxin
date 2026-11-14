import {
  Activity,
  AlertTriangle,
  BellRing,
  CalendarCheck,
  ChevronRight,
  FileHeart,
  HeartPulse,
  PhoneCall,
  ShieldAlert,
  UsersRound
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { RiskBadge } from "../components/RiskBadge";
import { formatChineseDate, getTodayDoses } from "../lib/time";
import { useAppStore } from "../store/useAppStore";

export function FamilyPage() {
  const navigate = useNavigate();
  const role = useAppStore((state) => state.role);
  const profile = useAppStore((state) => state.profile);
  const familyCode = useAppStore((state) => state.familyCode);
  const medications = useAppStore((state) => state.medications);
  const doseEvents = useAppStore((state) => state.doseEvents);
  const riskChecks = useAppStore((state) => state.riskChecks);
  const consent = useAppStore((state) => state.consent);
  const contacts = useAppStore((state) => state.emergencyContacts);
  const familyAlerts = useAppStore((state) => state.familyAlerts);
  const doses = getTodayDoses(medications, doseEvents);
  const taken = doses.filter((dose) => dose.status === "taken").length;
  const unconfirmed = doses.filter((dose) => dose.status === "pending").length;
  const unresolvedRisks = riskChecks.filter(
    (riskCheck) =>
      riskCheck.level === "high" ||
      riskCheck.level === "medium" ||
      riskCheck.level === "emergency"
  );
  const visibleRisks = consent.shareHighRisk
    ? unresolvedRisks
    : unresolvedRisks.filter((riskCheck) => riskCheck.level !== "high");

  if (role !== "family") {
    return (
      <div className="page">
        <div className="card card-pad">
          <h1 className="page-title">这是家属端页面</h1>
          <p className="page-description">请切换到家属端查看异常摘要。</p>
          <button className="btn btn-primary" type="button" onClick={() => navigate("/")}>
            返回老人端
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">{formatChineseDate()} · 家属摘要</p>
          <h1 className="page-title">{profile.name}今天还好吗？</h1>
          <p className="page-description">
            这里只显示老人授权的摘要和需要介入的异常，不展示完整对话与逐条隐私日志。
          </p>
        </div>
        <span className="family-code">{familyCode}</span>
      </header>

      <div className="family-grid">
        <section className="card metric">
          <div className="metric-label">今日已确认服药</div>
          <div className="metric-value">{taken}</div>
          <div className="metric-note">共 {doses.length} 个用药窗口</div>
        </section>
        <section className="card metric">
          <div className="metric-label">尚未确认</div>
          <div className="metric-value" style={{ color: unconfirmed ? "var(--amber)" : undefined }}>
            {unconfirmed}
          </div>
          <div className="metric-note">未操作不等于明确漏服</div>
        </section>
        <section className="card metric">
          <div className="metric-label">需要家人处理</div>
          <div className="metric-value" style={{ color: visibleRisks.length ? "var(--red)" : undefined }}>
            {visibleRisks.length}
          </div>
          <div className="metric-note">高危提示不可由家属关闭</div>
        </section>
      </div>

      {!consent.shareMedicationSummary ? (
        <div className="notice warm" style={{ marginTop: 16 }}>
          <ShieldAlert size={21} aria-hidden="true" />
          老人暂未共享当前用药摘要。这里只显示已获授权的异常和提醒信息。
        </div>
      ) : null}

      {familyAlerts.length ? (
        <section className="card card-pad" style={{ marginTop: 16 }}>
          <div className="section-heading">
            <div>
              <h2>家人收到的即时信息</h2>
              <p>老人主动报告不舒服或 SOS 时会出现在这里。</p>
            </div>
            <BellRing size={22} color="var(--red)" aria-hidden="true" />
          </div>
          <div style={{ display: "grid", gap: 9 }}>
            {familyAlerts.slice(0, 5).map((alert) => (
              <div className="risk-card high" key={alert.id}>
                <div className="message-risk-top">
                  <h3>{alert.title}</h3>
                  <span className="record-time">
                    {new Date(alert.createdAt).toLocaleString("zh-CN")}
                  </span>
                </div>
                <p>{alert.message}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="family-content-grid">
        <section className="card card-pad">
          <div className="section-heading">
            <div>
              <h2>最先需要处理</h2>
              <p>按风险和时间排序，不用查看全部日志。</p>
            </div>
            <AlertTriangle size={23} color="var(--amber)" aria-hidden="true" />
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {visibleRisks.length ? (
              visibleRisks.slice(0, 3).map((riskCheck) => (
                <article className={`risk-card ${riskCheck.level}`} key={riskCheck.id}>
                  <div className="message-risk-top">
                    <h3>{riskCheck.title}</h3>
                    <RiskBadge level={riskCheck.level} />
                  </div>
                  <p>{riskCheck.summary}</p>
                  <p>{riskCheck.nextStep}</p>
                </article>
              ))
            ) : unconfirmed ? (
              <article className="risk-card medium">
                <h3>有 {unconfirmed} 次用药尚未确认</h3>
                <p>请先联系老人确认是否已经服用，不要在家属端代替老人点击已服。</p>
              </article>
            ) : (
              <div className="notice">
                <CalendarCheck size={20} aria-hidden="true" />
                今天暂时没有需要立即介入的异常。普通成功服药不会逐条打扰您。
              </div>
            )}
          </div>
          <button className="btn" type="button" style={{ marginTop: 14 }} onClick={() => navigate("/safety")}>
            查看全部风险提醒
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </section>

        <aside style={{ display: "grid", gap: 14 }}>
          <section className="card card-pad">
            <div className="section-heading">
              <div>
                <h2 style={{ fontSize: 19 }}>复诊摘要</h2>
                <p>当前药物、疾病和过敏信息</p>
              </div>
              <FileHeart size={22} color="var(--primary)" aria-hidden="true" />
            </div>
            <div className="chip-row">
              {profile.conditions.map((condition) => (
                <span className="chip" key={condition}>{condition}</span>
              ))}
              {profile.allergies.map((allergy) => (
                <span className="chip risk-high" key={allergy}>过敏：{allergy}</span>
              ))}
            </div>
            <button className="btn" type="button" style={{ width: "100%", marginTop: 14 }} onClick={() => navigate("/medications")}>
              查看 {medications.filter((medication) => medication.status === "active").length} 种当前药物
            </button>
          </section>
          <section className="card card-pad">
            <div className="section-heading">
              <div>
                <h2 style={{ fontSize: 19 }}>紧急联系</h2>
                <p>求助链路不依赖 AI 回答。</p>
              </div>
              <HeartPulse size={22} color="var(--red)" aria-hidden="true" />
            </div>
            {contacts.slice(0, 2).map((contact) => (
              <a className="btn" href={`tel:${contact.phone}`} key={contact.id} style={{ width: "100%", marginTop: 8 }}>
                <PhoneCall size={18} aria-hidden="true" />
                {contact.name} · {contact.relation}
              </a>
            ))}
          </section>
          <section className="card card-pad">
            <div className="notice">
              <UsersRound size={20} aria-hidden="true" />
              共享内容由老人设置。任何异常通知都可以在授权页面查看和调整。
            </div>
            <button className="btn btn-ghost" type="button" style={{ width: "100%", marginTop: 8 }} onClick={() => navigate("/profile")}>
              查看授权范围
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}
