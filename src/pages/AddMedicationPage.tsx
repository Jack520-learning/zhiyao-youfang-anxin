import {
  ArrowLeft,
  Camera,
  Check,
  Clock3,
  FileImage,
  ImagePlus,
  LoaderCircle,
  Save,
  ShieldAlert,
  Sparkles
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { RiskBadge } from "../components/RiskBadge";
import { SourcesBlock } from "../components/SourcesBlock";
import { CameraCaptureModal } from "../components/CameraCaptureModal";
import { DosageFormSafetyNotice } from "../components/DosageFormSafetyNotice";
import {
  createManualDraft,
  hasMedicineTextEvidence,
  recognizeMedicineImage
} from "../lib/ocr";
import { fileToCompressedDataUrl } from "../lib/image";
import { createId } from "../lib/ids";
import { requestDoseSuggestion } from "../lib/doseAutofill";
import { checkNewMedication } from "../lib/riskEngine";
import {
  frequencyOptions,
  applyFrequencySelection,
  isAsNeededFrequency,
  splitDosageText,
  validateDosageText,
  validateTimes
} from "../lib/dosage";
import { dateKey, nowIso } from "../lib/time";
import {
  buildDraftsFromVision,
  getVisionMedicineNames,
  hasMedicineEvidence,
  requestVisionIdentification
} from "../lib/vision";
import { useAppStore } from "../store/useAppStore";
import type { IntakeDraft, Medication, RiskCheck } from "../types";

type Phase = "upload" | "recognizing" | "unrecognized" | "review" | "result";

interface AddMedicationPageProps {
  embedded?: boolean;
  captureOnOpen?: boolean;
  manualOnOpen?: boolean;
  onExit?: () => void;
}

export function resolveIntakeEntryPhase({
  manualMode,
  captureMode,
  reviewMode,
  hasDraft
}: {
  manualMode: boolean;
  captureMode: boolean;
  reviewMode: boolean;
  hasDraft: boolean;
}): Phase {
  if (manualMode) return "review";
  if (captureMode) return "upload";
  if (reviewMode || hasDraft) return "review";
  return "upload";
}

function splitIngredients(value: string): string[] {
  return value
    .split(/[、,，/\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function AddMedicationPage({
  embedded = false,
  captureOnOpen = false,
  manualOnOpen = false,
  onExit
}: AddMedicationPageProps = {}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const manualMode = manualOnOpen || searchParams.get("mode") === "manual";
  const captureMode =
    captureOnOpen || searchParams.get("capture") === "1";
  const reviewMode = searchParams.get("review") === "1";
  const origin = searchParams.get("from");
  const backPath = origin === "chat" ? "/chat" : origin === "today" ? "/today" : "/medications";
  const backLabel = origin === "chat" ? "返回问药识药" : origin === "today" ? "返回今日" : "返回用药清单";
  const exitPage = () => {
    if (onExit) onExit();
    else navigate(backPath);
  };
  const existingDraft = useAppStore((state) => state.intakeDraft);
  const profile = useAppStore((state) => state.profile);
  const medications = useAppStore((state) => state.medications);
  const saveIntakeDraft = useAppStore((state) => state.saveIntakeDraft);
  const addMedication = useAppStore((state) => state.addMedication);
  const initialDraft: IntakeDraft | undefined =
    manualMode
      ? createManualDraft()
      : captureMode
        ? undefined
        : existingDraft ?? (reviewMode ? createManualDraft() : undefined);
  const [phase, setPhase] = useState<Phase>(() =>
    resolveIntakeEntryPhase({
      manualMode,
      captureMode,
      reviewMode,
      hasDraft: Boolean(initialDraft)
    })
  );
  const [draft, setDraft] = useState<IntakeDraft | undefined>(initialDraft);
  const [detectedDrafts, setDetectedDrafts] = useState<IntakeDraft[]>(
    initialDraft ? [initialDraft] : []
  );
  const [activeDraftIndex, setActiveDraftIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [autoFillStatus, setAutoFillStatus] = useState("");
  const [riskCheck, setRiskCheck] = useState<RiskCheck>();
  const [candidateMedication, setCandidateMedication] = useState<Medication>();
  const [cameraOpen, setCameraOpen] = useState(false);
  const initialCameraOpened = useRef(false);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const progressTickerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!captureMode || initialCameraOpened.current) return;
    initialCameraOpened.current = true;
    setCameraOpen(true);
  }, [captureMode]);

  useEffect(() => {
    if (!draft || phase !== "review") return;
    const timer = window.setTimeout(() => saveIntakeDraft(draft), 250);
    return () => window.clearTimeout(timer);
  }, [draft, phase, saveIntakeDraft]);

  useEffect(
    () => () => {
      if (progressTickerRef.current) {
        window.clearInterval(progressTickerRef.current);
      }
    },
    []
  );

  async function autoFillMissingDoses(drafts: IntakeDraft[]) {
    const candidates = drafts
      .filter((item) => !item.dosage.trim())
      .slice(0, 3);
    if (!candidates.length) {
      setAutoFillStatus("");
      return;
    }
    setAutoFillStatus("正在自动补充每次实际服用剂量…");
    let filledCount = 0;
    await Promise.all(
      candidates.map(async (item) => {
        try {
          const suggestion = await requestDoseSuggestion({
            name: item.name,
            instructionText: `${item.rawText}\n${item.instructions}`,
            strength: item.strength || "",
            packageSpec: item.packageSpec || ""
          });
          if (!suggestion) return;
          const patch: Partial<IntakeDraft> = {
            dosage: suggestion.dosage,
            strength: item.strength || suggestion.strength,
            packageSpec: item.packageSpec || suggestion.packageSpec,
            dosageSource: "ai",
            dosageBasis: suggestion.basis,
            confidence: Math.max(item.confidence, suggestion.confidence)
          };
          filledCount += 1;
          setDetectedDrafts((current) =>
            current.map((entry) =>
              entry.name === item.name && !entry.dosage.trim()
                ? { ...entry, ...patch }
                : entry
            )
          );
          setDraft((current) =>
            current?.name === item.name && !current.dosage.trim()
              ? { ...current, ...patch }
              : current
          );
          setError(
            `已自动补充“${item.name}”的每次实际服用剂量，请核对后再保存。`
          );
        } catch {
          // Keep the field editable when automatic completion is unavailable.
        }
      })
    );
    setAutoFillStatus(
      filledCount
        ? `已自动补充 ${filledCount} 项剂量，请逐项核对。`
        : "暂未找到可靠的自动剂量，请根据处方或说明书手动填写。"
    );
  }

  async function processImage(dataUrl: string) {
    setPhase("recognizing");
    setProgress(0.03);
    setProgressLabel("正在保存原图");
    setError("");
    if (progressTickerRef.current) {
      window.clearInterval(progressTickerRef.current);
    }
    progressTickerRef.current = window.setInterval(() => {
      setProgress((current) =>
        Math.min(0.985, current + (0.985 - current) * 0.08 + 0.0015)
      );
    }, 120);
    let visionError = "";
    try {
      const visionPromise = requestVisionIdentification(
        dataUrl,
        "medicine",
        50000
      ).catch((error) => {
        visionError =
          error instanceof Error ? error.message : "智能识图暂不可用";
        return null;
      });

      let recognized: IntakeDraft;
      try {
        recognized = await recognizeMedicineImage(
          dataUrl,
          (value, label) => {
            setProgress((current) =>
              Math.max(current, Math.min(0.55, value * 0.55))
            );
            setProgressLabel(label);
          }
        );
      } catch {
        recognized = createManualDraft(dataUrl);
      }
      setProgress((current) => Math.max(current, 0.58));
      setProgressLabel(
        "正在交叉核对图片药名、规格、单次剂量和包装信息"
      );
      const vision = await visionPromise;
      const visionMedicineNames = getVisionMedicineNames(vision);
      const medicalText = `${recognized.rawText} ${
        vision?.summary || ""
      } ${visionMedicineNames.join(" ")}`;
      const hasMedicineSignal =
        hasMedicineEvidence(vision, recognized.rawText) ||
        hasMedicineTextEvidence(`${medicalText} ${recognized.name}`);
      if (!hasMedicineSignal) {
        const unrecognized = createManualDraft(dataUrl);
        setDraft(unrecognized);
        setDetectedDrafts([unrecognized]);
        setActiveDraftIndex(0);
        saveIntakeDraft(unrecognized);
        setError(
          vision?.rejectionReason ||
            visionError ||
            "未识别到药物或与药物相关的包装、说明书。请重新拍照，或从相册选择清晰的药盒照片。"
        );
        setPhase("unrecognized");
        return;
      }
      const nextDrafts = buildDraftsFromVision(
        dataUrl,
        recognized,
        vision
      );
      setDetectedDrafts(nextDrafts);
      setActiveDraftIndex(0);
      setDraft(nextDrafts[0]);
      saveIntakeDraft(nextDrafts[0]);
      setProgress(1);
      setProgressLabel(
        `识别完成，共找到 ${nextDrafts.length} 种药物，请逐项核对`
      );
      if (vision?.summary || vision?.cautions?.length || visionError) {
        setError(
          [
            vision?.summary,
            ...(vision?.cautions || []).map((item) => `注意：${item}`),
            visionError
              ? `智能识图补充信息暂未返回，已使用本地文字识别和药品目录交叉纠正：${visionError}`
              : ""
          ]
            .filter(Boolean)
            .join("；")
        );
      }
      setPhase("review");
      void autoFillMissingDoses(nextDrafts);
    } catch (recognitionError) {
      console.error(recognitionError);
      const manual = createManualDraft(dataUrl);
      setDraft(manual);
      setDetectedDrafts([manual]);
      setActiveDraftIndex(0);
      saveIntakeDraft(manual);
      setError(
        "识别暂时没有完成。原图已经保存，请直接核对并填写药名、剂量和用法。"
      );
      setPhase("review");
    } finally {
      if (progressTickerRef.current) {
        window.clearInterval(progressTickerRef.current);
        progressTickerRef.current = undefined;
      }
    }
  }

  async function onFileChange(file: File | undefined) {
    if (!file) return;
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      await processImage(dataUrl);
    } catch {
      setError("图片读取失败，请重新拍照或换一张清楚的照片。");
      setPhase("upload");
    }
  }

  function updateField<K extends keyof IntakeDraft>(field: K, value: IntakeDraft[K]) {
    if (!draft) return;
    const nextDraft = {
      ...draft,
      [field]: value,
      ...(field === "dosage"
        ? { dosageSource: undefined, dosageBasis: undefined }
        : {}),
      lowConfidenceFields: draft.lowConfidenceFields.filter(
        (item) => item !== String(field)
      )
    };
    setDraft(nextDraft);
    setFormError("");
    setDetectedDrafts((current) =>
      current.length
        ? current.map((item, index) =>
            index === activeDraftIndex ? nextDraft : item
          )
        : [nextDraft]
    );
  }

  function updateFields(fields: Partial<IntakeDraft>) {
    if (!draft) return;
    const changedFieldNames = new Set(Object.keys(fields));
    const nextDraft = {
      ...draft,
      ...fields,
      ...("dosage" in fields
        ? { dosageSource: undefined, dosageBasis: undefined }
        : {}),
      lowConfidenceFields: draft.lowConfidenceFields.filter(
        (item) => !changedFieldNames.has(item)
      )
    };
    setDraft(nextDraft);
    setFormError("");
    setDetectedDrafts((current) =>
      current.length
        ? current.map((item, index) =>
            index === activeDraftIndex ? nextDraft : item
          )
        : [nextDraft]
    );
  }

  function selectDetectedDraft(index: number) {
    const selected = detectedDrafts[index];
    if (!selected) return;
    setActiveDraftIndex(index);
    setDraft(selected);
    saveIntakeDraft(selected);
    setRiskCheck(undefined);
    setCandidateMedication(undefined);
    setPhase("review");
  }

  function startManualEntry() {
    const manual = createManualDraft();
    setDraft(manual);
    setDetectedDrafts([manual]);
    setActiveDraftIndex(0);
    setError("");
    setPhase("review");
  }

  function confirmRecognition() {
    if (!draft) return;
    if (!draft.name.trim()) {
      setFormError("请先填写药名");
      return;
    }
    if (!draft.dosage.trim()) {
      setFormError(
        "请填写每次实际服用剂量，例如 1片、0.5mg 或 10ml；包装数量不能代替单次剂量"
      );
      return;
    }
    const dosageValidation = validateDosageText(draft.dosage);
    if (!dosageValidation.valid) {
      setFormError(dosageValidation.message || "剂量填写不正确");
      return;
    }
    if (!draft.frequency.trim()) {
      setFormError("请选择每天服用次数");
      return;
    }
    if (!draft.relation.trim()) {
      setFormError("请选择饭前、饭后，或“说明书未注明”");
      return;
    }
    const asNeeded = isAsNeededFrequency(draft.frequency);
    if (!asNeeded) {
      const timeValidation = validateTimes(draft.times);
      if (!timeValidation.valid) {
        setFormError(timeValidation.message || "请检查每天用药时间");
        return;
      }
    }
    setFormError("");
    const createdAt = nowIso();
    const candidate: Medication = {
      id: createId("med"),
      name: draft.name.trim(),
      genericName: draft.genericName.trim(),
      ingredients: splitIngredients(draft.ingredientsText || draft.genericName || draft.name),
      dosage: draft.dosage.trim(),
      strength: draft.strength?.trim(),
      packageSpec: draft.packageSpec?.trim(),
      dosageSource: draft.dosageSource,
      dosageBasis: draft.dosageBasis,
      frequency: draft.frequency.trim(),
      times: isAsNeededFrequency(draft.frequency)
        ? []
        : draft.times.length
          ? draft.times
          : ["08:00"],
      relation: draft.relation.trim(),
      instructions: draft.instructions.trim(),
      price: draft.price?.trim(),
      startDate: dateKey(),
      status: "pending",
      reminderEnabled: !isAsNeededFrequency(draft.frequency),
      source: {
        type: draft.imageDataUrl ? "medicine-label" : "professional-note",
        title: draft.imageDataUrl ? "用户拍摄并确认的药盒/说明书" : "用户手动录入",
        capturedAt: createdAt,
        imageDataUrl: draft.imageDataUrl,
        confirmed: true
      },
      confidence: Math.max(draft.confidence, 0.8),
      createdAt,
      updatedAt: createdAt
    };
    setCandidateMedication(candidate);
    setRiskCheck(checkNewMedication(candidate, medications, profile));
    setDraft((current) =>
      current
        ? {
            ...current,
            rawText: `${current.rawText}\n\n人工确认时间：${createdAt}`
          }
        : current
    );
    setPhase("result");
  }

  function saveToMedicationList(destination: "detail" | "chat" = "detail") {
    if (!draft || !riskCheck || !candidateMedication) return;
    const createdAt = nowIso();
    const medication: Medication = {
      ...candidateMedication,
      id: candidateMedication.id,
      name: draft.name.trim(),
      genericName: draft.genericName.trim(),
      ingredients: splitIngredients(draft.ingredientsText || draft.genericName || draft.name),
      dosage: draft.dosage.trim(),
      strength: draft.strength?.trim(),
      packageSpec: draft.packageSpec?.trim(),
      dosageSource: draft.dosageSource,
      dosageBasis: draft.dosageBasis,
      frequency: draft.frequency.trim(),
      times: isAsNeededFrequency(draft.frequency)
        ? []
        : draft.times.length
          ? draft.times
          : ["08:00"],
      relation: draft.relation.trim(),
      instructions: draft.instructions.trim(),
      price: draft.price?.trim(),
      startDate: dateKey(),
      status:
        riskCheck.level === "high" || riskCheck.level === "emergency"
          ? "pending"
          : "active",
      reminderEnabled: !isAsNeededFrequency(draft.frequency),
      source: {
        type: draft.imageDataUrl ? "medicine-label" : "professional-note",
        title: draft.imageDataUrl ? "用户拍摄并确认的药盒/说明书" : "用户手动录入",
        capturedAt: createdAt,
        imageDataUrl: draft.imageDataUrl,
        confirmed: true
      },
      confidence: Math.max(draft.confidence, 0.8),
      createdAt,
      updatedAt: createdAt
    };
    addMedication(medication, riskCheck);
    if (detectedDrafts.length > 1) {
      const remainingDrafts = detectedDrafts.filter(
        (_item, index) => index !== activeDraftIndex
      );
      if (remainingDrafts.length) {
        setDetectedDrafts(remainingDrafts);
        setActiveDraftIndex(0);
        setDraft(remainingDrafts[0]);
        saveIntakeDraft(remainingDrafts[0]);
        setRiskCheck(undefined);
        setCandidateMedication(undefined);
        setError(
          `“${draft.name}”已加入用药清单。还有 ${remainingDrafts.length} 种药物需要核对。`
        );
        setPhase("review");
        return;
      }
    }
    if (destination === "chat") {
      navigate(
        `/chat?q=${encodeURIComponent(
          `${draft.name}怎么吃，和现在的药一起用要注意什么`
        )}`
      );
    } else if (embedded) {
      onExit?.();
    } else {
      navigate(`/medications/${medication.id}`);
    }
  }

  return (
    <div className={embedded ? "embedded-add-medication" : "page"}>
      <button type="button" className="btn btn-ghost" onClick={exitPage}>
        <ArrowLeft size={19} aria-hidden="true" />
        {backLabel}
      </button>
      <header className="page-header" style={{ marginTop: 16 }}>
        <div>
          <p className="eyebrow">
            {manualMode ? "输入药名加药" : "拍照加药"} · 先核对再入档
          </p>
          <h1 className="page-title">
            {phase === "upload"
              ? "把药盒拍给我看"
              : phase === "recognizing"
                ? "正在识别，请稍等"
                  : phase === "unrecognized"
                    ? "没有识别到药物"
                : phase === "review"
                  ? "请您核对这几项"
                  : "这次安全核查结果"}
          </h1>
          <p className="page-description">
            {phase === "upload"
              ? "拍药盒、说明书或处方单都可以。看不清的地方，我会请您重新确认。"
              : phase === "recognizing"
                ? "图片已经保存在本机。识别完成后，原图和字段都会保留。"
                  : phase === "unrecognized"
                    ? "这张照片不是药品，或药名没有拍清楚。"
                : phase === "review"
                  ? "低置信或空白的字段会标出来。确认前不会加入当前用药。"
                  : "系统已经对当前用药、过敏史和安全规则完成交叉核对。"}
          </p>
        </div>
      </header>

      {phase === "upload" ? (
        <section className="upload-zone">
          <div className="upload-content">
            <span className="upload-icon">
              <ImagePlus size={38} aria-hidden="true" />
            </span>
            <h2>拍清楚药名和剂量</h2>
            <p>
              照片只用于本地识别和您的家庭档案。无法识别时，可以进入手动填写。
            </p>
            <div className="header-actions" style={{ justifyContent: "center" }}>
              <button
                type="button"
                className="btn btn-primary btn-large"
                onClick={() => setCameraOpen(true)}
              >
                <Camera size={21} aria-hidden="true" />
                打开相机拍照
              </button>
              <button
                type="button"
                className="btn btn-large"
                onClick={() => libraryInputRef.current?.click()}
              >
                <FileImage size={21} aria-hidden="true" />
                从相册选图
              </button>
              <button
                type="button"
                className="btn btn-large"
                onClick={startManualEntry}
              >
                手动输入药名
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {phase === "recognizing" ? (
        <section className="card card-pad" style={{ display: "grid", gap: 20 }}>
          <div className="notice">
            <LoaderCircle size={22} className="spin" aria-hidden="true" />
            正在同时进行文字识别和药物图像分析，请稍等。
          </div>
          <div>
            <div className="section-heading">
              <h2>{progressLabel || "准备识别"}</h2>
              <span>{Math.round(progress * 100)}%</span>
            </div>
            <div className="confidence-bar">
              <span style={{ width: `${Math.max(5, progress * 100)}%` }} />
            </div>
          </div>
          {draft?.imageDataUrl ? (
            <img className="preview-image" src={draft.imageDataUrl} alt="已保存的药盒原图" />
          ) : null}
        </section>
      ) : null}

      {phase === "unrecognized" ? (
        <section className="card card-pad unrecognized-medication">
          <span className="upload-icon">
            <ShieldAlert size={34} aria-hidden="true" />
          </span>
          <h2>未识别到药物</h2>
          <p>
            {error ||
              "请重新拍摄药盒正面、说明书或处方单，确保药名、规格和用法清晰可见。"}
          </p>
          <div className="header-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setCameraOpen(true)}
            >
              <Camera size={20} aria-hidden="true" />
              重新拍照识别
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => libraryInputRef.current?.click()}
            >
              <FileImage size={20} aria-hidden="true" />
              从相册重新选择
            </button>
            <button
              type="button"
              className="btn"
              onClick={startManualEntry}
            >
              手动输入药名
            </button>
          </div>
        </section>
      ) : null}

      {phase === "review" && draft ? (
        <div className="intake-layout">
          <aside className="card card-pad progress-panel">
            {draft.imageDataUrl ? (
              <img className="preview-image" src={draft.imageDataUrl} alt="药盒或说明书原图" />
            ) : (
              <div className="upload-icon" style={{ margin: "0 auto" }}>
                <FileImage size={34} aria-hidden="true" />
              </div>
            )}
            <div className="section-heading" style={{ marginTop: 18 }}>
              <div>
                <h2 style={{ fontSize: 18 }}>识别可信度</h2>
                <p>仍需人工确认</p>
              </div>
              <strong>{Math.round(draft.confidence * 100)}%</strong>
            </div>
            <div className="confidence-bar">
              <span style={{ width: `${Math.max(5, draft.confidence * 100)}%` }} />
            </div>
            <p className="field-hint" style={{ marginTop: 12 }}>
              原图和修改记录会保存在本地。刷新或重新打开后可以从这里继续。
            </p>
          </aside>
          <section className="card card-pad">
            {detectedDrafts.length > 1 ? (
              <div className="multi-recognition-picker">
                <div className="section-heading">
                  <div>
                    <h2>识别到 {detectedDrafts.length} 种药物</h2>
                    <p>请逐个核对，已核对的药物会依次加入用药清单。</p>
                  </div>
                  <span className="chip">{activeDraftIndex + 1} / {detectedDrafts.length}</span>
                </div>
                <div className="multi-recognition-list">
                  {detectedDrafts.map((item, index) => (
                    <button
                      type="button"
                      className={index === activeDraftIndex ? "active" : ""}
                      key={`${item.name}-${index}`}
                      onClick={() => selectDetectedDraft(index)}
                    >
                      <span>{index + 1}</span>
                      <strong>{item.name || "待填写药名"}</strong>
                      <small>{Math.round(item.confidence * 100)}%</small>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {error ? (
              <div className="notice warm" style={{ marginBottom: 18 }}>
                <ShieldAlert size={21} aria-hidden="true" />
                {error}
              </div>
            ) : null}
            {autoFillStatus ? (
              <div className="notice" style={{ marginBottom: 18 }}>
                <Sparkles size={20} aria-hidden="true" />
                {autoFillStatus}
              </div>
            ) : null}
            {draft.dosageSource ? (
              <div className="notice warm" style={{ marginBottom: 18 }}>
                <ShieldAlert size={20} aria-hidden="true" />
                当前单次剂量为自动填写：
                {draft.dosageSource === "catalog"
                  ? "来自药品目录参考信息"
                  : draft.dosageSource === "ai"
                    ? "来自智能标签分析"
                    : "来自包装或说明书文字"}
                。{draft.dosageBasis || "请核对处方或说明书。"}
              </div>
            ) : null}
            <DosageFormSafetyNotice
              medicationName={draft.name}
              instructions={`${draft.instructions} ${draft.dosage} ${draft.strength ?? ""} ${draft.packageSpec ?? ""}`}
              compact
            />
            <div className="form-grid">
              <label className={`field full ${draft.lowConfidenceFields.includes("name") ? "low-confidence" : ""}`}>
                <span className="field-label">药名 *</span>
                <input className="input" value={draft.name} onChange={(event) => updateField("name", event.target.value)} />
                {draft.lowConfidenceFields.includes("name") ? (
                  <span className="field-hint">这一项需要您核对，可能没有看清。</span>
                ) : null}
              </label>
              <label className="field">
                <span className="field-label">通用名</span>
                <input className="input" value={draft.genericName} onChange={(event) => updateField("genericName", event.target.value)} />
              </label>
              <label className="field">
                <span className="field-label">有效成分</span>
                <input
                  className="input"
                  value={draft.ingredientsText}
                  placeholder="例如：华法林"
                  onChange={(event) => updateField("ingredientsText", event.target.value)}
                />
              </label>
              <label className="field">
                <span className="field-label">参考价格</span>
                <input
                  className="input"
                  value={draft.price ?? ""}
                  placeholder="例如：¥28.50，没有可靠价格可留空"
                  onChange={(event) => updateField("price", event.target.value)}
                />
                <span className="field-hint">价格仅来自包装、购买记录或可靠数据源，不自动猜测。</span>
              </label>
              <label className={`field ${draft.lowConfidenceFields.includes("dosage") ? "low-confidence" : ""}`}>
                <span className="field-label">每次实际服用剂量 *</span>
                <input
                  className="input"
                  value={draft.dosage}
                  placeholder="例如：每次 1 片、0.5mg 或 10ml"
                  onChange={(event) => updateField("dosage", event.target.value)}
                  onBlur={() => {
                    const split = splitDosageText(draft.dosage);
                    if (split.strength || split.packageSpec) {
                      updateFields({
                        dosage: split.dosage,
                        strength: draft.strength || split.strength,
                        packageSpec: draft.packageSpec || split.packageSpec
                      });
                    }
                  }}
                />
                <span className="field-hint">
                  这里只填一次实际服用量。包装数量，例如“100片/盒”，不能填在这里。
                </span>
                {draft.dosageBasis ? (
                  <span className="field-hint">自动填写依据：{draft.dosageBasis}</span>
                ) : null}
              </label>
              <label className="field">
                <span className="field-label">单片/单粒规格</span>
                <input
                  className="input"
                  value={draft.strength ?? ""}
                  placeholder="例如：0.5mg/片"
                  onChange={(event) => updateField("strength", event.target.value)}
                />
              </label>
              <label className="field">
                <span className="field-label">包装数量</span>
                <input
                  className="input"
                  value={draft.packageSpec ?? ""}
                  placeholder="例如：100片/盒"
                  onChange={(event) => updateField("packageSpec", event.target.value)}
                />
              </label>
              <label className={`field ${draft.lowConfidenceFields.includes("frequency") ? "low-confidence" : ""}`}>
                <span className="field-label">频次 *</span>
                <select
                  className="select"
                  value={
                    frequencyOptions.some((item) => item.value === draft.frequency)
                      ? draft.frequency
                      : "每日 1 次"
                  }
                  onChange={(event) => {
                    const selection = applyFrequencySelection(
                      draft.times,
                      event.target.value
                    );
                    updateFields(selection);
                  }}
                >
                  {frequencyOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`field ${draft.lowConfidenceFields.includes("relation") ? "low-confidence" : ""}`}>
                <span className="field-label">饭前还是饭后 *</span>
                <select className="select" value={draft.relation} onChange={(event) => updateField("relation", event.target.value)}>
                  <option value="">请选择</option>
                  <option value="饭前">饭前</option>
                  <option value="饭后">饭后</option>
                  <option value="随餐">随餐</option>
                  <option value="睡前">睡前</option>
                  <option value="按需">按需</option>
                  <option value="按说明书">说明书未注明</option>
                </select>
              </label>
              {isAsNeededFrequency(draft.frequency) ? (
                <div className="field full">
                  <span className="field-label">用药时间</span>
                  <div className="notice">
                    <Clock3 size={20} aria-hidden="true" />
                    不固定时间服用：仅在需要时按处方或说明书使用，不设置每日固定提醒。
                  </div>
                </div>
              ) : (
                <div className="field full">
                  <span className="field-label">每天用药时间</span>
                  <div className="time-slot-grid">
                    {draft.times.map((time, index) => (
                      <label className="time-slot" key={`${index}-${time}`}>
                        <span>第 {index + 1} 次</span>
                        <input
                          className="input"
                          type="time"
                          value={time}
                          onChange={(event) => {
                            const nextTimes = [...draft.times];
                            nextTimes[index] = event.target.value;
                            updateField("times", nextTimes);
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  <span className="field-hint">
                    修改每日次数后，会同步增减对应的时间选择框。
                  </span>
                </div>
              )}
              <label className="field full">
                <span className="field-label">识别到的说明文字</span>
                <textarea className="textarea" value={draft.instructions} onChange={(event) => updateField("instructions", event.target.value)} />
              </label>
            </div>
            <div className="header-actions" style={{ marginTop: 20 }}>
              <button
                type="button"
                className="btn btn-primary btn-large"
                onClick={confirmRecognition}
              >
                <Check size={21} aria-hidden="true" />
                我已核对，开始安全核查
              </button>
              <button type="button" className="btn btn-large" onClick={() => setPhase("upload")}>
                重新拍照
              </button>
            </div>
            {formError ? (
              <p className="field-error" role="alert">
                {formError}
              </p>
            ) : !validateDosageText(draft.dosage).valid ? (
              <p className="field-error" role="alert">
                {validateDosageText(draft.dosage).message}
              </p>
            ) : null}
            {!isAsNeededFrequency(draft.frequency) &&
            !validateTimes(draft.times).valid ? (
              <p className="field-error" role="alert">
                {validateTimes(draft.times).message}
              </p>
            ) : null}
          </section>
        </div>
      ) : null}

      {phase === "result" && riskCheck ? (
        <div className="intake-layout">
          <aside className="card card-pad progress-panel">
            <RiskBadge level={riskCheck.level} />
            <h2 style={{ marginTop: 18, fontSize: 26, lineHeight: 1.35 }}>
              {riskCheck.title}
            </h2>
            <p style={{ marginTop: 12, color: "var(--muted)", lineHeight: 1.7 }}>
              {riskCheck.summary}
            </p>
            <div className="notice warm" style={{ marginTop: 18 }}>
              <ShieldAlert size={21} aria-hidden="true" />
              {riskCheck.nextStep}
            </div>
          </aside>
          <section className="card card-pad">
            <div className="section-heading">
              <div>
                <h2>为什么这样判断</h2>
                <p>依据与核查范围都可追溯。</p>
              </div>
            </div>
            <div className="source-list">
              {riskCheck.reasons.map((reason) => (
                <div className="source-item" key={reason}>
                  <strong>{reason}</strong>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 18 }}>
              <SourcesBlock sourceIds={riskCheck.sourceIds} />
            </div>
            <div className="notice" style={{ marginTop: 18 }}>
              <FileImage size={21} aria-hidden="true" />
              本次核查使用当前 {medications.filter((medication) => medication.status === "active").length} 种在用药物，并保留药物清单快照。
            </div>
            <div className="header-actions" style={{ marginTop: 22 }}>
              <button className="btn btn-primary btn-large" type="button" onClick={() => saveToMedicationList("detail")}>
                <Save size={21} aria-hidden="true" />
                {riskCheck.level === "high" || riskCheck.level === "emergency"
                  ? "只保存到待核对清单"
                  : "确认加入当前用药"}
              </button>
              <button className="btn btn-large" type="button" onClick={() => saveToMedicationList("chat")}>
                <Sparkles size={20} aria-hidden="true" />
                让智能助手解释这盒药
              </button>
            </div>
          </section>
        </div>
      ) : null}
      <input
        ref={libraryInputRef}
        className="visually-hidden-file"
        type="file"
        accept="image/*"
        aria-label="从相册选择药盒图片"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          void onFileChange(file);
        }}
      />
      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => {
          setCameraOpen(false);
          if (embedded && phase === "upload") onExit?.();
        }}
        onCapture={(imageDataUrl) => {
          setCameraOpen(false);
          void processImage(imageDataUrl);
        }}
      />
    </div>
  );
}
