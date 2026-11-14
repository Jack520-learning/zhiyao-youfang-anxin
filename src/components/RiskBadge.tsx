import {
  CircleHelp,
  CircleCheck,
  ShieldAlert,
  Siren,
  TriangleAlert
} from "lucide-react";
import type { RiskLevel } from "../types";

const labels: Record<RiskLevel, string> = {
  low: "未发现已知问题",
  medium: "需要核实",
  high: "高风险 · 先问医生",
  unknown: "资料不足",
  emergency: "紧急 · 立即求助"
};

export function RiskBadge({ level }: { level: RiskLevel }) {
  const Icon =
    level === "low"
      ? CircleCheck
      : level === "medium"
        ? TriangleAlert
        : level === "high"
          ? ShieldAlert
          : level === "emergency"
            ? Siren
            : CircleHelp;
  return (
    <span className={`risk-badge risk-${level}`}>
      <Icon size={17} aria-hidden="true" />
      {labels[level]}
    </span>
  );
}
