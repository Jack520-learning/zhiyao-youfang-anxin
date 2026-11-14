export type DosageFormKey =
  | "sustained-capsule"
  | "enteric-tablet"
  | "sublingual-tablet"
  | "granules"
  | "capsule"
  | "tablet"
  | "powder";

const formRules: Array<{
  pattern: RegExp;
  key: DosageFormKey;
  label: string;
}> = [
  { pattern: /缓释胶囊/, key: "sustained-capsule", label: "缓释胶囊" },
  { pattern: /肠溶片/, key: "enteric-tablet", label: "肠溶片" },
  { pattern: /舌下片/, key: "sublingual-tablet", label: "舌下片" },
  { pattern: /颗粒|冲剂/, key: "granules", label: "颗粒剂" },
  { pattern: /胶囊/, key: "capsule", label: "胶囊" },
  { pattern: /片剂|片/, key: "tablet", label: "片剂" },
  { pattern: /散剂|散/, key: "powder", label: "散剂" },
];

export function detectDosageForm(value: string): {
  key: DosageFormKey;
  label: string;
} | null {
  const normalized = value.replace(/\s/g, "");
  for (const rule of formRules) {
    if (rule.pattern.test(normalized)) {
      return { key: rule.key, label: rule.label };
    }
  }
  return null;
}
