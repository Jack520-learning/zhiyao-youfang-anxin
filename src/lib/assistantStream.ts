export interface AssistantStreamPayload {
  query: string;
  profile: {
    age: number;
    conditions: string[];
    allergies: string[];
  };
  medications: Array<{
    name: string;
    genericName: string;
    ingredients: string[];
    dosage: string;
    relation: string;
  }>;
  evidence: string[];
  riskLevel: string;
  groundingText: string;
  skill?: string;
  skillLabel?: string;
  answerMode: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface AssistantStreamHandlers {
  onDelta: (text: string, fullText: string) => void;
  onStage?: (stage: { id: string; label: string }) => void;
  signal?: AbortSignal;
}

export async function streamAssistantAnswer(
  payload: AssistantStreamPayload,
  handlers: AssistantStreamHandlers
): Promise<string> {
  const response = await fetch("/api/assistant/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: handlers.signal
  });
  if (!response.ok || !response.body) {
    const errorBody = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(errorBody.error || `AI 流式回答失败：${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || "";
    for (const block of blocks) {
      let event = "message";
      let data = "";
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;
      const payloadData = JSON.parse(data) as {
        text?: string;
        id?: string;
        label?: string;
        error?: string;
      };
      if (event === "delta" && payloadData.text) {
        fullText += payloadData.text;
        handlers.onDelta(payloadData.text, fullText);
      } else if (
        event === "stage" &&
        payloadData.id &&
        payloadData.label
      ) {
        handlers.onStage?.({
          id: payloadData.id,
          label: payloadData.label
        });
      } else if (event === "error") {
        throw new Error(payloadData.error || "AI 流式回答失败");
      }
    }
  }
  return fullText;
}
