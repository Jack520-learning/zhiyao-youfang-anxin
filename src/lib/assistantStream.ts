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
  agentTrace?: Array<{
    id: string;
    label: string;
    summary: string;
    durationMs: number;
  }>;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface AssistantStreamHandlers {
  onDelta: (text: string, fullText: string) => void;
  onStage?: (stage: { id: string; label: string }) => void;
  signal?: AbortSignal;
}

function isAbort(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err instanceof Error && err.name === "AbortError") return true;
  if (typeof err === "object" && err !== null) {
    const name = (err as { name?: unknown }).name;
    if (name === "AbortError") return true;
  }
  return false;
}

export async function streamAssistantAnswer(
  payload: AssistantStreamPayload,
  handlers: AssistantStreamHandlers
): Promise<string> {
  if (handlers.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  const response = await fetch("/api/assistant/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: handlers.signal
  });
  if (!response.ok || !response.body) {
    // 避免 abort 后 response.json() 抛 Unexpected end of JSON input
    if (handlers.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    let errorBody: { error?: string } = {};
    try {
      errorBody = (await response.json()) as { error?: string };
    } catch {
      /* 响应体不是合法 JSON，忽略 */
    }
    throw new Error(errorBody.error || `AI 流式回答失败：${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  while (true) {
    if (handlers.signal?.aborted) {
      // 主动 abort：抛出 AbortError，让调用方捕获并使用 fullText 截断
      throw new DOMException("Aborted", "AbortError");
    }
    let readResult: ReadableStreamReadResult<Uint8Array>;
    try {
      readResult = await reader.read();
    } catch (err) {
      if (isAbort(err)) {
        // fetch 层 abort 导致的 reader 拒绝
        throw new DOMException("Aborted", "AbortError");
      }
      throw err;
    }
    const { done, value } = readResult;
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
      let payloadData: {
        text?: string;
        id?: string;
        label?: string;
        error?: string;
      } = {};
      try {
        payloadData = JSON.parse(data);
      } catch {
        // 数据块不完整或解析失败，跳过
        continue;
      }
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
  // 结束前 flush 剩余 buffer
  if (buffer.trim()) {
    let payloadData: { text?: string } = {};
    try {
      payloadData = JSON.parse(buffer.trim());
    } catch {
      /* ignore */
    }
    if (payloadData.text) {
      fullText += payloadData.text;
      handlers.onDelta(payloadData.text, fullText);
    }
  }
  return fullText;
}
