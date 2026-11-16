import { isEmotionalDiscomfortQuery } from "./dailyConversation";

export function isQuestionFocusedAnswer(
  candidate: string,
  groundingText: string
): boolean {
  const text = candidate.trim();
  if (!text) return false;

  // The legacy answer shape replaced every question with the same safety report.
  if (/^#{1,4}\s*(?:⚠️\s*)?风险核对\s*$/m.test(text)) return false;
  if (
    /^#{1,4}\s*结论\s*$/m.test(text) &&
    /^#{1,4}\s*下一步\s*$/m.test(text)
  ) {
    return false;
  }

  // Do not let the model invent an age that is absent from the grounded context.
  const agePattern =
    /(?:[0-9]{1,3}|[一二三四五六七八九十百]{1,4})岁(?:高龄)?/;
  if (agePattern.test(text) && !agePattern.test(groundingText)) {
    return false;
  }

  return true;
}

export function isAnswerModeCompliant(
  candidate: string,
  mode: "quick" | "safety" | "detailed"
): boolean {
  const text = candidate.trim();
  if (!text) return false;
  const headingCount = (text.match(/^#{2,4}\s+\S+/gm) || []).length;

  if (mode === "quick") {
    return text.length <= 480 && headingCount === 0;
  }
  if (mode === "safety") {
    return (
      text.length >= 60 &&
      text.length <= 2600 &&
      headingCount >= 2 &&
      !/详细说明/.test(text)
    );
  }
  return (
    text.length >= 100 &&
    text.length <= 7000 &&
    headingCount >= 3 &&
    /详细说明|完整解释|判断依据/.test(text)
  );
}

export function isResponseRelevantToQuestion(
  query: string,
  candidate: string
): boolean {
  const answer = candidate.trim();
  if (!answer) return false;
  if (isEmotionalDiscomfortQuery(query)) {
    return (
      /(心里|心情|情绪|难受|烦|压抑|陪伴|陪您|愿意|担心)/.test(answer) &&
      !/仅凭头晕|药物引起|相互作用|调整剂量|资料不足/.test(answer)
    );
  }
  if (
    /(今天.*(吃|服).*药|用药记录|服药记录|提醒.*(情况|状态))/.test(
      query.replace(/\s+/g, "")
    )
  ) {
    return /(服药|用药|确认|提醒|药名|药物)/.test(answer);
  }
  return true;
}
