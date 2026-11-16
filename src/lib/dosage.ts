export interface ValidationResult {
  valid: boolean;
  message?: string;
}

const dosagePattern = /(\d+(?:\.\d+)?)\s*(mg|毫克|g|克|ml|毫升|片|粒|袋|滴)/gi;
const strengthPattern =
  /(\d+(?:\.\d+)?)\s*(mg|毫克|g|克|ml|毫升|μg|ug|微克)\s*\/\s*(片|粒|袋|支|ml|毫升)/i;
const packagePattern =
  /(\d+(?:\.\d+)?)\s*(片|粒|袋|支|瓶|板|包)\s*\/\s*(盒|瓶|袋|包|板)/i;

export function splitDosageText(value: string): {
  dosage: string;
  strength: string;
  packageSpec: string;
} {
  const source = value.trim();
  const strengthMatch = source.match(strengthPattern);
  const packageMatch = source.match(packagePattern);
  let dosage = source;
  for (const match of [strengthMatch?.[0], packageMatch?.[0]].filter(
    (item): item is string => Boolean(item)
  )) {
    dosage = dosage.replace(match, "");
  }
  return {
    dosage: dosage
      .replace(/^[\s,，;；/]+|[\s,，;；/]+$/g, "")
      .replace(/[\s,，;；]+/g, " ")
      .trim(),
    strength: strengthMatch?.[0]?.replace(/\s+/g, "") ?? "",
    packageSpec: packageMatch?.[0]?.replace(/\s+/g, "") ?? ""
  };
}

export function validateDosageText(value: string): ValidationResult {
  const details = splitDosageText(value);
  const text = details.dosage;
  if (!text) {
    return {
      valid: false,
      message:
        details.strength || details.packageSpec
          ? "这里必须填写每次实际服用剂量；单片规格和包装数量已单独记录"
          : "请填写每次实际服用剂量，例如 1片、0.5mg 或 10ml"
    };
  }
  const matches = [...text.matchAll(dosagePattern)];
  if (!matches.length) {
    return {
      valid: false,
      message: "剂量需要包含数字和单位，例如 5mg、1片或10ml"
    };
  }

  for (const match of matches) {
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (!Number.isFinite(amount) || amount <= 0) {
      return { valid: false, message: "剂量必须大于 0" };
    }
    const upperLimit =
      unit === "片" || unit === "粒" || unit === "袋"
        ? 20
        : unit === "滴"
          ? 100
          : unit === "g" || unit === "克"
            ? 20
            : unit === "mg" || unit === "毫克"
              ? 5000
              : 500;
    if (amount > upperLimit) {
      return {
        valid: false,
        message: `单次剂量超出可填写范围（最多 ${upperLimit}${match[2]}），请核对单位是否填错`
      };
    }
  }
  return { valid: true };
}

export const frequencyOptions = [
  { label: "每日 1 次", value: "每日 1 次", count: 1 },
  { label: "每日 2 次", value: "每日 2 次", count: 2 },
  { label: "每日 3 次", value: "每日 3 次", count: 3 },
  { label: "每日 4 次", value: "每日 4 次", count: 4 },
  { label: "按需服用", value: "按需服用", count: 0 }
];

export function isAsNeededFrequency(frequency: string): boolean {
  return frequency.trim() === "按需服用";
}

export function resizeTimes(times: string[], count: number): string[] {
  return Array.from({ length: count }, (_, index) => times[index] ?? "");
}

export function applyFrequencySelection(
  times: string[],
  frequencyValue: string
): { frequency: string; times: string[] } {
  const option = frequencyOptions.find((item) => item.value === frequencyValue);
  return {
    frequency: option?.value ?? frequencyValue,
    times: resizeTimes(times, option?.count ?? 1)
  };
}

export function validateTimes(times: string[]): ValidationResult {
  if (!times.length) return { valid: false, message: "请至少添加一个用药时间" };
  if (times.length > 6) {
    return { valid: false, message: "每日最多设置 6 个用药时间" };
  }
  if (times.some((time) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) {
    return { valid: false, message: "请填写完整的用药时间" };
  }
  if (new Set(times).size !== times.length) {
    return { valid: false, message: "每天的用药时间不能重复" };
  }
  return { valid: true };
}
