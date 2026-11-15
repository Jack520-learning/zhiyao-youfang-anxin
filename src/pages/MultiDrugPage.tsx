import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  ClipboardList,
  LoaderCircle,
  Printer,
  ShieldAlert,
  Trash2
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CameraCaptureModal } from "../components/CameraCaptureModal";
import { DiscoveryNav } from "../components/DiscoveryNav";
import { recognizeMedicineImage } from "../lib/ocr";
import { reconcileMedicationList } from "../catalog/multiDrug";
import { useAppStore } from "../store/useAppStore";

export function MultiDrugPage() {
  const navigate = useNavigate();
  const medications = useAppStore((state) => state.medications);
  const currentNames = medications
    .filter((item) => item.status === "active")
    .map((item) => item.name);
  const [manualText, setManualText] = useState(currentNames.join("\n"));
  const [photoNames, setPhotoNames] = useState<string[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const names = useMemo(
    () =>
      [
        ...manualText
          .split(/\r?\n|[；;，,]/)
          .map((item) => item.trim())
          .filter(Boolean),
        ...photoNames
      ].filter((name, index, list) => list.indexOf(name) === index),
    [manualText, photoNames]
  );
  const result = useMemo(() => reconcileMedicationList(names), [names]);

  async function processPhoto(imageDataUrl: string) {
    setImages((current) => [...current, imageDataUrl].slice(-5));
    setBusy(true);
    setNotice("正在识别照片中的多个药品…");
    try {
      const response = await fetch("/api/vision-identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl, mode: "medicine" })
      });
      if (response.ok) {
        const payload = (await response.json()) as {
          candidates?: Array<{ name: string; confidence?: number }>;
        };
        const recognized = (payload.candidates || [])
          .filter((item) => item.name && (item.confidence ?? 0) >= 0.35)
          .map((item) => item.name.trim());
        if (recognized.length) {
          setPhotoNames((current) => [
            ...current,
            ...recognized.filter((name) => !current.includes(name))
          ]);
          setNotice(`已从照片加入 ${recognized.length} 个药品候选，请核对名称后再看结果。`);
          return;
        }
      }
      const ocr = await recognizeMedicineImage(imageDataUrl);
      const lines = ocr.rawText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length >= 2)
        .slice(0, 8);
      if (lines.length) {
        setPhotoNames((current) => [
          ...current,
          ...lines.filter((line) => !current.includes(line))
        ]);
        setNotice("AI 视觉服务未返回唯一名称，已把图片中识别到的文字加入清单。");
      } else {
        setNotice("这张照片没有识别出可用药名，请从清单中手动补充。");
      }
    } catch {
      setNotice("照片识别未完成，可以继续手动输入药名。");
    } finally {
      setBusy(false);
    }
  }

  const print = () => {
    document.body.classList.add("printing-reconciliation");
    window.print();
    window.setTimeout(
      () => document.body.classList.remove("printing-reconciliation"),
      500
    );
  };

  return (
    <div className="page reconciliation-page">
      <DiscoveryNav />
      <button className="btn btn-ghost page-back" type="button" onClick={() => navigate("/chat")}>
        <ArrowLeft size={19} aria-hidden="true" />
        返回问药识药
      </button>
      <header className="page-header">
        <div>
          <p className="eyebrow">多药对账 · 当前完整用药清单</p>
          <h1 className="page-title">一次核对所有在用的药</h1>
          <p className="page-description">
            把处方药、OTC、中药材和保健品放在一起核查，重点发现相同成分、同类药重复、已知相互作用和需要错开服用的药。
          </p>
        </div>
        <ClipboardList size={32} color="var(--primary)" aria-hidden="true" />
      </header>

      <div className="reconciliation-input-grid">
        <section className="card card-pad">
          <div className="section-heading">
            <div>
              <h2>输入或拍照添加</h2>
              <p>每行写一种药；照片可以连续添加多张。</p>
            </div>
            <Camera size={23} color="var(--primary)" aria-hidden="true" />
          </div>
          <textarea
            className="textarea reconciliation-textarea"
            value={manualText}
            placeholder={"例如：\n阿司匹林肠溶片\n华法林钠片\n三七\n鱼油"}
            onChange={(event) => setManualText(event.target.value)}
            aria-label="输入多种药品、中药材或保健品名称"
          />
          <div className="header-actions" style={{ marginTop: 12 }}>
            <button
              className="btn btn-primary btn-large"
              type="button"
              disabled={busy}
              onClick={() => setCameraOpen(true)}
            >
              {busy ? <LoaderCircle size={20} className="spin" /> : <Camera size={20} />}
              拍照添加多种药
            </button>
          </div>
          {notice ? <div className="notice" style={{ marginTop: 12 }}>{notice}</div> : null}
          {images.length ? (
            <div className="reconciliation-images">
              {images.map((image, index) => (
                <img key={`${image.slice(-20)}-${index}`} src={image} alt={`多药对账照片 ${index + 1}`} />
              ))}
            </div>
          ) : null}
          {photoNames.length ? (
            <div className="chip-row" style={{ marginTop: 12 }}>
              {photoNames.map((name) => (
                <button
                  type="button"
                  className="chip"
                  key={name}
                  onClick={() =>
                    setPhotoNames((current) =>
                      current.filter((item) => item !== name)
                    )
                  }
                >
                  {name}
                  <Trash2 size={13} aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <section className="card card-pad">
          <div className="section-heading">
            <div>
              <h2>本页怎么判断</h2>
              <p>先匹配药名与剂型，再进行联合核对。</p>
            </div>
            <CheckCircle2 size={23} color="var(--primary)" aria-hidden="true" />
          </div>
          <ul className="knowledge-list">
            <li>同一种有效成分的片剂、胶囊或颗粒可能重复。</li>
            <li>同类药不一定都能互相替代，需让医生或药师核对。</li>
            <li>中药和保健品也必须加入，不能只核对西药。</li>
            <li>任何未匹配名称都会明确列出，不猜测成分。</li>
          </ul>
        </section>
      </div>

      <section className="card card-pad reconciliation-report" style={{ marginTop: 16 }}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">自动生成</p>
            <h2>当前完整用药清单</h2>
            <p>共 {result.entries.length} 项，发现 {result.warnings.length} 条需要核对的问题。</p>
          </div>
          <button className="btn" type="button" onClick={print}>
            <Printer size={19} aria-hidden="true" />
            打印或保存 PDF
          </button>
        </div>

        <div className="reconciliation-list">
          {result.entries.map((entry, index) => (
            <div className="reconciliation-item" key={`${entry.rawName}-${index}`}>
              <span className={`risk-badge risk-${entry.kind === "unknown" ? "unknown" : "low"}`}>
                {entry.kind === "medicine"
                  ? "药品"
                  : entry.kind === "herb"
                    ? "中药材"
                    : entry.kind === "supplement"
                      ? entry.supplement?.kind || "保健品"
                      : "待核对"}
              </span>
              <span>
                <strong>{entry.label}</strong>
                <small>{entry.detail}</small>
              </span>
              {entry.kind === "unknown" ? (
                <ShieldAlert size={20} color="var(--amber)" aria-hidden="true" />
              ) : null}
            </div>
          ))}
          {!result.entries.length ? (
            <p className="field-hint">输入至少一种药物后会显示完整清单。</p>
          ) : null}
        </div>

        {result.warnings.length ? (
          <div className="reconciliation-warnings">
            {result.warnings.map((warning) => (
              <article className={`risk-card ${warning.level}`} key={`${warning.title}-${warning.detail}`}>
                <h3>{warning.title}</h3>
                <p>{warning.detail}</p>
                <p><strong>怎么做：</strong>{warning.action}</p>
              </article>
            ))}
          </div>
        ) : names.length ? (
          <div className="notice" style={{ marginTop: 14 }}>
            当前安全规则未发现重复成分、同类重复或已知相互作用。这不代表绝对安全，中药、保健品和未收录药物仍需专业核对。
          </div>
        ) : null}

        {result.spacing.length ? (
          <section style={{ marginTop: 16 }}>
            <h3>需要错开服用的药</h3>
            <ul className="knowledge-list warning-list">
              {result.spacing.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>
        ) : null}
        {result.unresolved.length ? (
          <div className="notice warm" style={{ marginTop: 14 }}>
            <ShieldAlert size={20} aria-hidden="true" />
            以下名称未完全匹配，未计入相互作用结论：{result.unresolved.join("、")}。请核对通用名或补充药盒照片。
          </div>
        ) : null}
      </section>

      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(imageDataUrl) => {
          setCameraOpen(false);
          void processPhoto(imageDataUrl);
        }}
      />
    </div>
  );
}
