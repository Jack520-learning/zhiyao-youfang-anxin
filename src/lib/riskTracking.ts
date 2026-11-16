import type { Conversation, RiskCheck } from "../types";

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

export function collectTrackableRiskChecks(
  riskChecks: RiskCheck[],
  conversations: Conversation[] = []
): RiskCheck[] {
  const byId = new Map<string, RiskCheck>();
  for (const riskCheck of trackableRiskChecks(riskChecks)) {
    byId.set(riskCheck.id, riskCheck);
  }
  for (const conversation of conversations) {
    for (const message of conversation.messages) {
      const riskCheck = message.riskCheck;
      if (riskCheck && isTrackableRiskCheck(riskCheck)) {
        const indexed = byId.get(riskCheck.id);
        byId.set(
          riskCheck.id,
          indexed
            ? {
                ...riskCheck,
                ...indexed,
                familyReview:
                  indexed.familyReview || riskCheck.familyReview
              }
            : riskCheck
        );
      }
    }
  }
  return [...byId.values()].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() -
      new Date(left.createdAt).getTime()
  );
}
