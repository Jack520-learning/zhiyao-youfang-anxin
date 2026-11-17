import type { IntakeDraft } from "../types";
import {
  findBestMedicine,
  findCatalogMedicineForRecognition
} from "../catalog/retrieval";
import { splitDosageText } from "./dosage";
import { prepareImageForOcr } from "./image";
import { nowIso } from "./time";

let workerPromise: Promise<import("tesseract.js").Worker> | undefined;
const progressListeners = new Set<
  (progress: number, label: string) => void
>();

function translateStatus(status: string): string {
  if (/loading language traineddata/i.test(status)) return "正在加载中文识别资料";
  if (/initializing api/i.test(status)) return "正在初始化文字识别";
  if (/recognizing text/i.test(status)) return "正在逐行识别药品文字";
  if (/loading tesseract core/i.test(status)) return "正在载入识别引擎";
  return status ? "正在识别图片内容" : "准备识别";
}

async function getWorker() {
  if (!workerPromise) {
    workerPromise = import("tesseract.js").then(async ({ createWorker, OEM, PSM }) => {
      const worker = await createWorker("chi_sim", OEM.LSTM_ONLY, {
        workerPath: "/ocr/worker.min.js",
        corePath: "/ocr/core",
        langPath: "/ocr/lang",
        gzip: true,
        cacheMethod: "none",
        logger: (message) => {
          const progress = Math.max(0, Math.min(1, message.progress || 0));
          const label = translateStatus(message.status || "");
          for (const listener of progressListeners) listener(progress, label);
        }
      });
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
        preserve_interword_spaces: "1",
        user_defined_dpi: "300"
      });
      return worker;
    });
  }
  return workerPromise;
}

function extractDosage(text: string): string {
  const compact = text.replace(/\s+/g, "");
  const unit = "(?:mg|毫克|g|克|ml|毫升|片|粒|袋|滴)";
  const explicit = compact.match(
    new RegExp(
      `(?:每次|一次)(?:服用|使用|吃|口服)?(\\d+(?:\\.\\d+)?${unit})`,
      "i"
    )
  );
  const perDose = compact.match(
    new RegExp(`(\\d+(?:\\.\\d+)?${unit})(?:/|每)(?:次|日)`, "i")
  );
  return (explicit?.[1] || perDose?.[1] || "").replace(/\s+/g, "");
}

function extractFrequency(text: string): string {
  const compact = text.replace(/\s+/g, "");
  const match = compact.match(
    /(?:(?:每日|每天|一日|1日)\s*([一二三四1234两])\s*次|(每日一|每日两)次)/i
  );
  if (!match) return "";
  const chineseDigits: Record<string, string> = {
    一: "1",
    两: "2",
    二: "2",
    三: "3",
    四: "4"
  };
  const rawCount =
    match[1] || (match[2] === "每日一" ? "一" : match[2] === "每日两" ? "两" : "");
  const count = rawCount.replace(
    /[一二三四两]/g,
    (digit) => chineseDigits[digit]
  );
  return count ? `每日 ${count} 次` : "";
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
  const candidates = text
    .split(/\r?\n/)
    .map(normalizeOcrLine)
    .filter(isMedicineNameLine);
  for (const line of candidates) {
    const catalogMedicine = findCatalogMedicineForRecognition(line, 0.56);
    if (catalogMedicine) {
      return catalogMedicine.displayName;
    }
  }
  return (
    candidates.find((line) =>
      /(片|胶囊|颗粒|口服液|滴丸|散|软膏|乳膏|喷雾|滴眼液|注射液|栓|贴)/.test(
        line
      )
    ) ||
    candidates[0] ||
    ""
  ).slice(0, 40);
}

function normalizeOcrLine(value: string): string {
  return value
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/[：:]/g, "")
    .replace(/\s+/g, "")
    .replace(/^[|丨]+|[|丨]+$/g, "")
    .trim();
}

function isMedicineNameLine(line: string): boolean {
  if (line.length < 2 || line.length > 40) return false;
  if (
    /(国药准字|批准文号|生产企业|生产日期|有效期|产品批号|规格|用法用量|不良反应|禁忌|贮藏|说明书|请仔细阅读|仅供|有限公司|制药|药业|大药房)/.test(
      line
    )
  ) {
    return false;
  }
  if (/^\d+(?:\.\d+)?(?:mg|g|ml|片|粒|袋|支)/i.test(line)) return false;
  return /[\u3400-\u9fff]/.test(line);
}

export function extractRecognizedMedicineNames(
  text: string,
  limit = 10
): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = normalizeOcrLine(rawLine);
    if (!isMedicineNameLine(line)) continue;
    const catalogMedicine = findCatalogMedicineForRecognition(line, 0.56);
    const name =
      catalogMedicine
        ? catalogMedicine.displayName
        : /(片|胶囊|颗粒|口服液|滴丸|散|软膏|乳膏|喷雾|滴眼液|注射液|栓|贴)/.test(
              line
            )
          ? line
          : "";
    const key = name.replace(/[（(].*?[）)]/g, "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    names.push(key);
    if (names.length >= limit) break;
  }
  return names;
}

export function hasMedicineTextEvidence(text: string): boolean {
  const compact = text.replace(/\s+/g, "");
  if (
    /(国药准字|批准文号|药品名称|说明书|处方笺|片剂|胶囊|颗粒|口服液|滴丸|软膏|乳膏|滴眼液|注射液|mg|毫克|ml)/i.test(
      compact
    )
  ) {
    return true;
  }
  if (extractRecognizedMedicineNames(text).length > 0) return true;
  return /[\u3400-\u9fff]{2,}(?:片|胶囊|颗粒|散|膏|液|丸|栓|贴)/.test(
    compact
  );
}

function extractStrength(text: string): string {
  const compact = text.replace(/\s+/g, "");
  const numbered = compact.match(
    /(\d+(?:\.\d+)?(?:mg|毫克|g|克|ml|毫升|μg|ug|微克))\s*(?:[/／]\s*(?:片|粒|袋|支|ml|毫升))?/i
  );
  return numbered?.[1] || "";
}

function extractPackageSpec(text: string): string {
  const compact = text.replace(/\s+/g, "");
  const direct = compact.match(
    /(\d+(?:\.\d+)?)(片|粒|袋|支|瓶|板|包)\s*[/／]\s*(盒|瓶|袋|包|板)/i
  );
  if (direct) return `${direct[1]}${direct[2]}/${direct[3]}`;
  const multiplied = compact.match(
    /(?:\d+(?:\.\d+)?(?:mg|毫克|g|克|ml|毫升))[×xX*](\d+(?:\.\d+)?)(片|粒|袋|支|瓶|板|包)/i
  );
  return multiplied ? `${multiplied[1]}${multiplied[2]}` : "";
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
  if (onProgress) progressListeners.add(onProgress);
  onProgress?.(0.02, "正在载入本地识别引擎");
  try {
    const worker = await getWorker();
    const { PSM } = await import("tesseract.js");
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      preserve_interword_spaces: "1",
      user_defined_dpi: "300"
    });
    const primaryImage = await prepareImageForOcr(imageDataUrl);
    const primary = await worker.recognize(primaryImage);
    let recognized = {
      text: primary.data.text.trim(),
      confidence: primary.data.confidence || 0
    };
    if (ocrQuality(recognized.text, recognized.confidence) < 0.88) {
      onProgress?.(0.72, "正在增强文字对比并复核药名");
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SPARSE_TEXT,
        preserve_interword_spaces: "1",
        user_defined_dpi: "300"
      });
      const enhancedImage = await prepareImageForOcr(imageDataUrl, {
        enhanced: true
      });
      const enhanced = await worker.recognize(enhancedImage);
      const enhancedResult = {
        text: enhanced.data.text.trim(),
        confidence: enhanced.data.confidence || 0
      };
      recognized = {
        text: mergeOcrText(recognized.text, enhancedResult.text),
        confidence: Math.max(
          recognized.confidence,
          enhancedResult.confidence
        )
      };
    }
    onProgress?.(1, "文字识别完成");
    return parseRecognitionText(
      imageDataUrl,
      recognized.text,
      recognized.confidence
    );
  } finally {
    if (onProgress) progressListeners.delete(onProgress);
  }
}

function mergeOcrText(primary: string, secondary: string): string {
  const compactPrimary = primary.replace(/\s+/g, "");
  const compactSecondary = secondary.replace(/\s+/g, "");
  if (!compactSecondary || compactPrimary === compactSecondary) return primary;
  if (!compactPrimary) return secondary;
  return `${primary}\n${secondary}`;
}

function ocrQuality(text: string, confidence: number): number {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 2);
  const usefulText =
    lines.length * 0.035 +
    Math.min(0.12, (text.match(/[\u3400-\u9fff]/g)?.length || 0) / 180);
  const catalogBonus = findBestMedicine(text) ? 0.08 : 0;
  return Math.max(0, Math.min(1, confidence / 100 + usefulText + catalogBonus));
}

export function parseRecognitionText(
  imageDataUrl: string,
  rawText: string,
  rawConfidence: number
): IntakeDraft {
  const text = rawText.trim();
  const confidence = Math.max(0, Math.min(1, rawConfidence / 100));
  const name = extractName(text);
  const dosage = extractDosage(text);
  const strength = extractStrength(text);
  const packageSpec = extractPackageSpec(text);
  const dosageDetails = splitDosageText(dosage);
  const frequency = extractFrequency(text);
  const relation = extractRelation(text);
  const times = extractTimes(text);
  const catalogMedicine = findCatalogMedicineForRecognition(name || text, 0.56);
  const genericName =
    catalogMedicine
      ? catalogMedicine.activeIngredient
      : "";
  const ingredientsText =
    catalogMedicine
      ? catalogMedicine.activeIngredient
      : "";
  const fields = [
    {
      key: "name",
      value: name
    },
    { key: "dosage", value: dosageDetails.dosage },
    { key: "strength", value: dosageDetails.strength || strength },
    { key: "packageSpec", value: dosageDetails.packageSpec || packageSpec },
    { key: "frequency", value: frequency },
    { key: "relation", value: relation },
    { key: "ingredientsText", value: ingredientsText }
  ];
  const lowConfidenceFields = fields
    .filter((field) => !field.value || confidence < 0.72)
    .map((field) => field.key);

  return {
    imageDataUrl,
    rawText: text,
    name,
    genericName,
    ingredientsText,
    dosage: dosageDetails.dosage,
    strength: dosageDetails.strength || strength,
    packageSpec: dosageDetails.packageSpec || packageSpec,
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
