import {
  ArrowDown,
  BellOff,
  BellRing,
  BookOpenText,
  Camera,
  ChevronRight,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  Copy,
  ExternalLink,
  LoaderCircle,
  Leaf,
  MessageCircleHeart,
  MessageSquareText,
  Mic,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RotateCcw,
  Send,
  Search,
  ShieldCheck,
  Sparkles,
  Square,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Volume2,
  VolumeX
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { RiskBadge } from "../components/RiskBadge";
import { SourcesBlock } from "../components/SourcesBlock";
import { CameraCaptureModal } from "../components/CameraCaptureModal";
import { DiscoveryNav } from "../components/DiscoveryNav";
import { createId } from "../lib/ids";
import { answerWithRules, checkNewMedication } from "../lib/riskEngine";
import { sendConcernAlert } from "../lib/cloud";
import { streamAssistantAnswer } from "../lib/assistantStream";
import {
  catalogResponseFromRuns,
  planAgentTools,
  runAgentPlan,
  safetyResponseFromRuns
} from "../lib/agentTools";
import { createManualDraft, recognizeMedicineImage } from "../lib/ocr";
import {
  answerFromDrugCatalog,
  buildAutomaticMedicineReport,
  currentCatalogCompanionSlugs
} from "../catalog/chatBridge";
import { findBestMedicine } from "../catalog/retrieval";
import { buildLocalGuidance } from "../catalog/guidance";
import { searchHerbs } from "../catalog/herbs";
import {
  buildDraftsFromVision,
  type VisionIdentification
} from "../lib/vision";
import { speakText, stopSpeaking } from "../lib/speech";
import { useQwenSpeechRecognition } from "../lib/qwenSpeech";
import { nowIso, getNextDose, formatMessageTime } from "../lib/time";
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

type ComposerSkill = "photo" | "catalog" | "herbs" | "multi-drug";
type AnswerMode = "quick" | "safety" | "detailed";

const composerSkills: Array<{
  id: ComposerSkill;
  label: string;
  icon: typeof Camera;
  placeholder: string;
  researchPath: string;
  researchLabel: string;
}> = [
  {
    id: "photo",
    label: "拍照识药",
    icon: Camera,
    placeholder: "拍药盒后继续问：这个药怎么吃？和我现在的药冲突吗？",
    researchPath: "/add-medication?from=chat",
    researchLabel: "打开加药核对"
  },
  {
    id: "catalog",
    label: "药品百科",
    icon: BookOpenText,
    placeholder: "输入药名，实时询问用法、禁忌、副作用和同服风险…",
    researchPath: "/catalog",
    researchLabel: "深度查药品百科"
  },
  {
    id: "herbs",
    label: "识中药材",
    icon: Leaf,
    placeholder: "输入中药材名，实时询问辨识、用法和搭配风险…",
    researchPath: "/herbs",
    researchLabel: "进入中药材图谱"
  },
  {
    id: "multi-drug",
    label: "多药对账",
    icon: ClipboardList,
    placeholder: "描述多种药或保健品，实时核对重复成分和相互作用…",
    researchPath: "/multi-drug",
    researchLabel: "打开完整多药对账"
  }
];

function needsMedicationReview(question: string, skill?: ComposerSkill): boolean {
  if (skill === "photo" || skill === "catalog" || skill === "multi-drug") {
    return true;
  }
  return /(药|胶囊|片|颗粒|剂量|用量|用法|服用|怎么吃|什么时候吃|毫克|mg|同服|一起吃|相互作用|漏服|补服|停药|副作用|不良反应|头晕|恶心|心慌|胸闷|不舒服)/i.test(
    question
  );
}

function herbSkillAnswer(
  question: string,
  profile: { age: number; conditions: string[] },
  currentMedicationNames: string[]
): AssistantResponse | null {
  const herb = searchHerbs(question).find((item) =>
    [item.name, ...item.aliases].some((term) => question.includes(term))
  );
  if (!herb) return null;
  const hasAnticoagulant = currentMedicationNames.some((name) =>
    /华法林|阿司匹林|氯吡格雷|利伐沙班/.test(name)
  );
  const level = hasAnticoagulant ? "medium" : "low";
  return {
    message: [
      `识别到中药材：${herb.name}`,
      `性味归经：${herb.nature} · ${herb.flavor} · 归${herb.meridians.join("、")}经`,
      `传统用途：${herb.functions.join("、")}`,
      "",
      "安全提醒：",
      ...herb.safety.map((item) => `· ${item}`),
      "",
      hasAnticoagulant
        ? "结论：您当前有需要关注凝血风险的处方药，不要自行把这类中药材加入日常服用。请先让医生或药师核对。"
        : "结论：中药材也需要结合体质、炮制方法和正在服用的药物核对，不能仅凭名称自行定量或长期服用。",
      `老人特别说明：${profile.age >= 65 ? "年龄较大，更应避免自行叠加药材和保健品。" : "使用前仍需核对年龄和基础疾病。"}`
    ].join("\n"),
    riskCheck: {
      id: `herb-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      level,
      title: hasAnticoagulant
        ? "中药材与当前抗凝用药需要专业核对"
        : `${herb.name}使用前需要核对`,
      summary: herb.traditionalUse,
      nextStep: hasAnticoagulant
        ? "不要自行同服。请携带药材实物和全部处方药，让医生或药师评估。"
        : "不要用单一症状自行确定体质，也不能用中药材替代处方药。",
      reasons: [
        `已匹配中药材：${herb.name}`,
        `当前基础疾病：${profile.conditions.join("、") || "未填写"}`
      ],
      sourceIds: ["src-herb-catalog"],
      involvedMedicationIds: [],
      medicationSnapshot: currentMedicationNames,
      createdAt: nowIso()
    },
    stages: [
      { id: "herb-match", label: `识别中药材：${herb.name}`, status: "done" },
      { id: "herb-safety", label: "核对安全提醒与当前用药", status: "done" },
      { id: "herb-answer", label: "生成针对性解答", status: "done" }
    ],
    mode: "rules"
  };
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function renderInlineMarkdown(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .filter(Boolean)
    .map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return <code key={index}>{part.slice(1, -1)}</code>;
      }
      return <span key={index}>{part}</span>;
    });
}

function AssistantMarkdown({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(
      <p key={`p-${blocks.length}`}>
        {renderInlineMarkdown(paragraph.join("\n"))}
      </p>
    );
    paragraph = [];
  };
  const flushList = () => {
    if (!listItems.length || !listType) return;
    const List = listType;
    blocks.push(
      <List key={`list-${blocks.length}`}>
        {listItems.map((item, index) => (
          <li key={index}>{renderInlineMarkdown(item)}</li>
        ))}
      </List>
    );
    listItems = [];
    listType = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    const heading = trimmed.match(/^#{1,4}\s+(.+)$/);
    const bracketHeading = trimmed.match(/^【(.+)】$/);
    const quote = trimmed.match(/^>\s?(.+)$/);

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }
    if (heading || bracketHeading) {
      flushParagraph();
      flushList();
      blocks.push(
        <h4 key={`h-${blocks.length}`}>
          {renderInlineMarkdown(heading?.[1] || bracketHeading?.[1] || "")}
        </h4>
      );
      continue;
    }
    if (quote) {
      flushParagraph();
      flushList();
      blocks.push(
        <blockquote key={`quote-${blocks.length}`}>
          {renderInlineMarkdown(quote[1])}
        </blockquote>
      );
      continue;
    }
    if (ordered || bullet) {
      flushParagraph();
      const nextType = ordered ? "ol" : "ul";
      if (listType && listType !== nextType) flushList();
      listType = nextType;
      listItems.push((ordered?.[1] || bullet?.[1] || "").trim());
      continue;
    }
    flushList();
    paragraph.push(trimmed);
  }
  flushParagraph();
  flushList();
  return <div className="assistant-markdown">{blocks}</div>;
}

export function ChatPage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const conversations = useAppStore((state) => state.conversations);
  const activeConversationId = useAppStore(
    (state) => state.activeConversationId
  );
  const activeConversation = conversations.find(
    (conversation) => conversation.id === activeConversationId
  );
  const messages = activeConversation?.messages ?? [];
  const medications = useAppStore((state) => state.medications);
  const profile = useAppStore((state) => state.profile);
  const preferences = useAppStore((state) => state.preferences);
  const updateProfile = useAppStore((state) => state.updateProfile);
  const updatePreferences = useAppStore((state) => state.updatePreferences);
  const familyCode = useAppStore((state) => state.familyCode);
  const addFamilyAlert = useAppStore((state) => state.addFamilyAlert);
  const addChatMessage = useAppStore((state) => state.addChatMessage);
  const replaceChatMessage = useAppStore(
    (state) => state.replaceChatMessage
  );
  const saveIntakeDraft = useAppStore((state) => state.saveIntakeDraft);
  const createConversation = useAppStore((state) => state.createConversation);
  const deleteConversation = useAppStore((state) => state.deleteConversation);
  const deleteChatMessage = useAppStore((state) => state.deleteChatMessage);
  const setActiveConversation = useAppStore(
    (state) => state.setActiveConversation
  );
  const setConversationMedicineContext = useAppStore(
    (state) => state.setConversationMedicineContext
  );
  const [input, setInput] = useState(searchParams.get("q") ?? "");
  const [sending, setSending] = useState(false);
  const [stages, setStages] = useState<AssistantStage[]>([]);
  const [mode, setMode] = useState<"rules" | "llm">("rules");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoProgress, setPhotoProgress] = useState("");
  const [photoNotice, setPhotoNotice] = useState("");
  const [reminderNotice, setReminderNotice] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [view, setView] = useState<"home" | "conversation">(
    searchParams.get("q") ? "conversation" : "home"
  );
  const [composerSkill, setComposerSkill] = useState<ComposerSkill>();
  const [answerMode, setAnswerMode] = useState<AnswerMode>("safety");
  const [skillMenuOpen, setSkillMenuOpen] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState("");
  const [thinkingLabel, setThinkingLabel] = useState("正在思考并组织回答…");
  const [conversationToDelete, setConversationToDelete] = useState<{
    id: string;
    title: string;
  }>();
  const [copiedMessageId, setCopiedMessageId] = useState("");
  const [speakingMessageId, setSpeakingMessageId] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem("chat-sidebar-width");
    const parsed = saved ? Number(saved) : 220;
    return Number.isFinite(parsed) && parsed >= 160 && parsed <= 400 ? parsed : 220;
  });
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef<{ mouseX: number; width: number } | null>(null);
  const latestSidebarWidth = useRef(220);
  const messagesRef = useRef<HTMLDivElement>(null);
  const initialQueryHandled = useRef(false);
  const autoScrollRef = useRef(false);
  const streamTraceRef = useRef<AssistantStage[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  const speech = useQwenSpeechRecognition((transcript) => {
    setInput(transcript);
  });

  function updateScrollAvailability() {
    const container = messagesRef.current;
    if (!container) {
      setShowScrollToBottom(false);
      return;
    }
    setShowScrollToBottom(
      container.scrollHeight - container.scrollTop - container.clientHeight > 60
    );
  }

  useEffect(() => {
    if (!autoScrollRef.current) return;
    const container = messagesRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth"
    });
    setShowScrollToBottom(false);
  }, [messages, sending, stages]);

  useEffect(() => {
    const container = messagesRef.current;
    if (container) container.scrollTop = 0;
  }, []);

  useEffect(() => {
    const container = messagesRef.current;
    if (!container) {
      setShowScrollToBottom(false);
      return;
    }
    updateScrollAvailability();
    const observer = new ResizeObserver(updateScrollAvailability);
    observer.observe(container);
    return () => observer.disconnect();
  }, [view, messages, sending, stages]);

  useEffect(() => {
    const initialQuery = searchParams.get("q");
    if (initialQuery && !initialQueryHandled.current) {
      const signature = `chat-auto:${location.key}:${initialQuery}`;
      if (sessionStorage.getItem(signature)) return;
      sessionStorage.setItem(signature, "1");
      initialQueryHandled.current = true;
      createConversation();
      void submitQuestion(initialQuery, false);
    }
  }, [searchParams, location.key]);

  useEffect(() => {
    latestSidebarWidth.current = sidebarWidth;
  }, [sidebarWidth]);

  // Auto-clear the reminder toggle notice after a few seconds
  useEffect(() => {
    if (!reminderNotice) return;
    const timer = window.setTimeout(() => setReminderNotice(""), 3000);
    return () => window.clearTimeout(timer);
  }, [reminderNotice]);

  // Sidebar resize handling — uses delta from mousedown for pixel-perfect sensitivity
  useEffect(() => {
    if (!isResizing) return;
    const start = resizeStartRef.current;
    if (!start) return;

    function onMove(event: MouseEvent) {
      const delta = event.clientX - start!.mouseX;
      const next = Math.min(400, Math.max(160, start!.width + delta));
      setSidebarWidth(next);
    }
    function onUp() {
      setIsResizing(false);
      resizeStartRef.current = null;
      localStorage.setItem(
        "chat-sidebar-width",
        String(latestSidebarWidth.current)
      );
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing]);

  async function submitQuestion(question = input, autoScroll = true) {
    const clean = question.trim();
    if (!clean || sending) return;
    const liveConversation = useAppStore
      .getState()
      .conversations.find(
        (conversation) =>
          conversation.id === useAppStore.getState().activeConversationId
      );
    if (
      view === "home" &&
      liveConversation?.messages.some((message) => message.role === "user")
    ) {
      createConversation();
    }
    setView("conversation");
    autoScrollRef.current = autoScroll;
    setInput("");
    setSending(true);
    setStreamingMessageId("");
    streamTraceRef.current = [];
    setThinkingLabel(
      needsMedicationReview(clean, composerSkill)
        ? "正在核对用药安全、当前药物和资料来源…"
        : answerMode === "detailed"
          ? "正在整理详细解释…"
          : "正在思考并组织回答…"
    );
    const targetConversationId =
      useAppStore.getState().activeConversationId;
    const userMessage: ChatMessage = {
      id: createId("chat"),
      role: "user",
      content: clean,
      createdAt: nowIso()
    };
    addChatMessage(userMessage, targetConversationId);

    const activeMedications = medications.filter(
      (medication) => medication.status === "active"
    );
    const stateAfterMessage = useAppStore.getState();
    const currentConversation = stateAfterMessage.conversations.find(
      (conversation) =>
        conversation.id === stateAfterMessage.activeConversationId
    );
    const currentConversationDraft =
      currentConversation?.medicineContext ?? stateAfterMessage.intakeDraft;
    const contextualQuestion =
      currentConversationDraft &&
      /(这个药|这种药|它|这盒药|图片里)/.test(clean) &&
      currentConversationDraft.name
        ? `${currentConversationDraft.name} ${clean}`
        : clean;
    const plannedTools = planAgentTools(
      contextualQuestion,
      Boolean(currentConversationDraft?.name)
    );
    const agentRuns = runAgentPlan(plannedTools, {
      query: contextualQuestion,
      profile,
      medications: activeMedications
    });
    const agentTrace = agentRuns.map((run) => ({
      id: `tool-${run.name}`,
      label: run.label,
      summary: run.summary,
      durationMs: run.durationMs
    }));
    let localResponse =
      safetyResponseFromRuns(agentRuns) ??
      answerWithRules(contextualQuestion, activeMedications, profile);
    if (composerSkill === "herbs") {
      localResponse =
        herbSkillAnswer(
          contextualQuestion,
          profile,
          activeMedications.map((medication) => medication.name)
        ) ?? localResponse;
    }
    const catalogResponse =
      catalogResponseFromRuns(agentRuns) ??
      answerFromDrugCatalog(
        contextualQuestion,
        profile,
        activeMedications.map((medication) => medication.name)
      );
    const mentionsCurrentMedication = activeMedications.some((medication) =>
      clean.includes(medication.name) ||
      clean.includes(medication.genericName) ||
      medication.ingredients.some((ingredient) => clean.includes(ingredient))
    );
    const catalogQuestionIntent =
      /(副作用|不良反应|禁忌|禁用|老人|老年|孕妇|孕期|哺乳|肾|肝|饮酒|喝酒|食物|饮食|开车|驾驶|嗜睡|储存|保存|过量|吃多|怎么吃|剂量|注意|价格|漏服)/.test(
        clean
      );
    if (
      catalogResponse &&
      (!mentionsCurrentMedication ||
        catalogQuestionIntent ||
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
      [
        ...localResponse.stages,
        ...agentTrace.map((trace) => ({
          id: `trace-${trace.id}`,
          label: trace.label,
          status: "pending" as const
        }))
      ].map((stage, index) => ({
        ...stage,
        status: index === 0 ? "active" : "pending"
      }))
    );

    const localStageCount =
      localResponse.stages.length + agentTrace.length;
    for (let index = 0; index < localStageCount; index += 1) {
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
    let streamedAssistantMessageId = "";
    if (
      localResponse.riskCheck.level === "low" ||
      localResponse.riskCheck.level === "medium" ||
      localResponse.riskCheck.level === "unknown"
    ) {
      streamedAssistantMessageId = createId("chat");
      const streamedMessage: ChatMessage = {
        id: streamedAssistantMessageId,
        role: "assistant",
        content: "",
        createdAt: nowIso(),
        pending: true
      };
      addChatMessage(streamedMessage, targetConversationId);
      setStreamingMessageId(streamedAssistantMessageId);
      let fullText = "";
      let flushScheduled = false;
      const flushStream = () => {
        if (flushScheduled) return;
        flushScheduled = true;
        window.requestAnimationFrame(() => {
          flushScheduled = false;
          replaceChatMessage(
            streamedAssistantMessageId,
            {
              ...streamedMessage,
              content: fullText,
              pending: true
            },
            targetConversationId
          );
        });
      };
      try {
        const controller = new AbortController();
        abortControllerRef.current = controller;
        const streamed = await streamAssistantAnswer(
          {
            query: clean,
            profile,
            medications,
            evidence: localResponse.riskCheck.sourceIds,
            riskLevel: localResponse.riskCheck.level,
            groundingText: localResponse.message,
            skill: composerSkill,
            skillLabel: composerSkills.find(
              (item) => item.id === composerSkill
            )?.label,
            answerMode,
            agentTrace,
            history: (currentConversation?.messages ?? [])
              .filter((message) => message.id !== userMessage.id)
              .filter(
                (message) =>
                  message.role === "user" || message.role === "assistant"
              )
              .slice(-10)
              .map((message) => ({
                role: message.role,
                content: message.content.slice(0, 1000)
              }))
          },
          {
            onDelta: (_delta, nextFullText) => {
              fullText = nextFullText;
              flushStream();
            },
            onStage: (stage) => {
              const traceStage: AssistantStage = {
                id: `stream-${stage.id}`,
                label: stage.label,
                status: "done"
              };
              if (
                !streamTraceRef.current.some(
                  (item) => item.id === traceStage.id
                )
              ) {
                streamTraceRef.current.push(traceStage);
              }
              setStages((current) => [
                ...current.filter(
                  (item) => item.id !== traceStage.id
                ),
                traceStage
              ]);
            },
            signal: controller.signal
          }
        );
        if (!streamed.trim()) throw new Error("模型没有返回内容");
        response = {
          ...localResponse,
          message: streamed,
          mode: "llm"
        };
        replaceChatMessage(
          streamedAssistantMessageId,
          {
            ...streamedMessage,
            content: streamed,
            pending: false,
            riskCheck: response.riskCheck
          },
          targetConversationId
        );
      } catch (err) {
        const aborted =
          (err instanceof DOMException && err.name === "AbortError") ||
          (err as Error | undefined)?.name === "AbortError";
        // 已收到的流式内容作为最终答案（截断处理）
        const finalContent =
          aborted && fullText.trim()
            ? fullText.trim() + "\n\n_（已停止生成）_"
            : response.message;
        replaceChatMessage(
          streamedAssistantMessageId,
          {
            ...streamedMessage,
            content: finalContent,
            pending: false,
            riskCheck: aborted ? response.riskCheck : response.riskCheck
          },
          targetConversationId
        );
        if (aborted) {
          // 中断后跳过后面的 speakText / setSending
          stopSpeaking();
          setStreamingMessageId("");
          abortControllerRef.current = null;
          setSending(false);
          autoScrollRef.current = false;
          return;
        }
      } finally {
        setStreamingMessageId("");
        abortControllerRef.current = null;
      }
    }

    setMode(response.mode);
    if (!streamedAssistantMessageId) {
      addChatMessage({
        id: createId("chat"),
        role: "assistant",
        content: response.message,
        createdAt: nowIso(),
        riskCheck: response.riskCheck
      }, targetConversationId);
    }
    speakText(
      `${response.message}。${response.riskCheck.nextStep}`,
      profile.voiceEnabled && preferences.soundEnabled,
      preferences.voiceMode,
      preferences.customVoiceId
    );
    setStages([
      ...response.stages.map((stage) => ({
        ...stage,
        status: "done" as const
      })),
      ...streamTraceRef.current
    ]);
    setSending(false);
    autoScrollRef.current = false;
  }

  async function scanMedicationImage(imageDataUrl: string) {
    if (!imageDataUrl || photoBusy) return;
    setView("conversation");
    setPhotoBusy(true);
    setPhotoProgress("正在读取照片");
    autoScrollRef.current = true;
    const targetConversationId =
      useAppStore.getState().activeConversationId;
    addChatMessage({
      id: createId("chat"),
      role: "user",
      content: "我拍了一张药盒照片，请帮我识别风险、用法和价格。",
      createdAt: nowIso(),
      imageDataUrls: [imageDataUrl]
    }, targetConversationId);

    try {
      let draft;
      const visionPromise = fetch("/api/vision-identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl, mode: "medicine" })
      })
        .then(async (response) => {
          if (!response.ok) return null;
          return (await response.json()) as VisionIdentification;
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
      const activeMedications = medications.filter(
        (medication) => medication.status === "active"
      );
      const companionSlugs = currentCatalogCompanionSlugs(
        activeMedications.map(
          (medication) => medication.genericName || medication.name
        )
      );
      const healthContext = [
        ...(profile.age >= 65 ? (["older"] as const) : []),
        ...(profile.conditions.some((item) => /肾/.test(item))
          ? (["kidney"] as const)
          : []),
        ...(profile.conditions.some((item) => /肝/.test(item))
          ? (["liver"] as const)
          : [])
      ];
      const recognizedDrafts = buildDraftsFromVision(
        imageDataUrl,
        draft,
        vision
      );
      if (!recognizedDrafts.some((item) => item.name.trim())) {
        throw new Error("未识别到明确药物");
      }
      const photoResults = recognizedDrafts.map((recognizedDraft) => {
        let nextDraft = recognizedDraft;
        const compactText = `${nextDraft.name}${nextDraft.rawText}`.replace(
          /\s+/g,
          ""
        );
        const learned = medications.find((medication) =>
          [medication.name, medication.genericName, ...medication.ingredients]
            .filter(Boolean)
            .some((term) =>
              compactText.includes(term.replace(/\s+/g, ""))
            )
        );
        if (learned) {
          nextDraft = {
            ...nextDraft,
            name: nextDraft.name || learned.name,
            genericName: nextDraft.genericName || learned.genericName,
            ingredientsText:
              nextDraft.ingredientsText || learned.ingredients.join("、"),
            dosage: nextDraft.dosage || learned.dosage,
            frequency: nextDraft.frequency || learned.frequency,
            times: nextDraft.times.length ? nextDraft.times : learned.times,
            relation: nextDraft.relation || learned.relation,
            instructions:
              nextDraft.instructions || learned.instructions,
            price: nextDraft.price || learned.price,
            confidence: Math.max(nextDraft.confidence, learned.confidence)
          };
        }
        const bestCatalogMatch = nextDraft.name
          ? findBestMedicine(nextDraft.name)
          : null;
        const catalogMatch =
          bestCatalogMatch && bestCatalogMatch.score >= 0.6
            ? bestCatalogMatch.medicine
            : undefined;
        if (catalogMatch) {
          nextDraft = {
            ...nextDraft,
            name: nextDraft.name || catalogMatch.displayName,
            genericName:
              nextDraft.genericName || catalogMatch.activeIngredient,
            ingredientsText:
              nextDraft.ingredientsText || catalogMatch.activeIngredient,
            frequency: nextDraft.frequency || "每日 1 次",
            relation:
              nextDraft.relation ||
              (/餐后|饭后|随餐/.test(catalogMatch.timing)
                ? "饭后"
                : "按说明书"),
            instructions:
              nextDraft.instructions ||
              `${catalogMatch.howToTake} ${catalogMatch.keyWarnings[0]}`,
            confidence: Math.max(nextDraft.confidence, 0.8)
          };
        }
        const createdAt = nowIso();
        const candidate = {
          id: createId("med"),
          name: nextDraft.name,
          genericName: nextDraft.genericName,
          ingredients: nextDraft.ingredientsText
            .split(/[、,，/\s]+/)
            .filter(Boolean),
          dosage: nextDraft.dosage,
          frequency: nextDraft.frequency,
          times: nextDraft.times,
          relation: nextDraft.relation,
          instructions: nextDraft.instructions,
          price: nextDraft.price,
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
          confidence: nextDraft.confidence,
          createdAt,
          updatedAt: createdAt
        };
        const catalogResponse = catalogMatch
          ? answerFromDrugCatalog(
              `${catalogMatch.displayName} 请给出使用方法、危害、注意事项和当前同服风险`,
              profile,
              activeMedications.map((medication) => medication.name),
              companionSlugs
            )
          : null;
        const catalogGuidance = catalogMatch
          ? buildLocalGuidance({
              medicineSlug: catalogMatch.slug,
              companionSlugs,
              healthContext
            })
          : null;
        const unknownCheck = checkNewMedication(
          candidate,
          medications,
          profile
        );
        const preliminaryCheck = checkNewMedication(
          {
            ...candidate,
            source: { ...candidate.source, confirmed: true }
          },
          medications,
          profile
        );
        const riskCheck =
          catalogResponse?.riskCheck ??
          (["high", "medium", "emergency"].includes(
            preliminaryCheck.level
          )
            ? {
                ...preliminaryCheck,
                title: `初步发现：${preliminaryCheck.title}`,
                summary: `${preliminaryCheck.summary} 目前基于图像提取的识别字段。`
              }
            : unknownCheck);
        const priceText =
          nextDraft.price ||
          "暂无可靠价格数据，请以药房价格或购买记录为准";
        const body =
          catalogMatch && catalogGuidance
            ? [
                buildAutomaticMedicineReport(
                  catalogMatch,
                  catalogGuidance
                ),
                `图片参考价格：${priceText}`
              ].join("\n\n")
            : [
                `识别可信度：${Math.round(nextDraft.confidence * 100)}%`,
                nextDraft.ingredientsText
                  ? `主要成分：${nextDraft.ingredientsText}`
                  : "",
                nextDraft.dosage ? `图片中剂量：${nextDraft.dosage}` : "",
                nextDraft.frequency
                  ? `图片中次数：${nextDraft.frequency}`
                  : "",
                nextDraft.relation
                  ? `图片中服用时间：${nextDraft.relation}`
                  : "",
                `参考价格：${priceText}`,
                riskCheck.summary,
                riskCheck.nextStep
              ]
                .filter(Boolean)
                .join("\n");
        return {
          draft: nextDraft,
          riskCheck,
          learned,
          body
        };
      });
      const severityRank: Record<RiskCheck["level"], number> = {
        low: 0,
        unknown: 1,
        medium: 2,
        high: 3,
        emergency: 4
      };
      const primaryResult = [...photoResults].sort(
        (left, right) =>
          severityRank[right.riskCheck.level] -
          severityRank[left.riskCheck.level]
      )[0];
      const riskCheck =
        photoResults.length > 1
          ? {
              ...primaryResult.riskCheck,
              title: `一次识别 ${photoResults.length} 种药物，最高风险：${primaryResult.riskCheck.title}`,
              summary: `本次共识别 ${photoResults.length} 种药物，下面分别给出每种药物的用法、注意事项、价格线索和风险提示。`
            }
          : primaryResult.riskCheck;
      saveIntakeDraft(photoResults[0].draft);
      setConversationMedicineContext(
        photoResults[0].draft,
        targetConversationId
      );
      const content = [
        photoResults.length > 1
          ? `## 识别到 ${photoResults.length} 种药物`
          : "",
        ...photoResults.flatMap((result, index) => [
          photoResults.length > 1
            ? `### ${index + 1}. ${result.draft.name}`
            : "",
          result.body,
          result.learned
            ? `已复用您上次确认的“${result.learned.name}”资料。`
            : ""
        ]),
        vision?.summary ? `### 图片整体说明\n${vision.summary}` : "",
        ...(vision?.cautions || []).map((item) => `> 注意：${item}`)
      ]
        .filter(Boolean)
        .join("\n\n");
      addChatMessage({
        id: createId("chat"),
        role: "assistant",
        content,
        createdAt: nowIso(),
        riskCheck
      }, targetConversationId);
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
        photoResults.length > 1
          ? `AI 已识别 ${photoResults.length} 种药物：${photoResults
              .map((result) => result.draft.name)
              .join("、")}。每种药物的用法和风险已分别列出。`
          : `AI 已完成“${photoResults[0].draft.name}”的图像分析；名称不够确定时建议补拍说明书正面。`
      );
    } catch {
      addChatMessage({
        id: createId("chat"),
        role: "assistant",
        content:
          "这张照片暂时没有识别成功。请重新拍清楚药名、规格和用法，或改用“拍照加药”手动核对。",
        createdAt: nowIso()
      }, targetConversationId);
      setPhotoNotice("照片识别未完成，请重新拍摄。");
    } finally {
      setPhotoBusy(false);
      setPhotoProgress("");
      autoScrollRef.current = false;
    }

  }

  function startCameraScan() {
    speech.stop();
    setView("conversation");
    setCameraOpen(true);
  }

  function startNewConversation() {
    speech.stop();
    const current = useAppStore
      .getState()
      .conversations.find(
        (conversation) =>
          conversation.id === useAppStore.getState().activeConversationId
      );
    if (
      current?.messages.some((message) => message.role === "user") ||
      current?.medicineContext
    ) {
      createConversation();
    }
    setView("home");
    setInput("");
    setStages([]);
    setPhotoNotice("");
    setComposerSkill(undefined);
    setShowScrollToBottom(false);
  }

  function toggleReminders() {
    const next = !preferences.remindersEnabled;
    updatePreferences({ remindersEnabled: next });
    if (!next) {
      stopSpeaking();
      setReminderNotice("已关闭吃药提醒");
      return;
    }
    // 开启提醒时立即检查是否有即将到期的用药
    const state = useAppStore.getState();
    const nextDose = getNextDose(
      state.medications,
      state.doseEvents,
      new Date(),
      state.profile.timeZone
    );
    if (nextDose) {
      const minutesFromNow =
        (new Date(nextDose.scheduledAt).getTime() - Date.now()) / 60000;
      if (minutesFromNow <= 15 && minutesFromNow >= -90) {
        setReminderNotice(
          `已开启吃药提醒，下一次：${nextDose.medication.name}`
        );
      } else if (minutesFromNow > 0) {
        const hours = Math.floor(minutesFromNow / 60);
        const mins = Math.round(minutesFromNow % 60);
        setReminderNotice(
          `已开启吃药提醒，约 ${hours > 0 ? `${hours}小时` : ""}${mins}分钟后提醒`
        );
      } else {
        setReminderNotice("已开启吃药提醒");
      }
    } else {
      setReminderNotice("已开启吃药提醒，暂无待提醒的用药");
    }
  }

  function removeConversation(id: string, title: string) {
    setConversationToDelete({ id, title });
  }

  function confirmDeleteConversation() {
    if (!conversationToDelete) return;
    const { id } = conversationToDelete;
    const wasActive = id === activeConversationId;
    deleteConversation(id);
    setConversationToDelete(undefined);
    if (wasActive) {
      const next = useAppStore.getState().conversations[0];
      setView(
        next?.messages.some((message) => message.role === "user")
          ? "conversation"
          : "home"
      );
      setInput("");
      setStages([]);
      setPhotoNotice("");
    }
  }

  function openConversation(id: string) {
    const selected = conversations.find((conversation) => conversation.id === id);
    setActiveConversation(id);
    setView(
      selected?.messages.some((message) => message.role === "user")
        ? "conversation"
        : "home"
    );
    setInput("");
    setPhotoNotice("");
    setComposerSkill(undefined);
    requestAnimationFrame(() => {
      if (messagesRef.current) messagesRef.current.scrollTop = 0;
      setShowScrollToBottom(false);
    });
    if (window.innerWidth < 900) setSidebarOpen(false);
  }

  function scrollToConversationBottom() {
    const container = messagesRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth"
    });
    setShowScrollToBottom(false);
  }

  const recentMessages = messages.slice(-5);
  const olderMessages = messages.slice(0, -5);
  const orderedConversations = [...conversations].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  );
  const selectedSkill = composerSkills.find(
    (skill) => skill.id === composerSkill
  );
  const answerModeLabel =
    answerMode === "quick"
      ? "快速回答"
      : answerMode === "detailed"
        ? "详细解释"
        : "安全问药";

  async function copyMessage(text: string, messageId: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(""), 1500);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(""), 1500);
    }
  }

  async function toggleSpeakMessage(messageId: string, text: string) {
    if (speakingMessageId === messageId) {
      stopSpeaking();
      setSpeakingMessageId("");
      return;
    }
    stopSpeaking();
    setSpeakingMessageId(messageId);
    try {
      await speakText(text);
    } finally {
      setSpeakingMessageId("");
    }
  }

  function stopGeneration() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }

  function regenerateMessage(messageId: string) {
    // 找到该 AI 消息前面的最近一条用户消息
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx < 0) return;
    let userMsg: ChatMessage | undefined;
    for (let i = idx - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        userMsg = messages[i];
        break;
      }
    }
    // 删除从这条 AI 消息到最后（可能还有后续 AI 回复）
    const toDelete = messages.slice(idx).map((m) => m.id);
    toDelete.forEach((id) => deleteChatMessage(id, activeConversationId));
    if (userMsg) {
      void submitQuestion(userMsg.content, true);
    }
  }

  function renderMessage(message: ChatMessage) {
    const ts = formatMessageTime(message.createdAt);
    const isStreaming = Boolean(message.pending);
    const canRegenerate = message.role === "assistant" && !isStreaming;
    const canSpeak =
      (message.role === "assistant" || message.role === "user") &&
      Boolean(message.content) &&
      !isStreaming;
    const isSpeaking = speakingMessageId === message.id;
    const isCopied = copiedMessageId === message.id;

    return (
      <article
        className={`message ${message.role} ${isStreaming ? "streaming" : ""}`}
        key={message.id}
      >
        <div className="message-header">
          <div className="message-role">
            {message.role === "assistant" ? "智药有方" : "您"}
          </div>
        </div>
        {message.role === "assistant" && message.riskCheck ? (
          <div className="answer-search-meta">
            <Search size={15} aria-hidden="true" />
            核对 {message.riskCheck.medicationSnapshot.length} 种药物，参考{" "}
            {Math.max(1, message.riskCheck.sourceIds.length)} 份资料
            <ChevronRight size={14} aria-hidden="true" />
          </div>
        ) : null}
        <div className="message-bubble">
          {message.role === "assistant" ? (
            <>
              {message.content ? (
                <AssistantMarkdown content={message.content} />
              ) : isStreaming ? (
                <span className="streaming-placeholder">正在生成回答…</span>
              ) : null}
              {isStreaming && message.content ? (
                <span className="streaming-caret" aria-hidden="true" />
              ) : null}
            </>
          ) : (
            message.content
          )}
        </div>
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
          <MessageRisk riskCheck={message.riskCheck} />
        ) : null}
        {message.role === "assistant" &&
        message.riskCheck &&
        !isStreaming ? (
          <div className="answer-followups">
            <button
              type="button"
              onClick={() => void submitQuestion("请继续说明这个药怎么吃，以及有哪些注意事项")}
            >
              继续问怎么吃
              <ChevronRight size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => void submitQuestion("请核对我现在吃的药有没有重复成分或相互作用")}
            >
              核对我现在的药
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          </div>
        ) : null}
        {!isStreaming ? (
          <div className="message-actions">
            {message.content ? (
              <button
                type="button"
                className="msg-action-btn"
                title={isCopied ? "已复制" : "复制内容"}
                onClick={() => void copyMessage(message.content, message.id)}
              >
                <Copy size={14} aria-hidden="true" />
                {isCopied ? "已复制" : "复制"}
              </button>
            ) : null}
            {canSpeak ? (
              <button
                type="button"
                className={`msg-action-btn ${isSpeaking ? "active" : ""}`}
                title={isSpeaking ? "停止朗读" : "朗读内容"}
                onClick={() =>
                  void toggleSpeakMessage(message.id, message.content)
                }
              >
                {isSpeaking ? (
                  <>
                    <Square size={14} aria-hidden="true" />
                    停止
                  </>
                ) : (
                  <>
                    <Volume2 size={14} aria-hidden="true" />
                    朗读
                  </>
                )}
              </button>
            ) : null}
            {canRegenerate ? (
              <button
                type="button"
                className="msg-action-btn"
                title="重新生成回答"
                onClick={() => regenerateMessage(message.id)}
              >
                <RotateCcw size={14} aria-hidden="true" />
                重新生成
              </button>
            ) : null}
            <button
              type="button"
              className="msg-action-btn danger"
              title="删除此条消息"
              onClick={() => {
                if (confirm("确定删除这条消息吗？")) {
                  deleteChatMessage(message.id, activeConversationId);
                }
              }}
            >
              <Trash2 size={14} aria-hidden="true" />
              删除
            </button>
          </div>
        ) : null}
        {ts ? (
          <div className={`message-footer ${message.role}`}>
            <div className="message-timestamp">{ts}</div>
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <div className="page chat-page">
      <section className="chat-unified-shell">
        <header className="ai-chat-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              className="icon-btn ai-sidebar-toggle"
              aria-label={sidebarOpen ? "收起对话记录" : "展开对话记录"}
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen((value) => !value)}
            >
              {sidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
            </button>
            <div className="ai-chat-brand">
              <span className="ai-chat-mark">
                <Sparkles size={21} aria-hidden="true" />
              </span>
              <span>
                <strong>智药有方</strong>
                <small>识药问药 · 家庭用药 AI</small>
              </span>
            </div>
          </div>
          <div className="ai-chat-header-actions">
            <span className="chip">
              <ShieldCheck size={15} aria-hidden="true" />
              已核对 {medications.filter((item) => item.status === "active").length} 种当前药物
            </span>
            <button
              className="icon-btn"
              type="button"
              aria-label={profile.voiceEnabled ? "停止自动播报" : "开启自动播报"}
              title={profile.voiceEnabled ? "停止自动播报" : "开启自动播报"}
              onClick={() => {
                const next = !profile.voiceEnabled;
                updateProfile({ voiceEnabled: next });
                if (!next) stopSpeaking();
              }}
            >
              {profile.voiceEnabled ? (
                <Volume2 size={20} aria-hidden="true" />
              ) : (
                <VolumeX size={20} aria-hidden="true" />
              )}
            </button>
            <button
              className="icon-btn"
              type="button"
              aria-label={preferences.remindersEnabled ? "关闭吃药提醒" : "开启吃药提醒"}
              title={preferences.remindersEnabled ? "关闭吃药提醒" : "开启吃药提醒"}
              onClick={toggleReminders}
            >
              {preferences.remindersEnabled ? (
                <BellRing size={20} aria-hidden="true" />
              ) : (
                <BellOff size={20} aria-hidden="true" />
              )}
            </button>
          </div>
        </header>

        {reminderNotice ? (
          <div
            className="notice chat-unified-notice"
            role="status"
            style={{ margin: "8px 16px 0" }}
          >
            <BellRing size={16} aria-hidden="true" />
            {reminderNotice}
          </div>
        ) : null}

        <div
          className={`ai-chat-content ${sidebarOpen ? "sidebar-open" : ""} ${isResizing ? "is-resizing" : ""}`}
          style={{
            "--sidebar-width": `${sidebarWidth}px`
          } as React.CSSProperties}
        >
          <aside className="ai-conversation-sidebar" aria-label="历史对话记录">
            <div className="ai-sidebar-heading">
              <div>
                <strong>对话记录</strong>
                <small>{conversations.length} 个对话</small>
              </div>
              <button className="icon-btn" type="button" aria-label="新建对话" onClick={startNewConversation}>
                <Plus size={20} />
              </button>
            </div>
            <div className="ai-conversation-list">
              {orderedConversations.map((conversation) => (
                <div
                  className={`ai-conversation-item ${
                    conversation.id === activeConversationId ? "active" : ""
                  }`}
                  key={conversation.id}
                >
                  <button
                    type="button"
                    className="ai-conversation-open"
                    onClick={() => openConversation(conversation.id)}
                  >
                    <MessageSquareText size={17} aria-hidden="true" />
                    <span>
                      <strong>{conversation.title}</strong>
                      <small>
                        {new Date(conversation.updatedAt).toLocaleString(
                          "zh-CN",
                          {
                            month: "numeric",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit"
                          }
                        )}
                      </small>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="ai-conversation-delete"
                    aria-label={`删除对话：${conversation.title}`}
                    title="删除对话"
                    onClick={() =>
                      removeConversation(conversation.id, conversation.title)
                    }
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </aside>

          <div
            className={`ai-sidebar-resizer ${isResizing ? "active" : ""}`}
            role="separator"
            aria-orientation="vertical"
            aria-label="拖拽调整对话记录宽度"
            onMouseDown={(event) => {
              event.preventDefault();
              resizeStartRef.current = {
                mouseX: event.clientX,
                width: latestSidebarWidth.current
              };
              setIsResizing(true);
            }}
          />

          <div className="ai-chat-main">
        {searchParams.get("concern") === "1" ? (
          <div className="notice warm chat-unified-notice">
            <ShieldCheck size={20} aria-hidden="true" />
            已记录您不舒服，并尝试把求助摘要发送给已授权家属。如果症状紧急，请直接拨打 120。
          </div>
        ) : null}

        <div className={`ai-chat-stage ${view === "home" ? "is-home" : "is-conversation"}`}>
          {view === "home" ? (
            <>
              <section className="ai-chat-welcome">
                <span className="ai-chat-welcome-icon">
                  <Sparkles size={30} aria-hidden="true" />
                </span>
                <h1>有什么用药问题，直接问我</h1>
              </section>
              <section className="ai-recommendations" aria-label="为你推荐">
                <p>为你推荐</p>
                {messages.length > 1 ? (
                  <button
                    type="button"
                    className="ai-recommendation"
                    onClick={() => setView("conversation")}
                  >
                    <MessageCircleHeart size={20} aria-hidden="true" />
                    继续上一次用药对话
                  </button>
                ) : null}
                {sampleQuestions.slice(0, 2).map((question) => (
                  <button
                    type="button"
                    className="ai-recommendation"
                    key={question}
                    onClick={() => void submitQuestion(question)}
                  >
                    <MessageCircleHeart size={20} aria-hidden="true" />
                    {question}
                  </button>
                ))}
              </section>
            </>
          ) : (
            <>
              <div className="ai-conversation-head">
                <strong>当前对话</strong>
                {stages.length ? (
                  <details className="chat-stage-details">
                    <summary>查看本次核对步骤</summary>
                    {stages.map((stage) => (
                      <div className={`agent-stage ${stage.status}`} key={stage.id}>
                        <span className="stage-dot" aria-hidden="true" />
                        {stage.label}
                      </div>
                    ))}
                  </details>
                ) : null}
              </div>
              {photoNotice ? (
                <div className="notice chat-unified-notice">
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
              <div
                className="chat-messages"
                aria-live="polite"
                ref={messagesRef}
                onScroll={updateScrollAvailability}
              >
                {olderMessages.length ? (
                  <details className="chat-history">
                    <summary>查看更早的 {olderMessages.length} 条对话</summary>
                    <div className="chat-history-list">
                      {olderMessages.map(renderMessage)}
                    </div>
                  </details>
                ) : null}
                {recentMessages.map(renderMessage)}
                {sending && !streamingMessageId ? (
                  <article className="message assistant">
                    <div className="message-role">智药有方</div>
                    <div className="message-bubble">
                      <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        <LoaderCircle size={20} className="spin" aria-hidden="true" />
                        {thinkingLabel}
                      </span>
                    </div>
                  </article>
                ) : null}
              </div>
              {showScrollToBottom ? (
                <button
                  type="button"
                  className="chat-scroll-bottom"
                  aria-label="直达回答底部"
                  title="直达底部"
                  onClick={scrollToConversationBottom}
                >
                  <ArrowDown size={22} aria-hidden="true" />
                </button>
              ) : null}
            </>
          )}
        </div>

        <div className="ai-composer-wrap">
          <div className="ai-composer">
            <div className="ai-search-field">
              <span className="sr-only">输入您想问的用药问题</span>
              <textarea
                rows={1}
                value={input}
                placeholder={
                  composerSkill
                    ? composerSkills.find((item) => item.id === composerSkill)
                        ?.placeholder
                    : "有什么用药问题，直接问我…"
                }
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void submitQuestion();
                  }
                }}
              />
            <div className="ai-composer-actions">
              <div className="ai-composer-leading">
                <button
                  className="ai-round-tool"
                  type="button"
                  aria-label="开始新对话"
                  title="新对话"
                  onClick={startNewConversation}
                >
                  <Plus size={21} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={`ai-mic-button ${speech.listening ? "listening" : ""}`}
                  aria-label="按住说话，松开结束"
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
                    <LoaderCircle size={20} className="spin" aria-hidden="true" />
                  ) : (
                    <Mic size={21} aria-hidden="true" />
                  )}
                </button>
              </div>

              <div className="ai-send-group">
                <div className="ai-skill-picker">
                  <button
                    className="ai-skill-trigger"
                    type="button"
                    aria-expanded={skillMenuOpen}
                    aria-haspopup="menu"
                    onClick={() => setSkillMenuOpen((value) => !value)}
                  >
                    <span>
                      <strong>{selectedSkill?.label || "智能问药"}</strong>
                      <small>{answerModeLabel}</small>
                    </span>
                    <ChevronDown size={17} aria-hidden="true" />
                  </button>
                  {skillMenuOpen ? (
                    <div className="ai-skill-menu" role="menu">
                      <p>技能</p>
                      <button
                        type="button"
                        className={!composerSkill ? "active" : ""}
                        onClick={() => {
                          setComposerSkill(undefined);
                          setSkillMenuOpen(false);
                        }}
                      >
                        <Sparkles size={18} aria-hidden="true" />
                        智能问药
                      </button>
                      {composerSkills.map((skill) => {
                        const Icon = skill.icon;
                        return (
                          <button
                            type="button"
                            className={
                              composerSkill === skill.id ? "active" : ""
                            }
                            key={skill.id}
                            onClick={() => {
                              setComposerSkill(skill.id);
                              setSkillMenuOpen(false);
                              if (skill.id === "photo") startCameraScan();
                            }}
                          >
                            <Icon size={18} aria-hidden="true" />
                            {skill.label}
                          </button>
                        );
                      })}
                      <span className="ai-skill-divider" />
                      <p>回答方式</p>
                      {(
                        [
                          ["safety", "安全问药"],
                          ["quick", "快速回答"],
                          ["detailed", "详细解释"]
                        ] as Array<[AnswerMode, string]>
                      ).map(([value, label]) => (
                        <button
                          type="button"
                          className={answerMode === value ? "active" : ""}
                          key={value}
                          onClick={() => {
                            setAnswerMode(value);
                            setSkillMenuOpen(false);
                          }}
                        >
                          <MessageCircleHeart size={18} aria-hidden="true" />
                          {label}
                        </button>
                      ))}
                      <span className="ai-skill-divider" />
                      <button
                        type="button"
                        className="research"
                        onClick={() => {
                          setSkillMenuOpen(false);
                          navigate(selectedSkill?.researchPath || "/catalog");
                        }}
                      >
                        <ExternalLink size={18} aria-hidden="true" />
                        {selectedSkill?.researchLabel || "深入研究药品"}
                      </button>
                    </div>
                  ) : null}
                </div>
                {speech.listening ? (
                  <button
                    className="ai-send-button stop"
                    type="button"
                    aria-label="结束语音"
                    onClick={speech.stop}
                  >
                    <Square size={18} aria-hidden="true" />
                  </button>
                ) : sending ? (
                  <button
                    className="ai-send-button stop"
                    type="button"
                    aria-label="停止生成"
                    title="停止生成"
                    onClick={stopGeneration}
                  >
                    <Square size={18} aria-hidden="true" />
                  </button>
                ) : (
                  <button
                    className="ai-send-button"
                    type="button"
                    aria-label="发送"
                    disabled={!input.trim()}
                    onClick={() => void submitQuestion()}
                  >
                    <Send size={20} aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
            </div>
            <div className={`ai-voice-status ${speech.error ? "error" : ""}`} aria-live="polite">
              {speech.error
                ? speech.error
                : speech.interim
                  ? `正在听：${speech.interim}`
                  : speech.listening
                    ? "正在聆听，松开后结束"
                    : ""}
            </div>
          </div>
        </div>
          </div>
        </div>
      </section>
      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(imageDataUrl) => {
          setCameraOpen(false);
          void scanMedicationImage(imageDataUrl);
        }}
      />
      {conversationToDelete ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setConversationToDelete(undefined)}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-conversation-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id="delete-conversation-title">删除这段对话？</h2>
            <p>
              “{conversationToDelete.title}”删除后不能恢复，其他对话和用药档案不会受影响。
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-danger"
                onClick={confirmDeleteConversation}
              >
                <Trash2 size={18} aria-hidden="true" />
                确认删除
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setConversationToDelete(undefined)}
              >
                取消
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function MessageRisk({
  riskCheck
}: {
  riskCheck: RiskCheck;
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
    </div>
  );
}
