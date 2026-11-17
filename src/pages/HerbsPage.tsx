import { Leaf, Search, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DiscoveryNav } from "../components/DiscoveryNav";
import { herbs, searchHerbs } from "../catalog/herbs";

export function HerbsPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const results = searchHerbs(query);

  return (
    <div className="page">
      <DiscoveryNav />
      <header className="page-header">
        <div>
          <p className="eyebrow">识中药材 · 中草药百科</p>
          <h1 className="page-title">看懂本草，也看懂风险</h1>
          <p className="page-description">
            支持药材名称、别名和传统功用检索。拍照识别统一在“问药识药”页面完成，可同时识别西药包装和中药材。
          </p>
        </div>
        <span className="chip">
          <Leaf size={15} aria-hidden="true" />
          {herbs.length} 种常用药材
        </span>
      </header>

      <section className="card card-pad herb-workbench">
        <label className="catalog-search-field">
          <Search size={22} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索药材名或别名，例如：枸杞、黄芪"
            aria-label="搜索中药材"
          />
        </label>
        <p className="field-hint" style={{ marginTop: 12 }}>
          这里只提供本草资料检索。需要拍照辨识时，请返回“问药识药”使用统一拍照入口。
        </p>
        <div className="chip-row" style={{ marginTop: 14 }}>
          <span className="field-hint" style={{ marginRight: 4 }}>
            常用检索：
          </span>
          {["枸杞子", "黄芪", "菊花", "三七"].map((name) => (
            <button
              className="filter-chip"
              type="button"
              key={name}
              onClick={() => setQuery(name)}
            >
              {name}
            </button>
          ))}
        </div>
      </section>

      <div className="herb-grid">
        {results.map((herb) => (
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
              <small>
                {herb.nature} · {herb.flavor} · 归{herb.meridians.join("、")}经
              </small>
              <p>{herb.functions.join(" · ")}</p>
            </span>
          </button>
        ))}
      </div>

      {!results.length ? (
        <div className="notice warm">
          暂未找到这份药材资料，请不要仅凭名称或网传图片自行服用。
        </div>
      ) : null}

      <div className="notice" style={{ marginTop: 16 }}>
        <ShieldCheck size={20} aria-hidden="true" />
        中药识别和资料仅供传统知识参考，不用于诊断或自行配伍用药。
      </div>
    </div>
  );
}
