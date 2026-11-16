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

function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err instanceof Error && err.name === "AbortError") return true;
  return false;
}

export async function streamAssistantAnswer(
  payload: AssistantStreamPayload,
  handlers: AssistantStreamHandlers
): Promise<string> {
  // 前置检查：如果已经 abort，直接退出
  if (handlers.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  let response: Response;
  try {
    response = await fetch("/api/assistant/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: handlers.signal
    });
  } catch (err) {
    if (isAbortError(err)) {
      throw new DOMException("Aborted", "AbortError");
    }
    throw err;
  }

  if (!response.ok || !response.body) {
    // abort 时后端可能返回不完整/非 JSON，保护 response.json()
    if (handlers.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    let errorMsg = "AI 流式回答失败";
    try {
      const body = (await response.json()) as { error?: string };
      errorMsg = body.error || errorMsg;
    } catch {
      // 忽略非 JSON 响应体
    }
    throw new Error(`${errorMsg}：${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  while (true) {
    // 每帧检查 abort，用户停止立即退出
    if (handlers.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    let readResult: ReadableStreamReadResult<Uint8Array>;
    try {
      readResult = await reader.read();
    } catch (err) {
      if (isAbortError(err)) {
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
      // 再次检查 abort（块解析也耗时间）
      if (handlers.signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      let event = "message";
      let data = "";
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;
      let payloadData: { text?: string; id?: string; label?: string; error?: string } = {};
      try {
        payloadData = JSON.parse(data);
      } catch {
        // SSE 块可能不完整，跳过不中断
        continue;
      }
      if (event === "delta" && payloadData.text) {
        fullText += payloadData.text;
        handlers.onDelta(payloadData.text, fullText);
      } else if (event === "stage" && payloadData.id && payloadData.label) {
        handlers.onStage?.({ id: payloadData.id, label: payloadData.label });
      } else if (event === "error") {
        throw new Error(payloadData.error || "AI 流式回答失败");
      }
    }
  }
  // 正常结束前 flush 剩余 buffer
  if (buffer.trim()) {
    try {
      const payloadData = JSON.parse(buffer.trim()) as { text?: string };
      if (payloadData.text) {
        fullText += payloadData.text;
        handlers.onDelta(payloadData.text, fullText);
      }
    } catch {
      /* 忽略 */
    }
  }
  return fullText;
}
