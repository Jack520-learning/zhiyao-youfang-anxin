import {
  ArrowLeft,
  BookOpenText,
  CircleHelp,
  ShieldCheck,
  ShoppingBag
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DiscoveryNav } from "../components/DiscoveryNav";
import { InteractionCheck } from "../components/InteractionCheck";
import { getMedicine, medicines } from "../catalog/medicines";
import { findBestMedicine } from "../catalog/retrieval";
import { buildLocalGuidance } from "../catalog/guidance";
import { useAppStore } from "../store/useAppStore";
import type { HealthContext } from "../catalog/types";

export function CatalogDetailPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const medicine = slug ? getMedicine(slug) : undefined;
  const appProfile = useAppStore((state) => state.profile);
  const appMedications = useAppStore((state) => state.medications);
  const [question, setQuestion] = useState("");
  const currentCompanions = useMemo(
    () =>
      [...new Set(
        appMedications
          .filter((item) => item.status === "active")
          .map((item) => findBestMedicine(item.genericName || item.name)?.medicine.slug)
          .filter((item): item is string => Boolean(item))
      )],
    [appMedications]
  );

  if (!medicine) {
    return (
      <div className="page">
        <DiscoveryNav />
        <div className="card card-pad">
          <h1 className="page-title">没有找到这份药品资料</h1>
          <button className="btn btn-primary" type="button" onClick={() => navigate("/catalog")}>
            返回药品百科
          </button>
        </div>
      </div>
    );
  }

  const contexts: HealthContext[] = [
    ...(appProfile.age >= 65 ? ["older" as const] : []),
    ...(appProfile.conditions.some((item) => /肾/.test(item))
      ? ["kidney" as const]
      : []),
    ...(appProfile.conditions.some((item) => /肝/.test(item))
      ? ["liver" as const]
      : [])
  ];
  const guidance = buildLocalGuidance({
    medicineSlug: medicine.slug,
    companionSlugs: currentCompanions,
    healthContext: contexts,
    question: question || undefined
  });

  return (
    <div className="page">
      <DiscoveryNav />
      <button className="btn btn-ghost page-back" type="button" onClick={() => navigate("/catalog")}>
        <ArrowLeft size={19} aria-hidden="true" />
        返回药品百科
      </button>
      <header className="page-header">
        <div>
          <p className="eyebrow">{medicine.category} · 待专业复核</p>
          <h1 className="page-title">{medicine.displayName}</h1>
          <p className="page-description">
            {medicine.activeIngredient} · {medicine.dosageForm} · {medicine.strength}
          </p>
        </div>
        <BookOpenText size={32} color="var(--primary)" aria-hidden="true" />
      </header>

      <div className="catalog-detail-grid">
        <div className="catalog-detail-main">
          <section className="card card-pad">
            <div className="section-heading">
              <div>
                <h2>参考用法</h2>
                <p>必须与手中包装、处方和医生意见逐项核对。</p>
              </div>
              <ShieldCheck size={24} color="var(--primary)" aria-hidden="true" />
            </div>
            <div className="catalog-facts">
              <div><span>常见用法</span><strong>{medicine.howToTake}</strong></div>
              <div><span>每日上限</span><strong>{medicine.maxDaily}</strong></div>
              <div><span>服用时机</span><strong>{medicine.timing}</strong></div>
              <div><span>饮食注意</span><strong>{medicine.food}</strong></div>
            </div>
          </section>

          <section className="card card-pad">
            <h2>重点安全提醒</h2>
            <ul className="knowledge-list warning-list">
              {medicine.keyWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </section>

          <section className="card card-pad">
            <h2>可能出现的常见不适</h2>
            <div className="chip-row">
              {medicine.sideEffects.map((effect) => (
                <span className="chip" key={effect}>{effect}</span>
              ))}
            </div>
          </section>

          <section className="card card-pad">
            <h2>特殊人群提醒</h2>
            <div className="special-groups">
              {[
                ["老年人", medicine.specialGroups.older],
                ["孕期/哺乳", medicine.specialGroups.pregnancy],
                ["肾脏疾病", medicine.specialGroups.kidney],
                ["肝脏疾病", medicine.specialGroups.liver]
              ].map(([label, value]) => (
                <div className="special-group" key={label}>
                  <strong>{label}</strong>
                  <p>{value}</p>
                </div>
              ))}
            </div>
          </section>

          <InteractionCheck
            medicine={medicine}
            candidates={medicines}
            initialSlugs={currentCompanions}
          />
        </div>

        <aside className="catalog-detail-side">
          <section className="card card-pad">
            <div className="section-heading">
              <div>
                <h2>问这份药品资料</h2>
                <p>只根据当前条目和已选药物回答。</p>
              </div>
              <CircleHelp size={22} color="var(--primary)" aria-hidden="true" />
            </div>
            <label className="field">
              <span className="field-label">您想问什么</span>
              <textarea
                className="textarea"
                value={question}
                placeholder="例如：漏服怎么办？服药期间能喝酒吗？"
                onChange={(event) => setQuestion(event.target.value)}
              />
            </label>
            {guidance?.questionAnswer ? (
              <div className="catalog-answer" aria-live="polite">
                {guidance.questionAnswer}
              </div>
            ) : (
              <p className="field-hint">
                输入问题后会先给出结论，再说明原因和下一步。价格与购买平台不做猜测。
              </p>
            )}
          </section>

          <section className="card card-pad">
            <div className="notice warm">
              <ShoppingBag size={20} aria-hidden="true" />
              暂无实时价格、平台和医保数据，不能自动判断哪里购买最便宜。
            </div>
          </section>

          <section className="card card-pad source-disclaimer">
            <h2>资料来源</h2>
            <p>{medicine.sourceTitle}</p>
            <p>{medicine.sourceNote}</p>
            <span className="chip">版本 {medicine.knowledgeVersion}</span>
            <span className="chip risk-medium">待药师复核</span>
          </section>
        </aside>
      </div>
    </div>
  );
}
