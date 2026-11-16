export function cleanAnswerForChat(content: string): string {
  return content
    .replace(
      /^#{1,6}\s*(?:结论|当前回答|回答边界|完整解释|判断依据|下一步|当前问题的详细说明|本次答复的详细说明|详细说明)\s*$/gmu,
      ""
    )
    .replace(/^\*\*风险等级[：:][^\n*]+\*\*\s*$/gmu, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
