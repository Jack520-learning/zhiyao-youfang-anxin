import { findBestMedicine } from "../catalog/retrieval";

export function shouldUseConversationContext(query: string): boolean {
  const normalized = query.trim().replace(/\s+/g, "");
  const explicitMedicine =
    (findBestMedicine(query)?.score || 0) >= 0.68 &&
    !/这个|这种|它|这盒药|刚才|上面/.test(normalized);
  if (explicitMedicine) return false;
  return (
    (normalized.length <= 32 &&
      /^(那|那么|还有|另外|如果|那如果|这个|这种|它|这盒药|刚才|上面|可以|能不能|要不要|该不该|怎么|为什么|然后呢|还有呢)/.test(
        normalized
      )) ||
    /漏服|忘记吃|联系谁|找谁|提醒.*设置|高危.*漏服|副作用|不良反应|相互作用|一起吃|同服/.test(
      normalized
    )
  );
}

export function buildContextualQuestion(
  query: string,
  previousUserQuestion: string
): string {
  if (!previousUserQuestion.trim() || query.includes(previousUserQuestion)) {
    return query;
  }
  return `上一轮问题：${previousUserQuestion.trim()}\n这一轮接着问：${query.trim()}`;
}

export function buildRecentConversationQuestion(input: {
  query: string;
  medicineName?: string;
  recentMessages?: Array<{ role: "user" | "assistant"; content: string }>;
}): string {
  const query = input.query.trim();
  if (!shouldUseConversationContext(query)) return query;
  const medicineName = input.medicineName?.trim() || "";
  const resolvedQuery =
    medicineName && !query.includes(medicineName)
      ? `${medicineName} ${query}`
      : query;
  const previousUserQuestion = [...(input.recentMessages || [])]
    .reverse()
    .find((message) => message.role === "user")?.content;
  return previousUserQuestion
    ? buildContextualQuestion(resolvedQuery, previousUserQuestion)
    : resolvedQuery;
}
