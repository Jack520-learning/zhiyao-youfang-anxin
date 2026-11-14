import {
  Camera,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  LoaderCircle,
  MessageCircleHeart,
  Mic,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  Volume2
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { RiskBadge } from "../components/RiskBadge";
import { SourcesBlock } from "../components/SourcesBlock";
import { CameraCaptureModal } from "../components/CameraCaptureModal";
import { DiscoveryNav } from "../components/DiscoveryNav";
import { createId } from "../lib/ids";
import { answerWithRules, checkNewMedication } from "../lib/riskEngine";
import { sendConcernAlert } from "../lib/cloud";
import { createManualDraft, recognizeMedicineImage } from "../lib/ocr";
import { answerFromDrugCatalog } from "../catalog/chatBridge";
import { findBestMedicine } from "../catalog/retrieval";
import { speakText, useSpeechRecognition } from "../lib/speech";
import { nowIso } from "../lib/time";
import { useAppStore } from "../store/useAppStore";
import type {
  AssistantResponse,
  AssistantStage,
  ChatMessage,
  RiskCheck
} from "../types";
import { dateKey } from "../lib/time";

const sampleQuestions = [
  "今天这些药要怎么吃？",
  "华法林和阿司匹林能一起吃吗？",
  "我忘了吃药，现在能补吗？",
  "我头晕，是不是药的问题？"
];

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export function ChatPage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const messages = useAppStore((state) => state.chatMessages);
  const medications = useAppStore((state) => state.medications);
  const profile = useAppStore((state) => state.profile);
  const preferences = useAppStore((state) => state.preferences);
  const familyCode = useAppStore((state) => state.familyCode);
  const addFamilyAlert = useAppStore((state) => state.addFamilyAlert);
  const addChatMessage = useAppStore((state) => state.addChatMessage);
  const saveIntakeDraft = useAppStore((state) => state.saveIntakeDraft);
  const intakeDraft = useAppStore((state) => state.intakeDraft);
  const [input, setInput] = useState(searchParams.get("q") ?? "");
  const [sending, setSending] = useState(false);
  const [stages, setStages] = useState<AssistantStage[]>([]);
  const [mode, setMode] = useState<"rules" | "llm">("rules");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoProgress, setPhotoProgress] = useState("");
  const [photoNotice, setPhotoNotice] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const initialQueryHandled = useRef(false);
  const autoScrollRef = useRef(false);

  const speech = useSpeechRecognition((transcript) => {
    setInput(transcript);
  });

  useEffect(() => {
    if (!autoScrollRef.current) return;
    const container = messagesRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth"
    });
  }, [messages, sending, stages]);

  useEffect(() => {
    const container = messagesRef.current;
    if (container) container.scrollTop = 0;
  }, []);

  useEffect(() => {
    const initialQuery = searchParams.get("q");
    if (initialQuery && !initialQueryHandled.current) {
      const signature = `chat-auto:${location.key}:${initialQuery}`;
      if (sessionStorage.getItem(signature)) return;
      sessionStorage.setItem(signature, "1");
      initialQueryHandled.current = true;
      void submitQuestion(initialQuery, false);
    }
  }, [searchParams, location.key]);

  async function submitQuestion(question = input, autoScroll = true) {
    const clean = question.trim();
    if (!clean || sending) return;
    autoScrollRef.current = autoScroll;
    setInput("");
    setSending(true);
    const userMessage: ChatMessage = {
      id: createId("chat"),
      role: "user",
      content: clean,
      createdAt: nowIso()
    };
    addChatMessage(userMessage);

    const activeMedications = medications.filter(
      (medication) => medication.status === "active"
    );
    const contextualQuestion =
      intakeDraft &&
      /(这个药|这种药|它|这盒药|图片里)/.test(clean) &&
      intakeDraft.name
        ? `${intakeDraft.name} ${clean}`
        : clean;
    let localResponse = answerWithRules(
      contextualQuestion,
      activeMedications,
      profile
    );
    const catalogResponse = answerFromDrugCatalog(
      contextualQuestion,
      profile,
      activeMedications.map((medication) => medication.name)
    );
    const mentionsCurrentMedication = activeMedications.some((medication) =>
      clean.includes(medication.name) ||
      clean.includes(medication.genericName) ||
      medication.ingredients.some((ingredient) => clean.includes(ingredient))
    );
    if (
      catalogResponse &&
      (!mentionsCurrentMedication ||
        catalogResponse.riskCheck.level === "high")
    ) {
      localResponse = catalogResponse;
    }
    const discomfortRegex = /(不舒服|头晕|难受|胸闷|恶心|心慌)/;
    if (
      discomfortRegex.test(clean) &&
      searchParams.get("concern") !== "1"
    ) {
      const alert = {
        id: createId("concern"),
        type: "concern" as const,
        title: "老人说身体不舒服",
        message: `老人说：${clean.slice(0, 80)}`,
        createdAt: nowIso()
      };
      addFamilyAlert(alert);
      void sendConcernAlert({
        familyCode,
        elderName: profile.name,
        message: alert.message
      }).catch(() => undefined);
    }
    setStages(
      localResponse.stages.map((stage, index) => ({
        ...stage,
        status: index === 0 ? "active" : "pending"
      }))
    );

    for (let index = 0; index < localResponse.stages.length; index += 1) {
      await wait(260);
      setStages((current) =>
        current.map((stage, stageIndex) => ({
          ...stage,
          status:
            stageIndex < index + 1
              ? "done"
              : stageIndex === index + 1
                ? "active"
                : "pending"
        }))
      );
    }

    let response: AssistantResponse = localResponse;
    if (localResponse.riskCheck.level === "low") {
      try {
        const aiResponse = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: clean,
            profile,
            medications,
            evidence: localResponse.riskCheck.sourceIds
          })
        });
        if (aiResponse.ok) {
          const payload = (await aiResponse.json()) as {
            message: string;
            mode: "llm";
          };
          response = {
            ...localResponse,
            message: payload.message,
            mode: "llm"
          };
        }
      } catch {
        // The local safety response is still complete and available.
      }
    }

    setMode(response.mode);
    addChatMessage({
      id: createId("chat"),
      role: "assistant",
      content: response.message,
      createdAt: nowIso(),
      riskCheck: response.riskCheck
    });
    speakText(
      `${response.message}。${response.riskCheck.nextStep}`,
      profile.voiceEnabled && preferences.soundEnabled
    );
    setStages(
      response.stages.map((stage) => ({ ...stage, status: "done" }))
    );
    setSending(false);
    autoScrollRef.current = false;
  }

  async function scanMedicationImage(imageDataUrl: string) {
    if (!imageDataUrl || photoBusy) return;
    setPhotoBusy(true);
    setPhotoProgress("正在读取照片");
    autoScrollRef.current = true;
    addChatMessage({
      id: createId("chat"),
      role: "user",
      content: "我拍了一张药盒照片，请帮我识别风险、用法和价格。",
      createdAt: nowIso(),
      imageDataUrls: [imageDataUrl]
    });

    try {
      let draft;
      const visionPromise = fetch("/api/vision-identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl, mode: "medicine" })
      })
        .then(async (response) => {
          if (!response.ok) return null;
          return (await response.json()) as {
            candidates?: Array<{
              name: string;
              confidence?: number;
              visibleFeatures?: string[];
            }>;
            summary?: string;
            cautions?: string[];
          };
        })
        .catch(() => null);
      try {
        draft = await recognizeMedicineImage(imageDataUrl, (_value, label) => {
          setPhotoProgress(label || "正在识别药盒");
        });
      } catch {
        draft = createManualDraft(imageDataUrl);
      }
      const vision = await visionPromise;
      const visionName = vision?.candidates?.[0]?.name?.trim();
      if (
        visionName &&
        (!draft.name ||
          draft.name.length < 3 ||
          draft.lowConfidenceFields.includes("name"))
      ) {
        draft = {
          ...draft,
          name: visionName,
          confidence: Math.max(
            draft.confidence,
            Math.min(0.9, vision?.candidates?.[0]?.confidence ?? 0.6)
          ),
          lowConfidenceFields: draft.lowConfidenceFields.filter(
            (field) => field !== "name"
          )
        };
      }
      const catalogMatch = draft.name
        ? findBestMedicine(draft.name)?.medicine
        : undefined;
      if (catalogMatch) {
        draft = {
          ...draft,
          name: draft.name || catalogMatch.displayName,
          genericName: draft.genericName || catalogMatch.activeIngredient,
          ingredientsText:
            draft.ingredientsText || catalogMatch.activeIngredient,
          dosage: draft.dosage,
          frequency: draft.frequency || "每日 1 次",
          relation:
            draft.relation ||
            (/餐后|饭后|随餐/.test(catalogMatch.timing)
              ? "饭后"
              : "按说明书"),
          instructions:
            draft.instructions ||
            `${catalogMatch.howToTake} ${catalogMatch.keyWarnings[0]}`,
          confidence: Math.max(draft.confidence, 0.8)
        };
      }

      const compactText = `${draft.name}${draft.rawText}`.replace(/\s+/g, "");
      const learned = medications.find((medication) =>
        [medication.name, medication.genericName, ...medication.ingredients]
          .filter(Boolean)
          .some((term) => compactText.includes(term.replace(/\s+/g, "")))
      );
      if (learned) {
        draft = {
          ...draft,
          name: learned.name,
          genericName: learned.genericName,
          ingredientsText: learned.ingredients.join("、"),
          dosage: draft.dosage || learned.dosage,
          frequency: draft.frequency || learned.frequency,
          times: draft.times.length ? draft.times : learned.times,
          relation: draft.relation || learned.relation,
          instructions: draft.instructions || learned.instructions,
          price: draft.price || learned.price,
          confidence: Math.max(draft.confidence, learned.confidence),
          lowConfidenceFields: draft.lowConfidenceFields.filter(
            (field) =>
              !["name", "dosage", "frequency", "relation"].includes(field)
          )
        };
      }
      saveIntakeDraft(draft);
      const createdAt = nowIso();
      const candidate = {
        id: createId("med"),
        name: draft.name,
        genericName: draft.genericName,
        ingredients: draft.ingredientsText
          .split(/[、,，/\s]+/)
          .filter(Boolean),
        dosage: draft.dosage,
        frequency: draft.frequency,
        times: draft.times,
        relation: draft.relation,
        instructions: draft.instructions,
        price: draft.price,
        startDate: dateKey(),
        status: "pending" as const,
        reminderEnabled: true,
        source: {
          type: "medicine-label" as const,
          title: "问药页拍摄并识别的药盒",
          capturedAt: createdAt,
          imageDataUrl,
          confirmed: false
        },
        confidence: draft.confidence,
        createdAt,
        updatedAt: createdAt
      };
      const unknownCheck = checkNewMedication(candidate, medications, profile);
      const preliminaryCheck = checkNewMedication(
        {
          ...candidate,
          source: { ...candidate.source, confirmed: true }
        },
        medications,
        profile
      );
      const riskCheck = ["high", "medium", "emergency"].includes(
        preliminaryCheck.level
      )
        ? {
            ...preliminaryCheck,
            title: `初步发现：${preliminaryCheck.title}`,
            summary: `${preliminaryCheck.summary} 目前基于尚未人工确认的识别字段。`
          }
        : unknownCheck;
      const priceText =
        draft.price || "暂无可靠价格数据，请以药房价格或购买记录为准";
      const content = [
        `识别结果：${draft.name || "药名暂未识别"}`,
        `识别可信度：${Math.round(draft.confidence * 100)}%`,
        draft.dosage ? `剂量：${draft.dosage}` : "剂量：需要人工补充",
        draft.frequency ? `次数：${draft.frequency}` : "次数：需要人工补充",
        draft.relation ? `服用时间：${draft.relation}` : "服用时间：需要人工补充",
        `参考价格：${priceText}`,
        vision?.summary ? `图片摘要：${vision.summary}` : "",
        ...(vision?.cautions || []).map((item) => `需核实：${item}`),
        learned ? `已复用您上次确认的“${learned.name}”资料。` : "",
        riskCheck.summary,
        riskCheck.nextStep
      ]
        .filter(Boolean)
        .join("\n");
      addChatMessage({
        id: createId("chat"),
        role: "assistant",
        content,
        createdAt: nowIso(),
        riskCheck
      });
      setStages(
        riskCheck.level === "unknown"
          ? [
              { id: "photo", label: "完成药盒识别", status: "done" },
              { id: "check", label: "发现字段仍需确认", status: "active" }
            ]
          : [
              { id: "photo", label: "完成药盒识别", status: "done" },
              { id: "profile", label: "匹配当前用药与已确认历史", status: "done" },
              { id: "risk", label: "完成安全分析", status: "done" }
            ]
      );
      setPhotoNotice(
        `${draft.name || "药品"}识别完成，已自动分析风险。加入当前用药前请核对字段。`
      );
    } catch {
      addChatMessage({
        id: createId("chat"),
        role: "assistant",
        content:
          "这张照片暂时没有识别成功。请重新拍清楚药名、规格和用法，或改用“拍照加药”手动核对。",
        createdAt: nowIso()
      });
      setPhotoNotice("照片识别未完成，请重新拍摄。");
    } finally {
      setPhotoBusy(false);
      setPhotoProgress("");
      autoScrollRef.current = false;
    }
  }

  const recentMessages = messages.slice(-5);
  const olderMessages = messages.slice(0, -5);

  function renderMessage(message: ChatMessage) {
    return (
      <article className={`message ${message.role}`} key={message.id}>
        <div className="message-role">
          {message.role === "assistant" ? "智药有方" : "您"}
        </div>
        <div className="message-bubble">{message.content}</div>
        {message.imageDataUrls?.length ? (
          <div className="message-image-grid">
            {message.imageDataUrls.map((image, index) => (
              <img
                key={`${message.id}-${index}`}
                src={image}
                alt={`用户上传的药品照片 ${index + 1}`}
              />
            ))}
          </div>
        ) : null}
        {message.riskCheck ? (
          <MessageRisk
            riskCheck={message.riskCheck}
            soundEnabled={profile.voiceEnabled && preferences.soundEnabled}
          />
        ) : null}
      </article>
    );
  }

  return (
    <div className="page chat-page">
      <DiscoveryNav />
      <header className="page-header">
        <div>
          <p className="eyebrow">问药 · 先给结论，再讲原因</p>
          <h1 className="page-title">哪里不明白，直接说</h1>
          <p className="page-description">
            我会先核对当前全部药物。涉及诊断、停药或调剂量时，我会明确停下来。
          </p>
        </div>
        <div className="chip-row">
          <span className="chip">
            <ShieldCheck size={15} aria-hidden="true" />
            高风险受限回答
          </span>
          <span className="chip">
            <Sparkles size={15} aria-hidden="true" />
            {mode === "llm" ? "大模型 + 本地安全规则" : "本地安全规则演示"}
          </span>
        </div>
      </header>

      {searchParams.get("concern") === "1" ? (
        <div className="notice warm" style={{ marginBottom: 16 }}>
          <ShieldCheck size={20} aria-hidden="true" />
          已记录您不舒服，并尝试把求助摘要发送给已授权家属。如果症状紧急，请直接拨打 120。
        </div>
      ) : null}

      <div className="chat-single">
        <div className="chat-top-tools">
          <button
            type="button"
            className="btn btn-primary btn-large"
            aria-label="打开摄像头拍照识药"
            disabled={photoBusy}
            onClick={() => {
              speech.stop();
              setCameraOpen(true);
            }}
          >
            {photoBusy ? (
              <LoaderCircle size={21} className="spin" aria-hidden="true" />
            ) : (
              <Camera size={21} aria-hidden="true" />
            )}
            {photoBusy ? photoProgress || "正在识药" : "拍照识药"}
          </button>
          <span className="chip">
            <ShieldCheck size={15} aria-hidden="true" />
            已核对 {medications.filter((item) => item.status === "active").length} 种当前药物
          </span>
          <details className="chat-stage-details">
            <summary>查看本次核对步骤</summary>
            {stages.length ? (
              stages.map((stage) => (
                <div className={`agent-stage ${stage.status}`} key={stage.id}>
                  <span className="stage-dot" aria-hidden="true" />
                  {stage.label}
                  {stage.status === "done" ? (
                    <CheckCircle2 size={16} aria-hidden="true" />
                  ) : null}
                </div>
              ))
            ) : (
              <p className="field-hint">提问后会显示识别问题、读取药物和风险核查阶段。</p>
            )}
          </details>
        </div>
        {photoNotice ? (
          <div className="notice" style={{ marginBottom: 12 }}>
            <Camera size={20} aria-hidden="true" />
            <span>
              {photoNotice}{" "}
              <button
                type="button"
                className="text-link"
                onClick={() => navigate("/add-medication?from=chat")}
              >
                去核对并加入用药
              </button>
            </span>
          </div>
        ) : null}
        <section className="card chat-panel">
          <div className="chat-messages" aria-live="polite" ref={messagesRef}>
            {olderMessages.length ? (
              <details className="chat-history">
                <summary>查看更早的 {olderMessages.length} 条对话</summary>
                <div className="chat-history-list">
                  {olderMessages.map(renderMessage)}
                </div>
              </details>
            ) : null}
            {recentMessages.map(renderMessage)}
            {sending ? (
              <article className="message assistant">
                <div className="message-role">智药有方</div>
                <div className="message-bubble">
                  <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <LoaderCircle size={20} className="spin" aria-hidden="true" />
                    正在帮您核对，请稍等…
                  </span>
                </div>
              </article>
            ) : null}
          </div>
          <div className="chat-suggestions">
            {sampleQuestions.map((question) => (
              <button
                className="suggestion-chip"
                type="button"
                key={question}
                onClick={() => void submitQuestion(question)}
              >
                {question}
              </button>
            ))}
          </div>
          <div
            className={`chat-voice-status ${speech.error ? "error" : ""}`}
            aria-live="polite"
          >
            {speech.error
              ? speech.error
              : speech.interim
                ? `正在听：${speech.interim}`
                : speech.listening
                  ? "正在聆听，松开后结束"
                  : "按住语音键说话，松开时结束"}
          </div>
          <div className="chat-composer">
            <label>
              <span className="sr-only">输入您想问的用药问题</span>
              <textarea
                value={input}
                placeholder="例如：这两种药能一起吃吗？"
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void submitQuestion();
                  }
                }}
              />
            </label>
            <button
              type="button"
              className={`voice-button ${speech.listening ? "listening" : ""}`}
              aria-label="按住说话，松开结束"
              disabled={!speech.supported}
              onContextMenu={(event) => event.preventDefault()}
              onPointerDown={(event) => {
                if (event.button !== 0 || speech.listening) return;
                speech.start();
              }}
              onPointerUp={speech.stop}
              onPointerCancel={speech.stop}
              onKeyDown={(event) => {
                if (
                  (event.key === " " || event.key === "Enter") &&
                  !event.repeat &&
                  !speech.listening
                ) {
                  event.preventDefault();
                  speech.start();
                }
              }}
              onKeyUp={(event) => {
                if (event.key === " " || event.key === "Enter") {
                  event.preventDefault();
                  speech.stop();
                }
              }}
            >
              <Mic size={25} aria-hidden="true" />
              <span>{speech.listening ? "松开结束" : "按住说话"}</span>
            </button>
            {speech.listening ? (
              <button
                className="btn btn-warm submit-btn"
                type="button"
                onClick={speech.stop}
              >
                <Square size={18} aria-hidden="true" />
                <span className="btn-label">结束语音</span>
              </button>
            ) : (
              <button
                className="btn btn-primary submit-btn"
                type="button"
                disabled={sending || !input.trim()}
                onClick={() => void submitQuestion()}
              >
                <Send size={20} aria-hidden="true" />
                <span className="btn-label">发送</span>
              </button>
            )}
          </div>
        </section>

      </div>
      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(imageDataUrl) => {
          setCameraOpen(false);
          void scanMedicationImage(imageDataUrl);
        }}
      />
    </div>
  );
}

function MessageRisk({
  riskCheck,
  soundEnabled
}: {
  riskCheck: RiskCheck;
  soundEnabled: boolean;
}) {
  return (
    <div className="message-risk">
      <div className="message-risk-top">
        <h4>{riskCheck.title}</h4>
        <RiskBadge level={riskCheck.level} />
      </div>
      <p>{riskCheck.nextStep}</p>
      <details style={{ marginTop: 10 }}>
        <summary style={{ color: "var(--primary)", fontWeight: 700 }}>
          <ChevronDown size={16} style={{ verticalAlign: "middle" }} aria-hidden="true" />
          查看依据与核查范围
        </summary>
        <p style={{ marginTop: 8 }}>
          本次核对：{riskCheck.medicationSnapshot.join("、") || "没有当前药物"}
        </p>
        <SourcesBlock sourceIds={riskCheck.sourceIds} />
      </details>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ marginTop: 8 }}
        disabled={!soundEnabled}
        onClick={() =>
          speakText(`${riskCheck.summary}。${riskCheck.nextStep}`)
        }
      >
        <Volume2 size={18} aria-hidden="true" />
        {soundEnabled ? "朗读检查结果" : "语音朗读已关闭"}
      </button>
    </div>
  );
}
