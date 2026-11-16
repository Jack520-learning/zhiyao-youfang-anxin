export function toChineseErrorMessage(
  error: unknown,
  fallback = "操作没有完成，请稍后重试。"
): string {
  const message =
    error instanceof Error
      ? error.message.trim()
      : typeof error === "string"
        ? error.trim()
        : "";
  if (
    /fetch failed|failed to fetch|networkerror|load failed|network request failed|connection refused/i.test(
      message
    )
  ) {
    return "网络连接失败，请检查网络后重试。";
  }
  if (/abort|timeout|timed out|operation was aborted/i.test(message)) {
    return "请求超时，请稍后重试。";
  }
  if (/\p{Script=Han}/u.test(message)) return message;
  return fallback;
}
