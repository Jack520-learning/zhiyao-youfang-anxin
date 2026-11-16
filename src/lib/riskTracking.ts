import type { RiskCheck } from "../types";

const nonMedicalRiskSources = new Set([
  "src-chat",
  "src-dynamic-public-web"
]);

export function isTrackableRiskCheck(riskCheck: RiskCheck): boolean {
  if (riskCheck.trackInRiskSummary === false) return false;
  return !riskCheck.sourceIds.some((sourceId) =>
    nonMedicalRiskSources.has(sourceId)
  );
}

export function trackableRiskChecks(riskChecks: RiskCheck[]): RiskCheck[] {
  return riskChecks.filter(isTrackableRiskCheck);
}
