import { FileCheck2, Info } from "lucide-react";
import { sourcesFor } from "../lib/riskEngine";

export function SourcesBlock({ sourceIds }: { sourceIds: string[] }) {
  const sources = sourcesFor(sourceIds);
  if (!sources.length) {
    return (
      <div className="notice warm">
        <Info size={20} aria-hidden="true" />
        这条回答没有足够来源，系统不会继续给出具体用药动作。
      </div>
    );
  }
  return (
    <div className="source-list" aria-label="回答依据">
      {sources.map((source) => (
        <div className="source-item" key={source.id}>
          <strong>
            <FileCheck2 size={14} aria-hidden="true" /> {source.title}
          </strong>
          <span>{source.excerpt}</span>
          {!source.reviewed ? (
            <span>演示规则，尚未完成医药专业审核</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
