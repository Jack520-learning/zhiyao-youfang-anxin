export function shouldUseConversationContext(query: string): boolean {
  const normalized = query.trim().replace(/\s+/g, "");
  return (
    normalized.length <= 22 &&
    /^(那|那么|还有|另外|如果|那如果|这个|这种|它|这盒药|刚才|上面|可以|能不能|要不要|该不该|怎么|为什么|然后呢|还有呢)/.test(
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
