import { useMemo, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { findInteractions } from "../catalog/interactions";
import type { Medicine } from "../catalog/types";

export function InteractionCheck({
  medicine,
  candidates,
  initialSlugs = []
}: {
  medicine: Medicine;
  candidates: Medicine[];
  initialSlugs?: string[];
}) {
  const [selected, setSelected] = useState<string[]>(
    initialSlugs.filter((slug) => slug !== medicine.slug)
  );
  const interactions = useMemo(
    () => findInteractions([medicine.slug, ...selected]),
    [medicine.slug, selected]
  );

  function toggle(slug: string) {
    setSelected((current) =>
      current.includes(slug)
        ? current.filter((item) => item !== slug)
        : current.length < 4
          ? [...current, slug]
          : current
    );
  }

  return (
    <section className="card card-pad">
      <div className="section-heading">
        <div>
          <h2>还要一起吃别的药吗？</h2>
          <p>主动核对重复成分和联合用药风险，最多选择 4 种。</p>
        </div>
        <ShieldAlert size={23} color="var(--amber)" aria-hidden="true" />
      </div>
      <div className="interaction-options">
        {candidates
          .filter((item) => item.slug !== medicine.slug)
          .map((item) => (
            <label
              className={`interaction-option ${selected.includes(item.slug) ? "selected" : ""}`}
              key={item.slug}
            >
              <input
                type="checkbox"
                checked={selected.includes(item.slug)}
                onChange={() => toggle(item.slug)}
              />
              <span>
                <strong>{item.displayName}</strong>
                <small>{item.category}</small>
              </span>
            </label>
          ))}
      </div>
      {selected.length ? (
        interactions.length ? (
          <div className="interaction-results">
            {interactions.map((interaction) => (
              <article
                className={`risk-card ${interaction.severity === "high" ? "high" : "medium"}`}
                key={`${interaction.medicineNames.join("-")}-${interaction.title}`}
              >
                <h3>{interaction.title}</h3>
                <p>{interaction.explanation}</p>
                <p><strong>怎么做：</strong>{interaction.action}</p>
              </article>
            ))}
          </div>
        ) : (
          <div className="notice" style={{ marginTop: 14 }}>
            当前知识库未命中已知相互作用。这不代表绝对安全，未收录药物、中药和保健品仍需让医生或药师核对。
          </div>
        )
      ) : null}
    </section>
  );
}
