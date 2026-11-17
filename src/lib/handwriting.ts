import { recognizeMedicineImage } from "./ocr";

export function normalizeHandwritingText(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, "").trim())
    .filter((line) => line.length >= 2);
  return Array.from(new Set(lines))
    .sort((left, right) => right.length - left.length)[0]
    ?.slice(0, 200) || "";
}

export async function recognizeHandwritingImage(
  imageDataUrl: string,
  onProgress?: (label: string) => void
): Promise<string> {
  onProgress?.("正在识别手写内容…");
  try {
    const response = await fetch("/api/handwriting-identify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageDataUrl })
    });
    const payload = (await response.json()) as {
      text?: string;
      error?: string;
    };
    if (response.ok && payload.text?.trim()) {
      return normalizeHandwritingText(payload.text);
    }
  } catch {
    // Local OCR remains available when the model endpoint is offline.
  }

  onProgress?.("智能识别暂不可用，正在使用本地文字识别…");
  const draft = await recognizeMedicineImage(imageDataUrl);
  return normalizeHandwritingText(draft.rawText);
}
