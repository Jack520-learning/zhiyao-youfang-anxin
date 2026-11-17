import {
  Camera,
  Leaf,
  LoaderCircle,
  Search,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CameraCaptureModal } from "../components/CameraCaptureModal";
import { DiscoveryNav } from "../components/DiscoveryNav";
import { findHerbsInText, herbs, searchHerbs } from "../catalog/herbs";
import { recognizeMedicineImage } from "../lib/ocr";
import { toChineseErrorMessage } from "../lib/userMessage";
import { requestVisionIdentification } from "../lib/vision";

export function HerbsPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const [identifiedNames, setIdentifiedNames] = useState<string[]>([]);
  const [summary, setSummary] = useState("");
  const results = searchHerbs(query);

  async function identifyHerbPhoto(imageDataUrl: string) {
    setImagePreview(imageDataUrl);
    setBusy(true);
    setError("");
    setIdentifiedNames([]);
    setSummary("");
    try {
      const visionPromise = requestVisionIdentification(
        imageDataUrl,
        "herb",
        50000
      );
      const ocrPromise = recognizeMedicineImage(imageDataUrl)
        .then((ocr) => findHerbsInText(ocr.rawText))
        .catch(() => []);
      const [payload, localHerbs] = await Promise.all([
        visionPromise,
        ocrPromise
      ]);
      const names = [
        ...(payload.candidates || []).map((item) => item.name?.trim() || ""),
        ...localHerbs.map((herb) => herb.name)
      ].filter(
        (name, index, list) =>
          name &&
          list.findIndex(
            (item) =>
              item.replace(/\s+/g, "").toLowerCase() ===
              name.replace(/\s+/g, "").toLowerCase()
          ) === index
      );
      setIdentifiedNames(names);
      setSummary(
        [payload.summary, ...(payload.cautions || [])]
          .filter(Boolean)
          .join("\n")
      );
      if (!names.length) {
        setError("照片中没有得到可确认的药材名称，请补拍清晰叶、花、果实或根茎特征。");
      }
    } catch (identificationError) {
      const identificationMessage = toChineseErrorMessage(
        identificationError,
        "照片识别暂不可用，请检查网络后重试。"
      );
      try {
        const ocr = await recognizeMedicineImage(imageDataUrl);
        const localMatches = findHerbsInText(ocr.rawText).map(
          (item) => item.name
        );
        if (localMatches.length) {
          setIdentifiedNames(localMatches);
          setSummary(
            `智能识图暂不可用，已从图片中识别出药材文字：${localMatches.join("、")}。请再次核对实物特征。`
          );
        } else {
          setError(
            `${identificationMessage} 图片中也没有读到可匹配的药材名称。`
          );
        }
      } catch {
        setError(
          identificationMessage
        );
      }
    } finally {
      setBusy(false);
    }
  }

  const photoMatches = identifiedNames
    .flatMap((name) => {
      const textMatches = findHerbsInText(name);
      return textMatches.length ? textMatches : searchHerbs(name);
    })
    .filter(
      (herb, index, list) =>
        list.findIndex((item) => item.id === herb.id) === index
    );
  const visible = photoMatches.length ? photoMatches : results;

  return (
    <div className="page">
      <DiscoveryNav />
      <header className="page-header">
        <div>
          <p className="eyebrow">识中药材 · 中草药百科</p>
          <h1 className="page-title">看懂本草，也看懂风险</h1>
          <p className="page-description">
            支持药材名称、别名和传统功用检索，也可拍照辅助识别。中药同样可能与处方药相互影响，不能只当普通食品。
          </p>
        </div>
        <span className="chip">
          <Leaf size={15} aria-hidden="true" />
          {herbs.length} 种常用药材
        </span>
      </header>

      <section className="card card-pad herb-workbench">
        <div className="herb-scan-actions">
          <button
            className="btn btn-primary btn-large"
            type="button"
            disabled={busy}
            onClick={() => setCameraOpen(true)}
          >
            {busy ? (
              <LoaderCircle size={21} className="spin" aria-hidden="true" />
            ) : (
              <Camera size={21} aria-hidden="true" />
            )}
            {busy ? "正在智能辨识" : "拍照识别药材"}
          </button>
          <span className="field-hint">
            拍照识别支持一张照片中的多种药材；服务暂不可用时可继续按名称搜索。
          </span>
        </div>

        <label className="catalog-search-field" style={{ marginTop: 16 }}>
          <Search size={22} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setIdentifiedNames([]);
            }}
            placeholder="搜索药材名或别名，例如：枸杞、黄芪"
            aria-label="搜索中药材"
          />
        </label>

        {imagePreview ? (
          <img className="herb-photo-preview" src={imagePreview} alt="用于辨识中药材的照片" />
        ) : null}
        {summary ? <div className="catalog-answer" style={{ marginTop: 14 }}>{summary}</div> : null}
        {error ? (
          <div className="notice warm" style={{ marginTop: 14 }} role="alert">
            {error}
          </div>
        ) : null}
        <div className="chip-row" style={{ marginTop: 14 }}>
          <span className="field-hint" style={{ marginRight: 4 }}>不知道拍什么？试试：</span>
          {["枸杞子", "黄芪", "菊花", "三七"].map((name) => (
            <button
              className="filter-chip"
              type="button"
              key={name}
              onClick={() => {
                setQuery(name);
                setIdentifiedNames([]);
              }}
            >
              {name}
            </button>
          ))}
        </div>
      </section>

      <div className="herb-grid">
        {visible.map((herb) => (
          <button
            className="card herb-card"
            type="button"
            key={herb.id}
            onClick={() => navigate(`/herbs/${herb.id}`)}
          >
            <span className="herb-mark">
              <Leaf size={27} aria-hidden="true" />
            </span>
            <span>
              <strong>{herb.name}</strong>
              <small>{herb.nature} · {herb.flavor} · 归{herb.meridians.join("、")}经</small>
              <p>{herb.functions.join(" · ")}</p>
            </span>
          </button>
        ))}
      </div>

      {!visible.length ? (
        <div className="notice warm">暂未找到这份药材资料，请不要仅凭照片自行服用。</div>
      ) : null}

      <div className="notice" style={{ marginTop: 16 }}>
        <ShieldCheck size={20} aria-hidden="true" />
        中药识别仅提供名称和传统资料参考，不能判断您的体质或疾病，也不提供自行配伍和剂量建议。
      </div>

      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(imageDataUrl) => {
          setCameraOpen(false);
          void identifyHerbPhoto(imageDataUrl);
        }}
      />
    </div>
  );
}
