import type { IntakeDraft } from "../types";
import { splitDosageText } from "./dosage";
import { nowIso } from "./time";

let workerPromise: Promise<import("tesseract.js").Worker> | undefined;

async function getWorker(onProgress?: (progress: number, label: string) => void) {
  if (!workerPromise) {
    workerPromise = import("tesseract.js").then(async ({ createWorker, OEM, PSM }) => {
      const worker = await createWorker("chi_sim", OEM.LSTM_ONLY, {
        workerPath: "/ocr/worker.min.js",
        corePath: "/ocr/core",
        langPath: "/ocr/lang",
        gzip: true,
        cacheMethod: "none",
        logger: (message) => {
          onProgress?.(
            Math.max(0, Math.min(1, message.progress || 0)),
            message.status
          );
        }
      });
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK
      });
      return worker;
    });
  }
  return workerPromise;
}

function extractDosage(text: string): string {
  const compact = text.replace(/\s+/g, "");
  const explicit = compact.match(
    /(?:每次|一次)(?:服用|使用|吃)?(\d+(?:\.\d+)?(?:mg|毫克|g|克|ml|毫升|片|粒|袋))/i
  );
  const measured = compact.match(
    /(\d+(?:\.\d+)?(?:mg|毫克|g|克|ml|毫升))\s*\/?\s*次?/i
  );
  const counted = compact.match(
    /(\d+(?:\.\d+)?(?:片|粒|袋))\s*\/?\s*次?/i
  );
  return (explicit?.[1] || measured?.[1] || counted?.[1] || "").replace(
    /\s+/g,
    ""
  );
}

function extractFrequency(text: string): string {
  const compact = text.replace(/\s+/g, "");
  const match = compact.match(
    /(每日\s*[一二三四1234两]\s*次|每天\s*[一二三四1234两]\s*次|每日一次|每日两次)/i
  );
  if (!match?.[1]) return "";
  const value = match[1]
    .replace("每天", "每日")
    .replace("每日一次", "每日 1 次")
    .replace("每日两次", "每日 2 次")
    .replace("一", "1")
    .replace("两", "2")
    .replace("二", "2")
    .replace("三", "3")
    .replace("四", "4")
    .replace(/\s+/g, " ");
  return value.replace(/每日\s*(\d)\s*次/, "每日 $1 次");
}

function extractRelation(text: string): string {
  const compact = text.replace(/\s+/g, "");
  if (/睡前/.test(compact)) return "睡前";
  if (/饭前|餐前/.test(compact)) return "饭前";
  if (/饭后|餐后/.test(compact)) return "饭后";
  if (/随餐|进餐时/.test(compact)) return "随餐";
  return "";
}

function extractName(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, "").trim())
    .filter(Boolean);
  const candidates = lines.filter(
    (line) =>
      !/(标签|规格|每日|每天|每次|饭前|饭后|餐前|餐后|睡前|仅用于)/.test(
        line
      )
  );
  const withDosageForm = candidates.find((line) =>
    /(片|胶囊|颗粒|口服液|滴丸|软膏|喷雾)$/.test(line)
  );
  const knownName = candidates.find((line) =>
    /(华法林|阿司匹林|胰岛素|氨氯地平)/.test(line)
  );
  return (knownName ?? withDosageForm ?? candidates[0] ?? "").slice(0, 32);
}

function extractTimes(text: string): string[] {
  const matches = text.match(/(?:[01]?\d|2[0-3])[:：][0-5]\d/g) ?? [];
  const times = [...new Set(matches.map((time) => time.replace("：", ":")))].slice(0, 4);
  return times.length ? times : ["08:00"];
}

function extractPrice(text: string): string {
  const compact = text.replace(/\s+/g, "");
  const match = compact.match(
    /(?:(?:参考价|零售价|价格|售价)[:：]?[¥￥]?|卖[¥￥]?|[¥￥])(\d+(?:\.\d{1,2})?)(?:元)?/
  ) ?? compact.match(/(\d+(?:\.\d{1,2})?)元/);
  return match ? `¥${match[1]}` : "";
}

export async function recognizeMedicineImage(
  imageDataUrl: string,
  onProgress?: (progress: number, label: string) => void
): Promise<IntakeDraft> {
  onProgress?.(0.02, "正在载入本地识别引擎");
  const worker = await getWorker(onProgress);
  const result = await worker.recognize(imageDataUrl);
  const text = result.data.text.trim();
  const confidence = Math.max(0, Math.min(1, (result.data.confidence || 0) / 100));
  const name = extractName(text);
  const dosage = extractDosage(text);
  const dosageDetails = splitDosageText(dosage);
  const frequency = extractFrequency(text);
  const relation = extractRelation(text);
  const times = extractTimes(text);
  const compactText = text.replace(/\s+/g, "");
  const knownIngredients = [
    "华法林",
    "阿司匹林",
    "氨氯地平",
    "胰岛素",
    "对乙酰氨基酚",
    "布洛芬",
    "二甲双胍"
  ].filter((ingredient) => compactText.includes(ingredient));
  const genericName = knownIngredients[0] ?? "";
  const fields = [
    {
      key: "name",
      value: /(片|胶囊|颗粒|口服液|滴丸|软膏|喷雾)$/.test(name) ? name : ""
    },
    { key: "dosage", value: dosageDetails.dosage },
    { key: "strength", value: dosageDetails.strength },
    { key: "packageSpec", value: dosageDetails.packageSpec },
    { key: "frequency", value: frequency },
    { key: "relation", value: relation },
    { key: "ingredientsText", value: knownIngredients.join("、") }
  ];
  const lowConfidenceFields = fields
    .filter((field) => !field.value || confidence < 0.72)
    .map((field) => field.key);

  return {
    imageDataUrl,
    rawText: text,
    name,
    genericName,
    ingredientsText: knownIngredients.join("、"),
    dosage: dosageDetails.dosage,
    strength: dosageDetails.strength,
    packageSpec: dosageDetails.packageSpec,
    frequency,
    times,
    relation,
    instructions: text.slice(0, 1200),
    price: extractPrice(text),
    confidence,
    lowConfidenceFields,
    createdAt: nowIso()
  };
}

export function createManualDraft(imageDataUrl?: string): IntakeDraft {
  return {
    imageDataUrl,
    rawText: "",
    name: "",
    genericName: "",
    ingredientsText: "",
    dosage: "",
    strength: "",
    packageSpec: "",
    frequency: "每日 1 次",
    times: ["08:00"],
    relation: "饭后",
    instructions: "",
    price: "",
    confidence: 0,
    lowConfidenceFields: ["name", "dosage", "frequency", "relation"],
    createdAt: nowIso()
  };
}
