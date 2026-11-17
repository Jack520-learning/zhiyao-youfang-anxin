type AnswerMode = "quick" | "safety" | "detailed";

function topicFor(query: string): string {
  if (/漏服|忘了吃|忘记吃/.test(query)) return "这次漏服";
  if (/一起吃|同服|相互作用/.test(query)) return "联合用药";
  if (/副作用|不良反应/.test(query)) return "药物不良反应";
  if (/心脏|胸口|胸闷/.test(query)) return "心脏不适";
  if (/头晕/.test(query)) return "头晕";
  return "当前问题";
}

function replaceSectionLabels(text: string, variant: number): string {
  if (variant === 0) {
    return text
      .replace("### 为什么", "### 判断依据")
      .replace("### 现在先做", "### 接下来先做");
  }
  if (variant === 1) {
    return text
      .replace("### 判断依据", "### 这样判断的依据")
      .replace("### 为什么", "### 这样判断的依据")
      .replace("### 现在先做", "### 建议先做")
      .replace("### 接下来", "### 后续怎么做");
  }
  return text
    .replace("### 完整解释", "### 具体情况说明")
    .replace("### 判断依据", "### 依据是什么")
    .replace("### 应该做什么", "### 具体行动")
    .replace("### 现在先做", "### 先做这几件事")
    .replace("### 需要注意", "### 还要留意");
}

export function varyRegeneratedAnswer(
  answer: string,
  mode: AnswerMode,
  query: string,
  seed: number
): string {
  const text = answer.trim();
  const variant = Math.abs(Math.floor(seed)) % 3;
  const topic = topicFor(query);

  if (mode === "quick") {
    const lead =
      variant === 0
        ? "简短说明："
        : variant === 1
          ? "直接说重点："
          : "可以这样理解：";
    return `${lead}${text.replace(/^(结论|直接回答|直接说重点|简短说明)：?/, "")}`;
  }

  const varied = replaceSectionLabels(text, variant);
  if (variant === 0) {
    return `关于${topic}，先给出明确结论。\n\n${varied}`;
  }
  if (variant === 1) {
    return `${varied.replace("结论：", "先说结论：")}\n\n上述内容仍以当前药物资料和安全边界为准。`;
  }
  return `${varied.replace("下一步：", "接下来您可以：").replace("原因：", "这样判断的原因是：")}\n\n以上换用了另一种表达，关键事实、风险等级和行动建议不变。`;
}
