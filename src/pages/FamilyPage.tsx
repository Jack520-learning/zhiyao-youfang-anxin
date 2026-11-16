import {
  AlertTriangle,
  BellOff,
  BellRing,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileHeart,
  HeartPulse,
  PhoneCall,
  RefreshCw,
  ShieldAlert,
  UsersRound
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { RiskBadge } from "../components/RiskBadge";
import { ProactiveRiskPanel } from "../components/ProactiveRiskPanel";
import { FamilyHealthCharts } from "../components/FamilyHealthCharts";
import { FamilyRiskReviewButton } from "../components/FamilyRiskReviewButton";
import { formatChineseDate, getTodayDoses } from "../lib/time";
import { useAppStore } from "../store/useAppStore";
import { updateFamilyAlertStatus } from "../lib/cloud";
import { trackableRiskChecks } from "../lib/riskTracking";

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
  const lastSyncedAt = useAppStore((state) => state.lastSyncedAt);
  const preferences = useAppStore((state) => state.preferences);
  const updatePreferences = useAppStore((state) => state.updatePreferences);
  const sessionAccountId = useAppStore((state) => state.sessionAccountId);
  const accounts = useAppStore((state) => state.accounts);
  const markFamilyAlertHandled = useAppStore(
    (state) => state.markFamilyAlertHandled
  );
  const currentAccount = accounts.find(
    (account) => account.id === sessionAccountId
  );
  const doses = getTodayDoses(
    medications,
    doseEvents,
    new Date(),
    profile.timeZone
  );
  const taken = doses.filter((dose) => dose.status === "taken").length;
  const unconfirmed = doses.filter((dose) => dose.status === "pending").length;
  const unresolvedRisks = trackableRiskChecks(riskChecks).filter(
    (riskCheck) =>
      riskCheck.level === "high" ||
      riskCheck.level === "medium" ||
      riskCheck.level === "emergency"
  );
  const visibleRisks = consent.shareHighRisk
    ? unresolvedRisks
    : unresolvedRisks.filter((riskCheck) => riskCheck.level !== "high");
  const pendingReviewRisks = visibleRisks.filter(
    (riskCheck) => !riskCheck.familyReview
  );
  const reviewedRisks = visibleRisks.filter(
    (riskCheck) => riskCheck.familyReview
  );
  const doseUpdates = doses
    .filter((dose) => dose.recordedAt)
    .sort(
      (left, right) =>
        new Date(right.recordedAt || 0).getTime() -
        new Date(left.recordedAt || 0).getTime()
    )
    .slice(0, 5);
  const openAlerts = familyAlerts.filter((alert) => !alert.handledAt);
  const handledAlerts = familyAlerts.filter((alert) => alert.handledAt);

  async function markHandled(alertId: string) {
    try {
      await updateFamilyAlertStatus({
        familyCode,
        alertId,
        handledBy: currentAccount?.displayName || "家属"
      });
      markFamilyAlertHandled(alertId);
    } catch {
      // Keep the local action available during a brief network interruption.
      markFamilyAlertHandled(alertId);
    }
  }

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
          <p className="eyebrow">{formatChineseDate(new Date(), profile.timeZone)} · 家属摘要</p>
          <h1 className="page-title">{profile.name}今天还好吗？</h1>
          <p className="page-description">
            这里只显示老人授权的摘要和需要介入的异常，不展示完整对话与逐条隐私日志。
          </p>
        </div>
        <div className="family-header-actions">
          <span className="family-live-status" aria-live="polite">
            <RefreshCw size={15} aria-hidden="true" />
            实时同步
            {lastSyncedAt ? (
              <small>
                {new Date(lastSyncedAt).toLocaleTimeString("zh-CN", {
                  timeZone: profile.timeZone,
                  hour: "2-digit",
                  minute: "2-digit"
                })}
              </small>
            ) : null}
          </span>
          <button
            className="icon-btn"
            type="button"
            aria-label={preferences.remindersEnabled ? "关闭提醒" : "开启提醒"}
            title={preferences.remindersEnabled ? "关闭提醒" : "开启提醒"}
            onClick={() =>
              updatePreferences({
                remindersEnabled: !preferences.remindersEnabled
              })
            }
          >
            {preferences.remindersEnabled ? (
              <BellRing size={22} aria-hidden="true" />
            ) : (
              <BellOff size={22} aria-hidden="true" />
            )}
          </button>
          <span className="family-code">{familyCode}</span>
        </div>
      </header>

      <ProactiveRiskPanel limit={4} />

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
          <div className="metric-value" style={{ color: pendingReviewRisks.length ? "var(--red)" : undefined }}>
            {pendingReviewRisks.length}
          </div>
          <div className="metric-note">
            {reviewedRisks.length
              ? `另有 ${reviewedRisks.length} 项已核对，风险仍保留`
              : "高危提示不可由家属关闭"}
          </div>
        </section>
      </div>

      <FamilyHealthCharts
        medications={medications}
        doseEvents={doseEvents}
        riskChecks={riskChecks}
        timeZone={profile.timeZone}
        shareMedicationSummary={consent.shareMedicationSummary}
        shareMissedDose={consent.shareMissedDose}
        shareHighRisk={consent.shareHighRisk}
      />

      {consent.shareMissedDose ? (
        <section
          className="card card-pad family-dose-updates"
          aria-live="polite"
        >
          <div className="section-heading">
            <div>
              <h2>今日服药动态</h2>
              <p>
                老人确认、取消确认或记录漏服后，这里会按最新状态更新。
              </p>
            </div>
            <Clock3 size={22} color="var(--primary)" aria-hidden="true" />
          </div>
          {doseUpdates.length ? (
            <div className="family-dose-update-list">
              {doseUpdates.map((dose) => {
                const wasCancelled =
                  dose.status === "pending" &&
                  Boolean(dose.note?.includes("取消"));
                const statusLabel = wasCancelled
                  ? "取消确认"
                  : dose.status === "taken"
                    ? "已确认服用"
                    : dose.status === "skipped"
                      ? "记录未服用"
                      : dose.status === "unsure"
                        ? "状态不确定"
                        : dose.status === "later"
                          ? "稍后提醒"
                          : "等待确认";
                return (
                  <article
                    className={`family-dose-update ${dose.status} ${
                      wasCancelled ? "cancelled" : ""
                    }`}
                    key={dose.doseId}
                  >
                    <span
                      className="family-dose-update-icon"
                      aria-hidden="true"
                    >
                      <Clock3 size={18} />
                    </span>
                    <div>
                      <div className="family-dose-update-title">
                        <strong>{dose.medication.name}</strong>
                        <span>{statusLabel}</span>
                      </div>
                      <p>
                        {dose.note ||
                          `${dose.medication.dosage} · ${
                            wasCancelled
                              ? "已恢复为尚未确认"
                              : "老人已在老人端更新"
                          }`}
                      </p>
                    </div>
                    <time dateTime={dose.recordedAt}>
                      {new Date(dose.recordedAt || "").toLocaleTimeString(
                        "zh-CN",
                        {
                          timeZone: profile.timeZone,
                          hour: "2-digit",
                          minute: "2-digit"
                        }
                      )}
                    </time>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="notice">
              <Clock3 size={20} aria-hidden="true" />
              老人今天还没有提交服药状态。未操作不等于漏服。
            </div>
          )}
        </section>
      ) : null}

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
              <p>老人主动报告不舒服或紧急求助时会出现在这里。</p>
            </div>
            <BellRing size={22} color="var(--red)" aria-hidden="true" />
          </div>
          <div style={{ display: "grid", gap: 9 }}>
            {openAlerts.slice(0, 5).map((alert) => (
              <div className="risk-card high" key={alert.id}>
                <div className="message-risk-top">
                  <h3>{alert.title}</h3>
                  <span className="record-time">
                    {new Date(alert.createdAt).toLocaleString("zh-CN", {
                      timeZone: profile.timeZone
                    })}
                  </span>
                </div>
                <p>{alert.message}</p>
                <button
                  className="btn"
                  type="button"
                  style={{ marginTop: 10 }}
                  onClick={() => void markHandled(alert.id)}
                >
                  <CheckCircle2 size={18} aria-hidden="true" />
                  标记已处理
                </button>
              </div>
            ))}
            {!openAlerts.length ? (
              <div className="notice">
                <CheckCircle2 size={20} aria-hidden="true" />
                当前没有待处理的不舒服或紧急求助记录。
              </div>
            ) : null}
          </div>
          {handledAlerts.length ? (
            <details style={{ marginTop: 14 }}>
              <summary className="text-link">
                查看已处理记录（保留 15 天）
              </summary>
              <div style={{ display: "grid", gap: 9, marginTop: 10 }}>
                {handledAlerts.slice(0, 10).map((alert) => (
                  <div className="risk-card medium" key={alert.id}>
                    <div className="message-risk-top">
                      <h3>{alert.title}</h3>
                      <span className="chip">
                        已处理 · {alert.handledBy || "家属"}
                      </span>
                    </div>
                    <p>{alert.message}</p>
                    <small>
                      处理时间：
                      {alert.handledAt
                        ? new Date(alert.handledAt).toLocaleString("zh-CN", {
                            timeZone: profile.timeZone
                          })
                        : "未记录"}
                    </small>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
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
                  <FamilyRiskReviewButton riskCheck={riskCheck} />
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
                <p>求助链路不依赖智能回答。</p>
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
