import { CircleAlert, ShieldCheck } from "lucide-react";
import { getDosageFormSafety } from "../lib/dosageFormSafety";

interface DosageFormSafetyNoticeProps {
  medicationName: string;
  instructions?: string;
  compact?: boolean;
}

export function DosageFormSafetyNotice({
  medicationName,
  instructions = "",
  compact = false
}: DosageFormSafetyNoticeProps) {
  const safety = getDosageFormSafety(medicationName, instructions);

  if (compact) {
    return (
      <div className="dosage-safety-inline">
        <CircleAlert size={17} aria-hidden="true" />
        <strong>{safety.formLabel}</strong>
        <span>
          掰开：{safety.split} · 碾碎：{safety.crush} · 嚼碎：{safety.chew}
        </span>
      </div>
    );
  }

  return (
    <section className="card card-pad dosage-safety-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">剂型安全提醒</p>
          <h2>{safety.headline}</h2>
          <p>{safety.formLabel} · 是否掰开、碾碎、嚼碎要以手中说明书为准。</p>
        </div>
        <ShieldCheck size={26} color="var(--primary)" aria-hidden="true" />
      </div>
      <div className="dosage-safety-grid">
        <div>
          <span>能不能掰开</span>
          <strong>{safety.split}</strong>
        </div>
        <div>
          <span>能不能碾碎</span>
          <strong>{safety.crush}</strong>
        </div>
        <div>
          <span>能不能嚼碎</span>
          <strong>{safety.chew}</strong>
        </div>
      </div>
      <div className="notice warm">
        <CircleAlert size={20} aria-hidden="true" />
        {safety.detail}
      </div>
    </section>
  );
}
