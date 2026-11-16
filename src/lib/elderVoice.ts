import type { AssistantResponse } from "../types";

export function toElderVoice(text: string): string {
  return text
    .replaceAll("用户", "您")
    .replace(/你(?!们)/g, "您");
}

export function toElderVoiceResponse(
  response: AssistantResponse
): AssistantResponse {
  return {
    ...response,
    message: toElderVoice(response.message),
    riskCheck: {
      ...response.riskCheck,
      title: toElderVoice(response.riskCheck.title),
      summary: toElderVoice(response.riskCheck.summary),
      nextStep: toElderVoice(response.riskCheck.nextStep),
      reasons: response.riskCheck.reasons.map(toElderVoice)
    }
  };
}
