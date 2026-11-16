import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  Bell,
  BookOpenText,
  Camera,
  Check,
  ClipboardList,
  Clock3,
  MessageCircleHeart,
  Mic,
  Leaf,
  LoaderCircle,
  Pill,
  Search,
  ShieldAlert,
  Stethoscope
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RiskBadge } from "../components/RiskBadge";
import { ProactiveRiskPanel } from "../components/ProactiveRiskPanel";
import { formatChineseDate, formatTime, getNextDose, getTodayDoses, humanizeRelation } from "../lib/time";
import { speakText } from "../lib/speech";
import { useQwenSpeechRecognition } from "../lib/qwenSpeech";
import { sendConcernAlert } from "../lib/cloud";
import { createId } from "../lib/ids";
import { matchMedicines } from "../catalog/retrieval";
import { searchHerbs } from "../catalog/herbs";
import { trackableRiskChecks } from "../lib/riskTracking";
import { buildDoseTimingNotice } from "../lib/doseTiming";
import { useAppStore } from "../store/useAppStore";
import type { DoseStatus } from "../types";

const statusLabels: Record<DoseStatus, string> = {
  pending: "等待确认",
  taken: "已经服用",
  later: "稍后提醒",
  skipped: "没有服用",
  unsure: "还不确定"
};

export function HomePage() {
  const navigate = useNavigate();
  const profile = useAppStore((state) => state.profile);
  const medications = useAppStore((state) => state.medications);
  const doseEvents = useAppStore((state) => state.doseEvents);
  const updateDose = useAppStore((state) => state.updateDose);
  const riskChecks = useAppStore((state) => state.riskChecks);
  const familyCode = useAppStore((state) => state.familyCode);
  const addFamilyAlert = useAppStore((state) => state.addFamilyAlert);
  const addAuditEvent = useAppStore((state) => state.addAuditEvent);
  const preferences = useAppStore((state) => state.preferences);
  const firstContact = useAppStore((state) => state.emergencyContacts[0]);
  const [now, setNow] = useState(() => new Date());
  const nextDose = getNextDose(
    medications,
    doseEvents,
    now,
    profile.timeZone
  );
  const todayDoses = getTodayDoses(
    medications,
    doseEvents,
    now,
    profile.timeZone
  );
  const latestRisk = trackableRiskChecks(riskChecks)[0];
  const [lastAction, setLastAction] = useState<{
    medicationId: string;
    scheduledAt: string;
    doseId: string;
    previousStatus: DoseStatus;
    label: string;
  }>();
  const [concernStatus, setConcernStatus] = useState<
    "idle" | "sending" | "sent" | "queued"
  >("idle");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  function setDoseStatus(
    dose:
      | NonNullable<ReturnType<typeof getNextDose>>
      | (typeof todayDoses)[number],
    status: DoseStatus
  ) {
    const currentDose = todayDoses.find((item) => item.doseId === dose.doseId);
    setLastAction({
      medicationId: dose.medication.id,
      scheduledAt: dose.scheduledAt,
      doseId: dose.doseId,
      previousStatus: currentDose?.status ?? "pending",
      label: statusLabels[status]
    });
    updateDose(
      dose.medication.id,
      dose.scheduledAt,
      status,
      dose.doseId
    );
    if (status === "taken") {
      speakText(
        `好的，已经记录您吃过${dose.medication.name}。`,
        preferences.soundEnabled && profile.voiceEnabled,
        preferences.voiceMode,
        preferences.customVoiceId
      );
    }
  }

  function undoLastAction() {
    if (!lastAction) return;
    updateDose(
      lastAction.medicationId,
      lastAction.scheduledAt,
      lastAction.previousStatus,
      lastAction.doseId
    );
    setLastAction(undefined);
  }

  async function reportDiscomfort() {
    setConcernStatus("sending");
    const alert = {
      id: createId("concern"),
      type: "concern" as const,
      title: "老人说身体不舒服",
      message: "老人点击了“我不舒服”，请查看当前身体状态和用药情况。",
      createdAt: new Date().toISOString()
    };
    addFamilyAlert(alert);
    addAuditEvent("sos-opened", "老人主动报告身体不舒服");
    try {
      await sendConcernAlert({
        familyCode,
        elderName: profile.name,
        message: alert.message
      });
      setConcernStatus("sent");
    } catch {
      // The local alert will still be included in the next cloud sync.
      setConcernStatus("queued");
    }
  }

  if (!nextDose) {
    return (
      <div className="page">
        <button className="btn btn-ghost page-back" type="button" onClick={() => navigate("/chat")}>
          <ArrowLeft size={19} aria-hidden="true" />
          返回问药识药
        </button>
        <header className="page-header">
          <div>
            <p className="eyebrow">今日用药</p>
            <h1 className="page-title">今天的用药都确认好了</h1>
            <p className="page-description">
              {formatChineseDate(new Date(), profile.timeZone)}，当前没有待确认的药物。如果身体不舒服，可以直接告诉我。
            </p>
          </div>
        </header>
        <DiscomfortNotice
          status={concernStatus}
          contactName={firstContact?.name}
          contactPhone={firstContact?.phone}
        />
        {lastAction ? (
          <div className="notice" style={{ marginBottom: 18 }}>
            刚才记录为“{lastAction.label}”。
            <button type="button" className="text-link" onClick={undoLastAction}>
              点错了，撤销
            </button>
          </div>
        ) : null}
        <div className="home-grid">
          <section className="card hero-task">
            <div className="hero-task-top">
              <span className="hero-kicker">
                <Check size={17} aria-hidden="true" />
                今日已完成
              </span>
              <span className="hero-time">{formatTime(now)}</span>
            </div>
            <h2>有新的药盒，直接拍给我看</h2>
            <p>我会先让您核对药名和剂量，再检查当前全部用药。看不到、看不懂都可以继续问我。</p>
            <div className="hero-actions">
              <button
                type="button"
                className="btn btn-primary btn-large"
                onClick={() => navigate("/chat")}
              >
                <MessageCircleHeart size={21} aria-hidden="true" />
                问药识药
              </button>
              <button
                type="button"
                className="btn btn-large"
                onClick={() => navigate("/add-medication?from=today&capture=1")}
              >
                <Camera size={21} aria-hidden="true" />
                拍药盒
              </button>
            </div>
          </section>
          <aside className="hero-secondary">
            <button type="button" className="card quick-action" onClick={() => navigate("/medications")}>
              <span className="quick-action-icon">
                <Pill size={25} aria-hidden="true" />
              </span>
              <span>
                <strong>查看用药清单</strong>
                <span>核对当前在吃什么</span>
              </span>
            </button>
            <button
              type="button"
              className="card quick-action warm"
              onClick={() => void reportDiscomfort()}
              disabled={concernStatus === "sending"}
            >
              <span className="quick-action-icon">
                <Stethoscope size={25} aria-hidden="true" />
              </span>
              <span>
                <strong>我不舒服</strong>
                <span>先识别紧急危险信号</span>
              </span>
            </button>
          </aside>
        </div>
        <section className="home-search-lower" aria-label="搜索与识别用药">
          <HomeSearch />
        </section>
        <ProactiveRiskPanel />
      </div>
    );
  }

  return (
    <div className="page">
      <button className="btn btn-ghost page-back" type="button" onClick={() => navigate("/chat")}>
        <ArrowLeft size={19} aria-hidden="true" />
        返回问药识药
      </button>
      <header className="page-header">
        <div>
          <p className="eyebrow">{formatChineseDate(new Date(), profile.timeZone)} · 下午好</p>
          <h1 className="page-title">{profile.name}，现在先看这一件事</h1>
          <p className="page-description">
            文字大一些、步骤少一点。需要时按住说话，我也会读给您听。
          </p>
        </div>
        <div className="header-actions">
          <button
            className="btn"
            type="button"
            onClick={() => navigate("/chat")}
          >
            <MessageCircleHeart size={20} aria-hidden="true" />
            问药识药
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => navigate("/add-medication?from=today&capture=1")}
          >
            <Camera size={20} aria-hidden="true" />
            拍照加药
          </button>
          <span className="chip">
            <Bell size={15} aria-hidden="true" />
            今日 {todayDoses.filter((dose) => dose.status === "taken").length} 次已确认
          </span>
        </div>
      </header>

      <DiscomfortNotice
        status={concernStatus}
        contactName={firstContact?.name}
        contactPhone={firstContact?.phone}
      />
      {lastAction ? (
        <div className="notice" style={{ marginBottom: 18 }}>
          刚才记录为“{lastAction.label}”。
          <button type="button" className="text-link" onClick={undoLastAction}>
            点错了，撤销
          </button>
        </div>
      ) : null}

      <div className="home-grid">
        <section className="card hero-task" aria-labelledby="next-dose-title">
          <div className="hero-task-top">
            <span className="hero-kicker">
              <Clock3 size={17} aria-hidden="true" />
              下一次 · {formatTime(new Date(nextDose.scheduledAt), profile.timeZone)}
            </span>
            <span className="hero-time">{humanizeRelation(nextDose.medication.relation, nextDose.medication.instructions)}</span>
          </div>
          <h2 id="next-dose-title">
            {humanizeRelation(nextDose.medication.relation)}，吃{nextDose.medication.name}
            {nextDose.medication.dosage ? `，${nextDose.medication.dosage}` : ""}
          </h2>
          <p>
            依据：{nextDose.medication.source.title}。请以手中药品说明书、医生处方或药师意见为准。
          </p>
          <div className="hero-actions">
            <button
              type="button"
              className="btn btn-primary btn-large"
              onClick={() => setDoseStatus(nextDose, "taken")}
            >
              <Check size={22} aria-hidden="true" />
              已经吃啦
            </button>
            <button
              type="button"
              className="btn btn-large"
              onClick={() => setDoseStatus(nextDose, "later")}
            >
              <Bell size={21} aria-hidden="true" />
              等会儿提醒
            </button>
            <button
              type="button"
              className="btn btn-large"
              onClick={() => navigate(`/reminder/${nextDose.medication.id}`)}
            >
              <ShieldAlert size={21} aria-hidden="true" />
              没有服用
            </button>
          </div>
        </section>

        <aside className="hero-secondary">
          <button type="button" className="card quick-action" onClick={() => navigate("/chat")}>
            <span className="quick-action-icon">
              <MessageCircleHeart size={25} aria-hidden="true" />
            </span>
            <span>
              <strong>语音问药</strong>
              <span>进入后按住麦克风说话</span>
            </span>
          </button>
          <button
            type="button"
            className="card quick-action warm"
            onClick={() => navigate("/add-medication?from=today&capture=1")}
          >
            <span className="quick-action-icon">
              <Camera size={25} aria-hidden="true" />
            </span>
            <span>
              <strong>拍药盒</strong>
              <span>先识别，再让您核对</span>
            </span>
          </button>
          <button
            type="button"
            className="card quick-action danger"
            onClick={() => void reportDiscomfort()}
            disabled={concernStatus === "sending"}
          >
            <span className="quick-action-icon">
              <Stethoscope size={25} aria-hidden="true" />
            </span>
            <span>
              <strong>我不舒服</strong>
              <span>先看有没有紧急危险信号</span>
            </span>
          </button>
        </aside>
      </div>

      {latestRisk ? (
        <section className="card card-pad" style={{ marginTop: 20 }}>
          <div className="section-heading">
            <div>
              <h2>最近一次安全核查</h2>
              <p>{latestRisk.summary}</p>
            </div>
            <RiskBadge level={latestRisk.level} />
          </div>
          <div className="notice warm">
            <ShieldAlert size={20} aria-hidden="true" />
            {latestRisk.nextStep}
          </div>
        </section>
      ) : null}

      <section className="card card-pad timeline-card">
        <div className="section-heading">
          <div>
            <h2>今天的用药安排</h2>
            <p>
              没有点击不等于漏服，会先记为“尚未确认”。
              {todayDoses.some((dose) =>
                buildDoseTimingNotice({
                  scheduledAt: dose.scheduledAt,
                  status: dose.status,
                  now,
                  recordedAt: dose.recordedAt,
                  timeZone: profile.timeZone
                })
              )
                ? " 有计划时间与当前或记录时间不一致，请逐项核对。"
                : ""}
            </p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => navigate("/medications")}>
            全部用药
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="timeline">
          {todayDoses.map((dose) => {
            const timingNotice = buildDoseTimingNotice({
              scheduledAt: dose.scheduledAt,
              status: dose.status,
              now,
              recordedAt: dose.recordedAt,
              timeZone: profile.timeZone
            });
            return (
            <div className="timeline-row" key={dose.doseId}>
              <div className="timeline-time">{formatTime(new Date(dose.scheduledAt), profile.timeZone)}</div>
              <div className="timeline-med">
                <strong>{dose.medication.name}</strong>
                <span>
                  {dose.medication.dosage} · {humanizeRelation(dose.medication.relation)}
                </span>
                {timingNotice ? (
                  <span
                    className={`dose-time-warning ${timingNotice.kind}`}
                    role="status"
                  >
                    <AlertTriangle size={15} aria-hidden="true" />
                    <span>
                      <strong>{timingNotice.title}</strong>
                      {timingNotice.detail}
                    </span>
                  </span>
                ) : null}
              </div>
              <div className="timeline-status">
                {dose.status === "pending" ? (
                <button
                  type="button"
                  className="btn"
                  onClick={() => setDoseStatus(dose, "taken")}
                >
                  确认已服
                </button>
                ) : (
                  <span className={`status-pill ${dose.status}`}>
                    {statusLabels[dose.status]}
                  </span>
                )}
                {dose.recordedAt ? (
                  <span className="record-time">
                    记录于 {formatTime(new Date(dose.recordedAt), profile.timeZone)}
                  </span>
                ) : null}
              </div>
            </div>
            );
          })}
        </div>
      </section>
      <section className="home-search-lower" aria-label="搜索与识别用药">
        <HomeSearch />
      </section>
      <ProactiveRiskPanel />
    </div>
  );
}

function DiscomfortNotice({
  status,
  contactName,
  contactPhone
}: {
  status: "idle" | "sending" | "sent" | "queued";
  contactName?: string;
  contactPhone?: string;
}) {
  if (status === "idle") return null;
  return (
    <div className="notice danger" style={{ marginBottom: 18 }} role="alert">
      <ShieldAlert size={22} aria-hidden="true" />
      <span>
        {status === "sending"
          ? "正在给家属端发送危险通知…"
          : status === "sent"
            ? "已经给家属端发送危险通知，请保持联系。"
            : "已记录不舒服，网络恢复后会同步给家属。请勿等待，情况紧急时直接拨打 120。"}
        {contactName && contactPhone ? (
          <>
            {" "}
            <a className="text-link" href={`tel:${contactPhone}`}>
              拨打{contactName}电话
            </a>
          </>
        ) : null}
      </span>
    </div>
  );
}

function HomeSearch() {
  const navigate = useNavigate();
  const medications = useAppStore((state) => state.medications);
  const [query, setQuery] = useState("");
  const composingRef = useRef(false);
  const speech = useQwenSpeechRecognition((transcript) => setQuery(transcript));
  const results = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return [];
    return medications
      .filter((medication) =>
        [
          medication.name,
          medication.genericName,
          medication.ingredients.join(" "),
          medication.instructions
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword)
      )
      .slice(0, 5);
  }, [medications, query]);
  const catalogResults = useMemo(
    () =>
      query.trim()
        ? matchMedicines(query, 4).map((item) => item.medicine)
        : [],
    [query]
  );
  const herbResults = useMemo(
    () => (query.trim() ? searchHerbs(query).slice(0, 3) : []),
    [query]
  );

  function askAi() {
    const keyword = query.trim();
    if (!keyword) return;
    navigate(`/chat?q=${encodeURIComponent(keyword)}`);
  }

  return (
    <section className="home-search-wrap" aria-label="搜索药物或直接提问">
      <form
        className="home-search"
        onSubmit={(event) => {
          event.preventDefault();
          if (results.length === 1) {
            navigate(`/medications/${results[0].id}`);
          } else {
            askAi();
          }
        }}
      >
        <Search size={24} aria-hidden="true" />
        <input
          value={query}
          lang="zh-CN"
          inputMode="search"
          autoComplete="off"
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={(event) => {
            composingRef.current = false;
            setQuery(event.currentTarget.value);
          }}
          onChange={(event) => {
            if (!composingRef.current) setQuery(event.target.value);
          }}
          placeholder="搜药名，或直接说不舒服"
          aria-label="搜索药物或提问"
        />
        <button
          type="button"
          className={`search-voice ${speech.listening ? "listening" : ""}`}
          aria-label="按住用语音搜索"
          disabled={!speech.supported || speech.processing}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={(event) => {
            if (event.button !== 0 || speech.listening) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            speech.start();
          }}
          onPointerUp={speech.stop}
          onPointerCancel={speech.stop}
        >
          {speech.processing ? (
            <LoaderCircle size={19} className="spin" aria-hidden="true" />
          ) : (
            <Mic size={21} aria-hidden="true" />
          )}
          {speech.processing
            ? "语音识别中"
            : speech.listening
              ? "松开结束"
              : "按住说"}
        </button>
        <button className="btn btn-primary" type="submit" disabled={!query.trim()}>
          搜索
        </button>
      </form>
      {!query.trim() ? (
        <div className="knowledge-shortcuts">
          <button type="button" className="btn btn-large" onClick={() => navigate("/catalog")}>
            <BookOpenText size={20} aria-hidden="true" />
            查药品百科
          </button>
          <button type="button" className="btn btn-large" onClick={() => navigate("/herbs")}>
            <Leaf size={20} aria-hidden="true" />
            识中药材
          </button>
          <button type="button" className="btn btn-large" onClick={() => navigate("/multi-drug")}>
            <ClipboardList size={20} aria-hidden="true" />
            多药对账
          </button>
        </div>
      ) : null}
      {speech.interim ? (
        <div className="notice" style={{ marginTop: 8 }}>
          <Mic size={20} aria-hidden="true" />
          正在听：{speech.interim}
        </div>
      ) : null}
      {speech.error ? (
        <div className="notice warm" style={{ marginTop: 8 }} role="alert">
          {speech.error}
        </div>
      ) : null}
      {query.trim() ? (
        <div className="home-search-results card">
          {results.length ? (
            results.map((medication) => (
              <button
                type="button"
                className="search-result-row"
                key={medication.id}
                onClick={() => navigate(`/medications/${medication.id}`)}
              >
                <span className="quick-action-icon">
                  <Pill size={22} aria-hidden="true" />
                </span>
                <span>
                  <strong>{medication.name}</strong>
                  <span>{medication.dosage} · {medication.relation}</span>
                </span>
                <ArrowRight size={20} aria-hidden="true" />
              </button>
            ))
          ) : null}
          {catalogResults.length ? (
            <>
              <p className="search-section-label">药品百科</p>
              {catalogResults.map((medicine) => (
                <button
                  type="button"
                  className="search-result-row"
                  key={medicine.slug}
                  onClick={() => navigate(`/catalog/${medicine.slug}`)}
                >
                  <span className="quick-action-icon">
                    <BookOpenText size={22} aria-hidden="true" />
                  </span>
                  <span>
                    <strong>{medicine.displayName}</strong>
                    <span>{medicine.category} · {medicine.strength}</span>
                  </span>
                  <ArrowRight size={20} aria-hidden="true" />
                </button>
              ))}
            </>
          ) : null}
          {herbResults.length ? (
            <>
              <p className="search-section-label">中草药百科</p>
              {herbResults.map((herb) => (
                <button
                  type="button"
                  className="search-result-row"
                  key={herb.id}
                  onClick={() => navigate(`/herbs/${herb.id}`)}
                >
                  <span className="quick-action-icon">
                    <Leaf size={22} aria-hidden="true" />
                  </span>
                  <span>
                    <strong>{herb.name}</strong>
                    <span>{herb.nature} · {herb.functions.join("、")}</span>
                  </span>
                  <ArrowRight size={20} aria-hidden="true" />
                </button>
              ))}
            </>
          ) : null}
          {!results.length && !catalogResults.length && !herbResults.length ? (
            <p className="search-empty">没有直接找到，可以让智能助手继续帮您核对。</p>
          ) : null}
          <button type="button" className="btn btn-warm search-ask" onClick={askAi}>
            <MessageCircleHeart size={19} aria-hidden="true" />
            问智能助手：“{query.trim()}”
          </button>
        </div>
      ) : null}
    </section>
  );
}
