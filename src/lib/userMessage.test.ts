import { describe, expect, it } from "vitest";
import { toChineseErrorMessage } from "./userMessage";

describe("user-facing error messages", () => {
  it("translates network failures", () => {
    expect(toChineseErrorMessage(new TypeError("fetch failed"))).toBe(
      "网络连接失败，请检查网络后重试。"
    );
  });

  it("translates timeouts and keeps Chinese service messages", () => {
    expect(toChineseErrorMessage(new Error("operation was aborted"))).toBe(
      "请求超时，请稍后重试。"
    );
    expect(toChineseErrorMessage(new Error("语音识别服务暂时不可用"))).toBe(
      "语音识别服务暂时不可用"
    );
  });

  it("replaces unknown English errors with a Chinese fallback", () => {
    expect(toChineseErrorMessage(new Error("internal server error"), "请重试")).toBe(
      "请重试"
    );
  });
});
