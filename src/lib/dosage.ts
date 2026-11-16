export interface ValidationResult {
  valid: boolean;
  message?: string;
}

const dosagePattern = /(\d+(?:\.\d+)?)\s*(mg|毫克|g|克|ml|毫升|片|粒|袋|滴)/gi;

export function validateDosageText(value: string): ValidationResult {
  const text = value.trim();
  if (!text) return { valid: false, message: "请填写每次服用剂量" };
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
