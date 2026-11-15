import { BookOpenText, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DiscoveryNav } from "../components/DiscoveryNav";
import { medicines } from "../catalog/medicines";
import { matchMedicines } from "../catalog/retrieval";

export function CatalogPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部");
  const categories = useMemo(
    () => ["全部", ...new Set(medicines.map((medicine) => medicine.category))],
    []
  );
  const results = useMemo(() => {
    const matched = matchMedicines(query, medicines.length).map(
      (item) => item.medicine
    );
    const source = query.trim() ? matched : medicines;
    return category === "全部"
      ? source
      : source.filter((medicine) => medicine.category === category);
  }, [category, query]);

  return (
    <div className="page">
      <DiscoveryNav />
      <header className="page-header">
        <div>
          <p className="eyebrow">药品百科 · 识药问药</p>
          <h1 className="page-title">先查清楚，再放心使用</h1>
          <p className="page-description">
            可搜索通用名、商品名、成分和剂型，查看用法、注意事项、特殊人群提醒和联合用药风险。
          </p>
        </div>
        <span className="chip">
          <BookOpenText size={15} aria-hidden="true" />
          {medicines.length} 种常用药品
        </span>
      </header>

      <div className="catalog-search card card-pad">
        <label className="catalog-search-field">
          <Search size={22} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索药名、商品名或有效成分"
            aria-label="搜索药品百科"
          />
        </label>
        <div className="chip-row">
          {categories.map((item) => (
            <button
              type="button"
              className={`filter-chip ${category === item ? "active" : ""}`}
              key={item}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="catalog-grid">
        {results.map((medicine) => (
          <button
            className={`catalog-card card accent-${medicine.accent}`}
            type="button"
            key={medicine.slug}
            onClick={() => navigate(`/catalog/${medicine.slug}`)}
          >
            <span className="catalog-card-top">
              <span className="catalog-category">{medicine.category}</span>
              <span className="review-status">待专业复核</span>
            </span>
            <strong>{medicine.displayName}</strong>
            <span>{medicine.activeIngredient} · {medicine.dosageForm}</span>
            <small>{medicine.strength}</small>
          </button>
        ))}
      </div>
      {!results.length ? (
        <div className="notice warm">
          没有匹配到药品。请尝试通用名或有效成分，不要根据相似药名自行服药。
        </div>
      ) : null}

      <div className="notice" style={{ marginTop: 16 }}>
        <ShieldCheck size={20} aria-hidden="true" />
        当前药品资料整理自公开说明书常见表述，尚未完成药师逐条复核。实际使用以手中批准说明书、处方和医生意见为准。
      </div>
    </div>
  );
}
