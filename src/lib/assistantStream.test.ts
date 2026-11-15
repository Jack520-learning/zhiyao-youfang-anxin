import { afterEach, describe, expect, it, vi } from "vitest";
import { streamAssistantAnswer } from "./assistantStream";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("assistant streaming", () => {
  it("renders delta events and exposes tool stages", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'event: stage\ndata: {"id":"grounding","label":"已载入资料"}\n\n'
          )
        );
        controller.enqueue(
          encoder.encode('event: delta\ndata: {"text":"结论："}\n\n')
        );
        controller.enqueue(
          encoder.encode('event: delta\ndata: {"text":"请按说明书"}\n\n')
        );
        controller.enqueue(
          encoder.encode('event: done\ndata: {"mode":"llm"}\n\n')
        );
        controller.close();
      }
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(body, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" }
        })
      )
    );
    const deltas: string[] = [];
    const stages: string[] = [];

    const answer = await streamAssistantAnswer(
      {
        query: "这个药怎么吃",
        profile: { age: 70, conditions: [], allergies: [] },
        medications: [],
        evidence: [],
        riskLevel: "low",
        groundingText: "按说明书使用",
        answerMode: "safety",
        history: []
      },
      {
        onDelta: (_delta, fullText) => deltas.push(fullText),
        onStage: (stage) => stages.push(stage.label)
      }
    );

    expect(answer).toBe("结论：请按说明书");
    expect(deltas.at(-1)).toBe(answer);
    expect(stages).toEqual(["已载入资料"]);
  });
});
