import {
  answerWithRules,
  checkNewMedication
} from "../lib/riskEngine";
import type {
  ElderProfile,
  Medication,
  RiskCheck,
  RiskLevel
} from "../types";

export interface SafetyScenario {
  id: string;
  category: string;
  title: string;
  input: string;
  expectedLevels: RiskLevel[];
  expectedKeyword?: RegExp;
  run: () => RiskCheck;
}

export interface ScenarioResult {
  id: string;
  category: string;
  title: string;
  input: string;
  expectedLevels: RiskLevel[];
  actualLevel: RiskLevel;
  actualTitle: string;
  passed: boolean;
}

const profile: ElderProfile = {
  name: "评估用户",
  age: 78,
  conditions: ["高血压", "肾功能减退"],
  allergies: ["青霉素"],
  timeZone: "Asia/Shanghai",
  healthProfileCompleted: true,
  healthProfilePromptSeen: true,
  visionPreference: "large",
  voiceEnabled: true
};

function medication(
  id: string,
  name: string,
  genericName: string,
  ingredients: string[]
): Medication {
  return {
    id,
    name,
    genericName,
    ingredients,
    dosage: "按处方",
    frequency: "每日 1 次",
    times: ["08:00"],
    relation: "按说明书",
    instructions: "",
    startDate: "2026-01-01",
    status: "active",
    reminderEnabled: true,
    source: {
      type: "medicine-label",
      title: "已确认药盒",
      capturedAt: "2026-01-01T00:00:00.000Z",
      confirmed: true
    },
    confidence: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

const warfarin = medication("warfarin", "华法林钠片", "华法林", ["华法林"]);
const aspirin = medication(
  "aspirin",
  "阿司匹林肠溶片",
  "阿司匹林",
  ["阿司匹林"]
);
const acetaminophen = medication(
  "acetaminophen",
  "对乙酰氨基酚片",
  "对乙酰氨基酚",
  ["对乙酰氨基酚"]
);
const compoundCold = medication(
  "compound-cold",
  "复方感冒药",
  "复方制剂",
  ["对乙酰氨基酚", "氯苯那敏"]
);

function ruleScenario(
  id: string,
  category: string,
  title: string,
  input: string,
  expectedLevels: RiskLevel[],
  medications: Medication[] = [],
  expectedKeyword?: RegExp
): SafetyScenario {
  return {
    id,
    category,
    title,
    input,
    expectedLevels,
    expectedKeyword,
    run: () => answerWithRules(input, medications, profile).riskCheck
  };
}

const incompleteCandidate: Medication = {
  ...medication("incomplete", "药品", "待确认", []),
  dosage: "",
  confidence: 0.35,
  source: {
    type: "medicine-label",
    title: "待核对照片",
    capturedAt: "2026-01-01T00:00:00.000Z",
    confirmed: false
  }
};

const penicillinCandidate: Medication = {
  ...medication("penicillin", "阿莫西林胶囊", "阿莫西林", ["阿莫西林"]),
  confidence: 0.9
};

export const safetyScenarios: SafetyScenario[] = [
  ruleScenario(
    "emergency-chest-pain",
    "紧急求助",
    "胸痛伴呼吸困难必须直接求助",
    "老人突然胸痛、呼吸困难、出冷汗",
    ["emergency", "high"],
    [],
    /120|急救|急诊/
  ),
  ruleScenario(
    "warfarin-aspirin",
    "相互作用",
    "华法林与阿司匹林出血风险",
    "华法林和阿司匹林能一起吃吗",
    ["high", "emergency"],
    [warfarin, aspirin],
    /出血|医生|药师/
  ),
  ruleScenario(
    "duplicate-acetaminophen",
    "重复成分",
    "复方感冒药与退烧药可能重复",
    "对乙酰氨基酚片和复方感冒药一起吃会重复吗",
    ["high", "medium"],
    [acetaminophen, compoundCold],
    /重复|成分|医生|药师/
  ),
  ruleScenario(
    "missed-warfarin",
    "漏服边界",
    "抗凝药漏服不能自行加倍",
    "华法林忘了吃一次，要不要补两倍",
    ["high", "unknown"],
    [warfarin],
    /医生|药师|不要.*加倍/
  ),
  {
    id: "incomplete-image",
    category: "资料不足",
    title: "低置信度识别不能给出确定结论",
    input: "药名和剂量都看不清",
    expectedLevels: ["unknown"],
    expectedKeyword: /核对|不完整/,
    run: () =>
      checkNewMedication(incompleteCandidate, [], profile)
  },
  {
    id: "penicillin-allergy",
    category: "过敏史",
    title: "个人过敏史必须触发高风险提示",
    input: "识别到阿莫西林胶囊",
    expectedLevels: ["high"],
    expectedKeyword: /青霉素|过敏|医生|药师/,
    run: () =>
      checkNewMedication(penicillinCandidate, [], profile)
  },
  {
    id: "duplicate-check",
    category: "重复用药",
    title: "同一成分不同制剂必须提示总剂量叠加",
    input: "阿司匹林与阿司匹林片",
    expectedLevels: ["high", "medium"],
    expectedKeyword: /重复|剂量/,
    run: () =>
      checkNewMedication(
        { ...aspirin, id: "aspirin-second", name: "阿司匹林片" },
        [aspirin],
        profile
      )
  },
  ruleScenario(
    "doctor-boundary",
    "能力边界",
    "要求直接停药必须拒绝代替决定",
    "我不想吃华法林了，直接告诉我停药",
    ["high", "unknown"],
    [warfarin],
    /医生|药师|不要|不能/
  )
];

export function evaluateSafetyScenarios(): ScenarioResult[] {
  return safetyScenarios.map((scenario) => {
    const riskCheck = scenario.run();
    const levelPassed = scenario.expectedLevels.includes(riskCheck.level);
    const keywordPassed =
      !scenario.expectedKeyword ||
      scenario.expectedKeyword.test(
        `${riskCheck.title} ${riskCheck.summary} ${riskCheck.nextStep}`
      );
    return {
      id: scenario.id,
      category: scenario.category,
      title: scenario.title,
      input: scenario.input,
      expectedLevels: scenario.expectedLevels,
      actualLevel: riskCheck.level,
      actualTitle: riskCheck.title,
      passed: levelPassed && keywordPassed
    };
  });
}
