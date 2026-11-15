import {
  BookOpenText,
  Camera,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  ExternalLink,
  LoaderCircle,
  Leaf,
  MessageCircleHeart,
  MessageSquareText,
  Mic,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
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
import {
  answerFromDrugCatalog,
  buildAutomaticMedicineReport,
  currentCatalogCompanionSlugs
} from "../catalog/chatBridge";
import { findBestMedicine } from "../catalog/retrieval";
import { buildLocalGuidance } from "../catalog/guidance";
import { searchHerbs } from "../catalog/herbs";
import { speakText } from "../lib/speech";
import { useQwenSpeechRecognition } from "../lib/qwenSpeech";
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

type ComposerSkill = "photo" | "catalog" | "herbs" | "multi-drug";

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
  const familyCode = useAppStore((state) => state.familyCode);
  const addFamilyAlert = useAppStore((state) => state.addFamilyAlert);
  const addChatMessage = useAppStore((state) => state.addChatMessage);
  const saveIntakeDraft = useAppStore((state) => state.saveIntakeDraft);
  const createConversation = useAppStore((state) => state.createConversation);
  const deleteConversation = useAppStore((state) => state.deleteConversation);
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
  const [cameraOpen, setCameraOpen] = useState(false);
  const [view, setView] = useState<"home" | "conversation">(
    searchParams.get("q") ? "conversation" : "home"
  );
  const [composerSkill, setComposerSkill] = useState<ComposerSkill>();
  const [thinkingLabel, setThinkingLabel] = useState("正在思考并组织回答…");
  const [conversationToDelete, setConversationToDelete] = useState<{
    id: string;
    title: string;
  }>();
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth >= 900
  );
  const messagesRef = useRef<HTMLDivElement>(null);
  const initialQueryHandled = useRef(false);
  const autoScrollRef = useRef(false);

  const speech = useQwenSpeechRecognition((transcript) => {
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
      createConversation();
      void submitQuestion(initialQuery, false);
    }
  }, [searchParams, location.key]);

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
    setThinkingLabel(
      needsMedicationReview(clean, composerSkill)
        ? "正在核对用药安全、当前药物和资料来源…"
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
    let localResponse = answerWithRules(
      contextualQuestion,
      activeMedications,
      profile
    );
    if (composerSkill === "herbs") {
      localResponse =
        herbSkillAnswer(
          contextualQuestion,
          profile,
          activeMedications.map((medication) => medication.name)
        ) ?? localResponse;
    }
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
    if (
      localResponse.riskCheck.level === "low" ||
      localResponse.riskCheck.level === "medium" ||
      localResponse.riskCheck.level === "unknown"
    ) {
      try {
        const aiResponse = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
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
    }, targetConversationId);
    speakText(
      `${response.message}。${response.riskCheck.nextStep}`,
      profile.voiceEnabled && preferences.soundEnabled,
      preferences.voiceMode
    );
    setStages(
      response.stages.map((stage) => ({ ...stage, status: "done" }))
    );
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
      const bestCatalogMatch = draft.name ? findBestMedicine(draft.name) : null;
      const catalogMatch =
        bestCatalogMatch && bestCatalogMatch.score >= 0.6
          ? bestCatalogMatch.medicine
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
      setConversationMedicineContext(draft, targetConversationId);
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
      const activeMedications = medications.filter(
        (medication) => medication.status === "active"
      );
      const catalogResponse = catalogMatch
        ? answerFromDrugCatalog(
            `${catalogMatch.displayName} 请给出使用方法、危害、注意事项和当前同服风险`,
            profile,
            activeMedications.map((medication) => medication.name),
            currentCatalogCompanionSlugs(
              activeMedications.map(
                (medication) =>
                  medication.genericName || medication.name
              )
            )
          )
        : null;
      const catalogGuidance = catalogMatch
        ? buildLocalGuidance({
            medicineSlug: catalogMatch.slug,
            companionSlugs: currentCatalogCompanionSlugs(
              activeMedications.map(
                (medication) =>
                  medication.genericName || medication.name
              )
            ),
            healthContext: [
              ...(profile.age >= 65 ? (["older"] as const) : []),
              ...(profile.conditions.some((item) => /肾/.test(item))
                ? (["kidney"] as const)
                : []),
              ...(profile.conditions.some((item) => /肝/.test(item))
                ? (["liver"] as const)
                : [])
            ]
          })
        : null;
      const unknownCheck = checkNewMedication(candidate, medications, profile);
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
        (["high", "medium", "emergency"].includes(preliminaryCheck.level)
          ? {
              ...preliminaryCheck,
              title: `初步发现：${preliminaryCheck.title}`,
              summary: `${preliminaryCheck.summary} 目前基于图像提取的识别字段。`
            }
          : unknownCheck);
      const priceText =
        draft.price || "暂无可靠价格数据，请以药房价格或购买记录为准";
      const content = catalogMatch && catalogGuidance
        ? [
            buildAutomaticMedicineReport(catalogMatch, catalogGuidance),
            "",
            `图片参考价格：${priceText}`,
            vision?.summary ? `AI 图片摘要：${vision.summary}` : "",
            ...(vision?.cautions || []).map((item) => `AI 提示：${item}`),
            learned ? `已复用您上次确认的“${learned.name}”资料。` : ""
          ]
            .filter(Boolean)
            .join("\n")
        : [
            `识别结果：${draft.name || "药名暂未识别"}`,
            `识别可信度：${Math.round(draft.confidence * 100)}%`,
            draft.ingredientsText
              ? `主要成分：${draft.ingredientsText}`
              : "",
            draft.dosage ? `图片中剂量：${draft.dosage}` : "",
            draft.frequency ? `图片中次数：${draft.frequency}` : "",
            draft.relation ? `图片中服用时间：${draft.relation}` : "",
            `参考价格：${priceText}`,
            vision?.summary ? `AI 图片摘要：${vision.summary}` : "",
            ...(vision?.cautions || []).map((item) => `AI 提示：${item}`),
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
        catalogMatch
          ? `AI 已识别“${catalogMatch.displayName}”，并自动结合使用说明、危害、注意事项和当前用药给出完整参考。`
          : `${draft.name || "药品"}已完成图像分析；名称不够确定时建议补拍说明书正面。`
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
    if (window.innerWidth < 900) setSidebarOpen(false);
  }

  const recentMessages = messages.slice(-5);
  const olderMessages = messages.slice(0, -5);
  const orderedConversations = [...conversations].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  );

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
            voiceMode={preferences.voiceMode}
          />
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
            <button className="btn" type="button" onClick={startNewConversation}>
              <Plus size={18} aria-hidden="true" />
              新对话
            </button>
          </div>
        </header>

        <div className={`ai-chat-content ${sidebarOpen ? "sidebar-open" : ""}`}>
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
                        {thinkingLabel}
                      </span>
                    </div>
                  </article>
                ) : null}
              </div>
              <div className="chat-suggestions">
                {sampleQuestions.slice(0, 3).map((question) => (
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
            </>
          )}
        </div>

        <div className="ai-composer-wrap">
          <div className="ai-composer">
            <label className="ai-search-field">
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
            </label>
            <div className="ai-composer-actions">
              <div className="ai-tool-group">
                <button className="ai-tool-button new-chat" type="button" onClick={startNewConversation}>
                  <Plus size={21} aria-hidden="true" />
                  <span>新对话</span>
                </button>
                {composerSkills.map((skill) => {
                  const Icon = skill.icon;
                  return (
                    <button
                      className={`ai-tool-button ${
                        composerSkill === skill.id ? "active" : ""
                      }`}
                      type="button"
                      aria-pressed={composerSkill === skill.id}
                      key={skill.id}
                      onClick={() => {
                        if (skill.id === "photo") {
                          setComposerSkill("photo");
                          startCameraScan();
                          return;
                        }
                        setComposerSkill((current) =>
                          current === skill.id ? undefined : skill.id
                        );
                      }}
                    >
                      <Icon size={21} aria-hidden="true" />
                      <span>
                        {skill.id === "photo" && photoBusy
                          ? photoProgress || "识药中"
                          : skill.label}
                      </span>
                    </button>
                  );
                })}
              </div>
              <span className="ai-composer-spacer" />
              <div className="ai-send-group">
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
                  <LoaderCircle size={21} className="spin" aria-hidden="true" />
                ) : (
                  <Mic size={23} aria-hidden="true" />
                )}
                </button>
                {speech.listening ? (
                  <button
                    className="ai-send-button stop"
                    type="button"
                    aria-label="结束语音"
                    onClick={speech.stop}
                  >
                    <Square size={18} aria-hidden="true" />
                  </button>
                ) : (
                  <button
                    className="ai-send-button"
                    type="button"
                    aria-label="发送"
                    disabled={sending || !input.trim()}
                    onClick={() => void submitQuestion()}
                  >
                    <Send size={20} aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
            {composerSkill ? (
              <div className="ai-active-skill">
                <span>
                  当前技能：
                  <strong>
                    {composerSkills.find((item) => item.id === composerSkill)?.label}
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      composerSkills.find((item) => item.id === composerSkill)
                        ?.researchPath || "/chat"
                    )
                  }
                >
                  {composerSkills.find((item) => item.id === composerSkill)
                    ?.researchLabel || "深度研究"}
                  <ExternalLink size={14} aria-hidden="true" />
                </button>
              </div>
            ) : null}
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
  riskCheck,
  soundEnabled,
  voiceMode
}: {
  riskCheck: RiskCheck;
  soundEnabled: boolean;
  voiceMode: "warm" | "clear";
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
          speakText(
            `${riskCheck.summary}。${riskCheck.nextStep}`,
            true,
            voiceMode
          )
        }
      >
        <Volume2 size={18} aria-hidden="true" />
        {soundEnabled ? "朗读检查结果" : "语音朗读已关闭"}
      </button>
    </div>
  );
}
