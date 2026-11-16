import knowledgeData from "../../shared/knowledge.json";
import type {
  AssistantResponse,
  ElderProfile,
  KnowledgeSource,
  Medication,
  RiskCheck,
  RiskLevel,
  SharedKnowledgeBase
} from "../types";
import { createId } from "./ids";
import { nowIso } from "./time";
import { findSafetyTopics } from "../catalog/safetyTopics";
import {
  findConditionGuidance,
  formatConditionGuidance
} from "../catalog/conditionGuidance";

export const knowledge = knowledgeData as SharedKnowledgeBase;

interface RiskDecision {
  level: RiskLevel;
  title: string;
  summary: string;
  nextStep: string;
  reasons: string[];
  sourceIds: string[];
  involvedMedicationIds: string[];
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/\s+/g, "")
    .replaceAll(/[，。！？、,.!?；;：:（）()]/g, "");
}

function medicationText(medication: Medication): string {
  return normalize(
    [
      medication.name,
      medication.genericName,
      ...medication.ingredients,
      medication.instructions
    ].join(" ")
  );
}

const allergyGroups = [
  ["青霉素", "阿莫西林", "氨苄西林", "哌拉西林", "青霉素v"],
  ["头孢", "头孢氨苄", "头孢克肟", "头孢呋辛", "头孢地尼"],
  ["磺胺", "磺胺甲噁唑", "复方磺胺甲噁唑"],
  ["阿司匹林", "乙酰水杨酸"]
];

function allergyMatchesText(allergy: string, text: string): boolean {
  const normalizedAllergy = normalize(allergy);
  if (!normalizedAllergy) return false;
  if (text.includes(normalizedAllergy)) return true;
  const group = allergyGroups.find((terms) =>
    terms.some((term) => normalizedAllergy.includes(normalize(term)))
  );
  return Boolean(
    group?.some((term) => text.includes(normalize(term)))
  );
}

export function findSource(sourceId: string): KnowledgeSource | undefined {
  return knowledge.sources.find((source) => source.id === sourceId);
}

export function sourcesFor(sourceIds: string[]): KnowledgeSource[] {
  return sourceIds
    .map((sourceId) => findSource(sourceId))
    .filter((source): source is KnowledgeSource => Boolean(source));
}

export function findHighRiskMedication(medication: Medication) {
  const text = medicationText(medication);
  return knowledge.highRiskMedications.find((item) =>
    [item.name, ...item.aliases].some((term) => text.includes(normalize(term)))
  );
}

function pairInteraction(left: Medication, right: Medication) {
  const text = `${medicationText(left)}|${medicationText(right)}`;
  return knowledge.interactionRules.find((rule) =>
    rule.terms.every((term) => text.includes(normalize(term)))
  );
}

function makeCheck(
  decision: RiskDecision,
  medications: Medication[]
): RiskCheck {
  return {
    id: createId("risk"),
    level: decision.level,
    title: decision.title,
    summary: decision.summary,
    nextStep: decision.nextStep,
    reasons: decision.reasons,
    sourceIds: decision.sourceIds,
    involvedMedicationIds: decision.involvedMedicationIds,
    medicationSnapshot: medications.map((medication) => medication.name),
    createdAt: nowIso()
  };
}

export function checkNewMedication(
  candidate: Medication,
  currentMedications: Medication[],
  profile: ElderProfile
): RiskCheck {
  const current = currentMedications.filter(
    (medication) =>
      medication.status === "active" && medication.id !== candidate.id
  );
  const allMedications = [...current, candidate];

  if (
    candidate.confidence < 0.72 ||
    !candidate.source.confirmed ||
    !candidate.name.trim() ||
    !candidate.dosage.trim()
  ) {
    return makeCheck(
      {
        level: "unknown",
        title: "识别结果还需要人工核对",
        summary:
          "药名、剂量或识别置信度还不完整，暂时不能据此给出确定的风险结论。",
        nextStep:
          "请查看原图并修改药名、剂量、次数和服用时间，确认后再重新进行安全核查。",
        reasons: ["识别字段未达到可信阈值"],
        sourceIds: ["src-no-evidence"],
        involvedMedicationIds: [candidate.id]
      },
      allMedications
    );
  }

  const allergy = profile.allergies.find((item) =>
    allergyMatchesText(item, medicationText(candidate))
  );
  if (allergy) {
    return makeCheck(
      {
        level: "high",
        title: "发现需要专业核对的过敏信息",
        summary: `当前档案记录了对“${allergy}”的过敏信息，新药资料中也出现了相关成分。`,
        nextStep: "不要自行服用这盒新药，请让医生或药师核对过敏史和处方。",
        reasons: [`档案过敏项：${allergy}`],
        sourceIds: ["src-no-evidence"],
        involvedMedicationIds: [candidate.id]
      },
      allMedications
    );
  }

  const interaction = current
    .map((medication) => pairInteraction(candidate, medication))
    .find(Boolean);
  if (interaction) {
    return makeCheck(
      {
        level: interaction.riskLevel,
        title: interaction.title,
        summary: interaction.summary,
        nextStep: interaction.nextStep,
        reasons: [
          `触发药物：${candidate.name}`,
          `当前药物：${current
            .filter((medication) =>
              pairInteraction(candidate, medication)?.id === interaction.id
            )
            .map((medication) => medication.name)
            .join("、")}`
        ],
        sourceIds: interaction.sourceIds,
        involvedMedicationIds: [
          candidate.id,
          ...current
            .filter((medication) =>
              pairInteraction(candidate, medication)?.id === interaction.id
            )
            .map((medication) => medication.id)
        ]
      },
      allMedications
    );
  }

  const duplicate = current.find((medication) =>
    medication.ingredients.some((ingredient) =>
      candidate.ingredients.some(
        (candidateIngredient) =>
          normalize(candidateIngredient) === normalize(ingredient) ||
          normalize(candidateIngredient).includes(normalize(ingredient)) ||
          normalize(ingredient).includes(normalize(candidateIngredient))
      )
    )
  );
  if (duplicate) {
    return makeCheck(
      {
        level: "medium",
        title: "发现可能重复的用药成分",
        summary: `新药和“${duplicate.name}”可能有重复成分，需要先核对通用名与单次剂量。`,
        nextStep: "在核对清楚前先不要叠加服用，可以联系医生或药师确认。",
        reasons: ["检测到相同或相近的有效成分"],
        sourceIds: ["src-duplicate-ingredient"],
        involvedMedicationIds: [candidate.id, duplicate.id]
      },
      allMedications
    );
  }

  return makeCheck(
    {
      level: "low",
      title: "当前已确认资料中未发现已知冲突",
      summary: "系统已完成当前清单、过敏史和安全规则的交叉核对，但这不等于绝对安全。",
      nextStep: "请继续按处方或说明书使用；若资料不完整，先补充后再确认。",
      reasons: ["未命中当前高危规则", "未发现重复成分或档案过敏项"],
      sourceIds: ["src-no-evidence"],
      involvedMedicationIds: [candidate.id]
    },
    allMedications
  );
}

export function handleMissedDose(
  medication: Medication,
  currentMedications: Medication[]
): RiskCheck {
  const highRisk = findHighRiskMedication(medication);
  if (highRisk) {
    return makeCheck(
      {
        level: "high",
        title: "这类药不能按通用规则自行补服",
        summary: `“${medication.name}”属于需要谨慎处理的高危药物。`,
        nextStep:
          "不要自行加倍补服、停药或调整剂量。请按处方或说明书处理，并联系开药医生或药师。",
        reasons: ["命中高危药物停止线", "系统不会生成具体补服剂量"],
        sourceIds: highRisk.sourceIds,
        involvedMedicationIds: [medication.id]
      },
      currentMedications
    );
  }

  return makeCheck(
    {
      level: "unknown",
      title: "先不要自行补服或加倍",
      summary:
        "当前知识库没有覆盖这款药的具体漏服规则，不能替您决定补不补。",
      nextStep:
        "请查看处方或说明书上的漏服说明；找不到时联系开药医生或药师。",
      reasons: ["缺少经确认的漏服规则"],
      sourceIds: ["src-no-evidence"],
      involvedMedicationIds: [medication.id]
    },
    currentMedications
  );
}

function findArticle(query: string) {
  const normalized = normalize(query);
  return knowledge.articles.find((article) =>
    article.terms.some((term) => normalized.includes(normalize(term)))
  );
}

export type AnswerMode = "quick" | "safety" | "detailed";

function questionHeading(query: string): string {
  const normalized = normalize(query);
  if (/胸痛|呼吸困难|喘不上|意识不清|昏迷|抽搐|大出血/.test(normalized)) {
    return "紧急情况先这样处理";
  }
  if (/漏服|忘了吃|忘记吃|少吃一次|补服|补吃/.test(normalized)) {
    return "这次漏服怎么处理";
  }
  if (/一起吃|同服|联用|相互作用|能不能配/.test(normalized)) {
    return "这几款药能否同服";
  }
  if (/多少钱|价格|价钱|最便宜|哪里买|购买/.test(normalized)) {
    return "价格与购买核对";
  }
  if (/副作用|不良反应|难受|不舒服/.test(normalized)) {
    return "服药后的不适怎么判断";
  }
  if (/怎么吃|怎么用|什么时候吃|几点吃|饭前|饭后|吃几次|剂量|用量/.test(normalized)) {
    return "具体服药方法";
  }
  if (/禁忌|禁用|不能吃|不适合/.test(normalized)) {
    return "这款药的禁忌与注意";
  }
  if (/该注意|注意什么|注意哪些|日常注意|平时注意/.test(normalized)) {
    return "日常注意事项";
  }
  if (/能.*吗|可以.*吗|要不要|该不该/.test(normalized)) {
    return "这个问题怎么判断";
  }
  return "本次答复";
}

export function buildRulesMessage(
  check: RiskCheck,
  mode: AnswerMode,
  query = ""
): string {
  const levelLabel = check.level === "emergency"
    ? "紧急"
    : check.level === "high"
      ? "高"
      : check.level === "medium"
        ? "中"
        : check.level === "low"
          ? "低"
          : "未明确";

  if (mode === "quick") {
    const firstSentence = check.summary.split(/[。！？\n]/)[0] || check.summary;
    const firstStep = check.nextStep.split(/[。！？\n]/)[0] || check.nextStep;
    return `直接回答：${firstSentence}。${firstStep}。`.trim();
  }

  if (mode === "detailed") {
    const reasonsBlock = check.reasons?.length
      ? `\n\n### 判断依据\n${check.reasons.map((r) => `- ${r}`).join("\n")}`
      : "";
    return [
      `## ${questionHeading(query)}的详细说明`,
      `**风险等级：${levelLabel}**`,
      "### 完整解释",
      check.summary,
      reasonsBlock,
      "### 现在应该做什么",
      check.nextStep,
      "### 需要注意",
      "以上内容基于当前档案、说明书信息和确定性安全规则生成；个体诊断、停药和剂量调整仍需医生或药师确认。"
    ].join("\n\n");
  }

  const urgent =
    check.level === "high" || check.level === "emergency"
      ? "**需要优先处理：**"
      : "";
  const safetyReason = check.reasons?.[0]
    ? `\n\n### 为什么\n- ${check.reasons[0]}`
    : "";
  return [
    `## ${questionHeading(query)}的安全要点`,
    `${urgent}${check.summary}`,
    safetyReason.trim(),
    "### 现在先做",
    `- ${check.nextStep}`
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function answerWithRules(
  query: string,
  currentMedications: Medication[],
  profile: ElderProfile,
  options?: { missedMedication?: Medication; answerMode?: AnswerMode }
): AssistantResponse {
  const started = nowIso();
  void started;
  const mode: AnswerMode = options?.answerMode || "safety";

  if (options?.missedMedication) {
    const check = handleMissedDose(options.missedMedication, currentMedications);
    return {
      message: buildRulesMessage(check, mode, query),
      riskCheck: check,
      stages: [
        { id: "intent", label: "识别漏服问题", status: "done" },
        { id: "profile", label: "读取当前用药", status: "done" },
        { id: "risk", label: "应用高危药物停止线", status: "done" }
      ],
      mode: "rules"
    };
  }

  const normalizedQuery = normalize(query);
  const isEmergency = knowledge.emergencyKeywords.some((keyword) =>
    normalizedQuery.includes(normalize(keyword))
  );
  if (isEmergency) {
    const article = knowledge.articles.find((item) => item.id === "emergency-symptoms");
    const check = makeCheck(
      {
        level: "emergency",
        title: article?.title ?? "先处理紧急身体状态",
        summary: article?.plainText ?? "请立即获得急救帮助。",
        nextStep: "马上叫身边的人帮忙，并拨打 120。",
        reasons: ["识别到紧急身体状态关键词"],
        sourceIds: article?.sourceIds ?? ["src-emergency"],
        involvedMedicationIds: currentMedications.map((medication) => medication.id)
      },
      currentMedications
    );
    return {
      message: buildRulesMessage(check, mode, query),
      riskCheck: check,
      stages: [
        { id: "intent", label: "识别身体不适", status: "done" },
        { id: "emergency", label: "优先识别危险信号", status: "done" },
        { id: "risk", label: "切换紧急求助链路", status: "done" }
      ],
      mode: "rules"
    };
  }

  const currentInteraction = currentMedications
    .flatMap((left, leftIndex) =>
      currentMedications
        .slice(leftIndex + 1)
        .map((right) => pairInteraction(left, right))
        .filter((rule): rule is NonNullable<typeof rule> => Boolean(rule))
    )
    .find(Boolean);

  if (currentInteraction) {
    const involved = currentMedications.filter((medication) =>
      currentInteraction.terms.some((term) =>
        medicationText(medication).includes(normalize(term))
      )
    );
    const check = makeCheck(
      {
        level: currentInteraction.riskLevel,
        title: currentInteraction.title,
        summary: currentInteraction.summary,
        nextStep: currentInteraction.nextStep,
        reasons: [
          `涉及药物：${involved.map((medication) => medication.name).join("、")}`,
          "核查范围包含当前全部在用药物"
        ],
        sourceIds: currentInteraction.sourceIds,
        involvedMedicationIds: involved.map((medication) => medication.id)
      },
      currentMedications
    );
    return {
      message: buildRulesMessage(check, mode, query),
      riskCheck: check,
      stages: [
        { id: "intent", label: "理解用药问题", status: "done" },
        { id: "profile", label: "读取当前全部药物", status: "done" },
        { id: "rag", label: "检索风险规则与来源", status: "done" },
        { id: "risk", label: "完成风险分级", status: "done" }
      ],
      mode: "rules"
    };
  }

  const conditionMatch = findConditionGuidance(query, profile.conditions);
  if (conditionMatch) {
    const condition = conditionMatch.condition;
    const check = makeCheck(
      {
        level: "medium",
        title: `${condition.name}日常管理与用药注意`,
        summary: condition.summary,
        nextStep: `${condition.followUp} ${condition.emergencySigns[0]}`,
        reasons: [
          `命中慢病知识卡：${condition.name}`,
          conditionMatch.fromProfile
            ? `来自个人档案：${conditionMatch.matchedTerms.join("、")}`
            : `问题关键词：${conditionMatch.matchedTerms.join("、")}`,
          `资料依据：${condition.reference}`
        ],
        sourceIds: condition.sourceIds,
        involvedMedicationIds: currentMedications.map(
          (medication) => medication.id
        )
      },
      currentMedications
    );
    return {
      message: formatConditionGuidance(
        conditionMatch,
        currentMedications.map((medication) => medication.name),
        mode
      ),
      riskCheck: check,
      stages: [
        { id: "intent", label: `识别慢病问题：${condition.name}`, status: "done" },
        { id: "profile", label: "读取当前用药与危险信号", status: "done" },
        { id: "answer", label: "生成慢病专属注意事项", status: "done" }
      ],
      mode: "rules",
      groundingOnly: false
    };
  }

  const mentionMedication = (medication: Medication) => {
    const terms = [
      medication.name,
      medication.genericName,
      ...medication.ingredients
    ]
      .map(normalize)
      .filter((term) => term.length >= 2);
    return terms.some((term) => normalizedQuery.includes(term));
  };
  const mentionedMedications = currentMedications.filter(mentionMedication);
  const missedDoseIntent = /漏服|忘了吃|忘记吃|少吃一次|补服|补吃/.test(
    normalizedQuery
  );
  if (missedDoseIntent && mentionedMedications.length) {
    const medication = mentionedMedications[0];
    const check = handleMissedDose(medication, currentMedications);
    return {
      message: buildRulesMessage(check, mode, query),
      riskCheck: check,
      stages: [
        { id: "intent", label: `识别${medication.name}漏服问题`, status: "done" },
        { id: "profile", label: "读取药物风险级别", status: "done" },
        { id: "risk", label: "应用药物专属漏服停止线", status: "done" }
      ],
      mode: "rules"
    };
  }
  const usageIntent =
    /(怎么吃|怎么用|什么时候吃|几点吃|饭前|饭后|吃几次|每日几次|剂量|注意什么|能不能吃|可以吃)/.test(
      normalizedQuery
    );

  if (usageIntent && mentionedMedications.length) {
    const medication = mentionedMedications[0];
    const highRisk = findHighRiskMedication(medication);
    const check = makeCheck(
      {
        level: highRisk ? "high" : "low",
        title: `已找到“${medication.name}”的当前用法`,
        summary: `我查到您当前使用的是“${medication.name}”：${humanizeMedicationUsage(medication)}。`,
        nextStep: highRisk
          ? "这是一款需要谨慎处理的药物，请继续按处方或说明书使用；不要自行停药或调整剂量。"
          : "请按已确认的处方或说明书使用；如果药盒信息与当前档案不一致，先联系医生或药师核对。",
        reasons: [
          `当前档案：${medication.source.title}`,
          `每日次数：${medication.frequency}`,
          medication.times.length
            ? `提醒时间：${medication.times.join("、")}`
            : "用药时间：不固定时间服用"
        ],
        sourceIds: highRisk
          ? ["src-user-profile", ...highRisk.sourceIds]
          : ["src-user-profile"],
        involvedMedicationIds: [medication.id]
      },
      currentMedications
    );
    return {
      message: buildRulesMessage(check, mode, query),
      riskCheck: check,
      stages: [
        { id: "intent", label: "识别具体药物问题", status: "done" },
        { id: "profile", label: `读取${medication.name}档案`, status: "done" },
        { id: "rag", label: "关联已确认来源", status: "done" },
        { id: "risk", label: "应用药物安全边界", status: "done" }
      ],
      mode: "rules"
    };
  }

  if (usageIntent && /这些药|当前药|今天吃/.test(normalizedQuery)) {
    const lines = currentMedications.map(
      (medication) => `${medication.name}：${humanizeMedicationUsage(medication)}`
    );
    const hasCurrentMedications = currentMedications.length > 0;
    const check = makeCheck(
      {
        level: hasCurrentMedications ? "low" : "unknown",
        title: hasCurrentMedications
          ? "已按当前用药档案逐项核对"
          : "用药档案中还没有可列出的药物",
        summary: hasCurrentMedications
          ? lines.join("；")
          : "您问的是“今天这些药”，但当前用药档案里还没有已确认的药物，所以我无法列出具体药名、剂量和服用时间。",
        nextStep: hasCurrentMedications
          ? "这只是档案中的计划，请以处方或说明书为准；不同药物不要自行合并或拆分剂量。"
          : "请先拍药盒或手动添加正在服用的药，再回来查看每种药的剂量、时间和注意事项。",
        reasons: [
          hasCurrentMedications
            ? "逐项读取当前全部在用药物"
            : "当前档案药物数量为 0"
        ],
        sourceIds: ["src-user-profile"],
        involvedMedicationIds: currentMedications.map(
          (medication) => medication.id
        )
      },
      currentMedications
    );
    return {
      message: buildRulesMessage(check, mode, query),
      riskCheck: check,
      stages: [
        { id: "intent", label: "识别全量用药问题", status: "done" },
        { id: "profile", label: "逐项读取当前药物", status: "done" },
        { id: "risk", label: "生成各自用法摘要", status: "done" }
      ],
      mode: "rules"
    };
  }

  if (usageIntent && /这个药|这种药|它怎么|它能不能/.test(normalizedQuery)) {
    const check = makeCheck(
      {
        level: "unknown",
        title: "还无法确认您说的是哪一种药",
        summary:
          "还无法确认您说的是哪一种药。您当前清单里有多种药，只说“这个药”容易把用法和风险对错。请说出药名，或拍药盒再问。",
        nextStep: "补充具体药名后，我会分别读取这款药的剂量、次数和时间。",
        reasons: ["问题中没有可唯一匹配的药物名称"],
        sourceIds: ["src-no-evidence"],
        involvedMedicationIds: currentMedications.map(
          (medication) => medication.id
        )
      },
      currentMedications
    );
    return {
      message: buildRulesMessage(check, mode, query),
      riskCheck: check,
      stages: [
        { id: "intent", label: "发现问题缺少具体药名", status: "done" },
        { id: "profile", label: "读取可用药物清单", status: "done" },
        { id: "risk", label: "停止猜测具体药物", status: "done" }
      ],
      mode: "rules"
    };
  }

  const matchedTopics = findSafetyTopics(query);
  if (matchedTopics.length) {
    const { topic, matchedKeywords } = matchedTopics[0];
    const check = makeCheck(
      {
        level: topic.riskLevel,
        title: topic.title,
        summary: topic.summary,
        nextStep: topic.nextStep,
        reasons: [
          `命中安全主题：${topic.title}`,
          `关键词：${matchedKeywords.join("、")}`
        ],
        sourceIds: topic.sourceIds,
        involvedMedicationIds: currentMedications.map(
          (medication) => medication.id
        )
      },
      currentMedications
    );
    return {
      message: buildRulesMessage(check, mode, query),
      riskCheck: check,
      stages: [
        { id: "intent", label: "识别常见用药安全问题", status: "done" },
        { id: "rag", label: `命中安全主题：${topic.title}`, status: "done" },
        { id: "profile", label: "结合当前用药与个人档案", status: "done" },
        { id: "risk", label: "应用安全边界", status: "done" }
      ],
      mode: "rules"
    };
  }

  const article = findArticle(query);
  if (article) {
    const check = makeCheck(
      {
        level: article.riskLevel,
        title: article.title,
        summary: article.plainText,
        nextStep:
          article.riskLevel === "high"
            ? "请联系开药医生或药师核对，不要自行调整用药。"
            : "您可以展开依据核对；如资料不完整，请先补充药物信息。",
        reasons: [`检索到知识条目：${article.title}`],
        sourceIds: article.sourceIds,
        involvedMedicationIds: currentMedications
          .filter((medication) =>
            article.terms.some((term) =>
              medicationText(medication).includes(normalize(term))
            )
          )
          .map((medication) => medication.id)
      },
      currentMedications
    );
    return {
      message: buildRulesMessage(check, mode, query),
      riskCheck: check,
      stages: [
        { id: "intent", label: "理解用药问题", status: "done" },
        { id: "profile", label: "核对当前用药与身体档案", status: "done" },
        { id: "rag", label: "检索可追溯的资料", status: "done" },
        { id: "risk", label: "生成分级回答", status: "done" }
      ],
      mode: "rules"
    };
  }

  if (normalizedQuery.includes("头晕") || normalizedQuery.includes("不舒服")) {
    const check = makeCheck(
      {
        level: "unknown",
        title: "先确认身体状态，暂不归因于药物",
        summary:
          "仅凭头晕不能判断是哪种药造成的。请先确认有没有胸痛、呼吸困难、意识不清或突然口角歪斜。",
        nextStep:
          "如果出现上述情况，立即使用 SOS；如果没有，可以记录发生时间和最近一次服药，再联系医生或药师。",
      reasons: ["症状不能直接归因于药物", "当前知识库未覆盖该具体症状"],
        sourceIds: ["src-emergency", "src-no-evidence"],
        involvedMedicationIds: currentMedications.map((medication) => medication.id)
      },
      currentMedications
    );
    return {
      message: buildRulesMessage(check, mode, query),
      riskCheck: check,
      stages: [
        { id: "intent", label: "识别身体不适", status: "done" },
        { id: "emergency", label: "核查紧急危险信号", status: "done" },
        { id: "profile", label: "读取近期用药", status: "done" },
        { id: "risk", label: "保持诊断边界", status: "done" }
      ],
      mode: "rules"
    };
  }

  // === 闲聊/通用对话分支 ===
  const chatPatterns: Array<{ re: RegExp; reply: () => string }> = [
    {
      re: /^(你好|您好|hi|hello|在吗|在不在|早|早上好|晚上好|下午好)[!！。.]?$/i,
      reply: () =>
        profile?.name
          ? `您好，${profile.name}！我是智药有方的小助手，专门帮您核对用药、解答吃药时的安全问题。您今天想聊点什么？`
          : "您好！我是智药有方的小助手，专门帮您核对用药、解答吃药时的安全问题。您今天想聊点什么？"
    },
    {
      re: /你是谁|你是.*吗|你叫什么|介绍一下你自己|你能做什么|你有什么功能/,
      reply: () =>
        "我是智药有方·安心药伴的AI小助手，主要能帮您做这些事：\n\n• 核对药盒照片，识别药物名称和用法\n• 提醒按时吃药、检查药物之间有没有相互作用\n• 回答常见的吃药安全问题（比如漏服了怎么办、饭前饭后吃）\n• 紧急情况下帮您快速判断是否需要就医\n\n有任何吃药相关的问题都可以直接问我～"
    },
    {
      re: /谢谢|感谢|多谢|thank|好的|没问题|好极了|太棒了/,
      reply: () =>
        "不客气！吃药安全的小事，随时问我都行。如果您现在有在吃的药，我可以帮您再核对一遍。"
    },
    {
      re: /再见|拜拜|bye|晚安|我走了/,
      reply: () =>
        "好的，您好好休息。记得按时吃药，有问题随时来找我～"
    },
    {
      re: /天气|今天.*冷|下雨|出门/,
      reply: () =>
        "天气情况您可以看看手机上的天气预报哦。记得根据天气增减衣物，按时吃药更重要！"
    },
    {
      re: /名字|我叫|怎么称呼/,
      reply: () =>
        profile?.name
          ? `您是${profile.name}对吧？我已经记住啦～`
          : "我还没存下您的名字，可以去「我的」页面告诉我的！"
    },
    {
      re: /家人|家属|孩子|孙子|老伴|儿子|女儿/,
      reply: () =>
        "家里人用药安全确实要多上心。我可以帮您核对家里人的用药清单，检查有没有重复或冲突的药物。"
    },
    {
      re: /几点了|现在.*时间|今天.*几号|星期几/,
      reply: () =>
        `现在是 ${new Date().toLocaleString("zh-CN", { hour12: false })}。记得按时吃药哦！`
    }
  ];
  const chatHit = chatPatterns.find((p) => p.re.test(normalizedQuery));
  if (chatHit) {
    const check = makeCheck(
      {
        level: "low",
        title: "日常对话",
        summary: chatHit.reply(),
        nextStep: "",
        reasons: ["识别到日常闲聊意图"],
        sourceIds: ["src-chat"],
        involvedMedicationIds: []
      },
      currentMedications
    );
    return {
      message: check.summary,
      riskCheck: check,
      stages: [
        { id: "intent", label: "识别日常对话", status: "done" },
        { id: "chat", label: "给出友好回复", status: "done" }
      ],
      mode: "rules"
    };
  }

  // === 常见症状安全建议分支 ===
  const symptomAdvice: Array<{
    re: RegExp;
    title: string;
    summary: string;
    nextStep: string;
    keywords: string[];
  }> = [
    {
      re: /腹泻|拉肚子|拉稀|肚子疼.*拉/,
      title: "腹泻先补液并观察危险信号",
      summary:
        "腹泻时首先要防止脱水，可在没有禁忌时少量多次补充口服补液盐或饮水。具体补液量以及是否适合使用止泻药，应结合年龄、肾病、心脏功能和腹泻原因判断。\n\n如果同时出现高热、明显腹痛、便血或黑便、持续呕吐、尿量明显减少或头晕站不稳，应尽快就医，不要自行使用止泻药掩盖症状。",
      nextStep:
        "请先补充腹泻持续多久、今天大致次数、体温、尿量，以及是否在服用利尿剂或降糖药。",
      keywords: ["口服补液盐", "脱水", "腹泻"]
    },
    {
      re: /咳嗽|咳.*痰|干咳|喉咙痒.*咳/,
      title: "先区分咳嗽类型和危险信号",
      summary:
        "咳嗽需要先区分是干咳还是有痰，也要结合发热、气短、胸痛和既往肺病判断。单纯止咳可能掩盖感染或哮喘加重，不建议在未核对原因前自行叠加多种止咳、化痰或感冒药。\n\n如果呼吸困难、胸痛、咳血、嘴唇发紫、意识变化，或症状持续加重，应及时就医。",
      nextStep:
        "请补充咳嗽多久、有痰还是干咳、是否发热或气短，以及当前是否有慢阻肺或哮喘。",
      keywords: ["干咳", "咳痰", "呼吸困难"]
    },
    {
      re: /感冒|着凉|流鼻涕|打喷嚏|鼻塞/,
      title: "感冒药先核对成分和基础病",
      summary:
        "普通感冒多为病毒感染，处理以休息、补水和症状观察为主。复方感冒药可能含有相同退热、抗过敏或减充血成分，同时服用容易重复；高血压、心脏病、前列腺增生和青光眼患者还需核对减充血成分。\n\n不要自行叠加多种感冒药。高热持续、呼吸困难、胸痛、意识异常或症状明显加重时应及时就医。",
      nextStep:
        "请补充体温、症状持续时间和正在使用的慢病药；如果要买感冒药，先拍下成分表再核对。",
      keywords: ["复方感冒药", "重复成分", "减充血剂"]
    },
    {
      re: /发烧|发热|高烧|体温.*3[7-9]|体温.*4/,
      title: "发热先测量并判断是否需就医",
      summary:
        "发热时先准确测量体温、补充水分并观察精神状态。是否需要退热药要结合基础病、肝肾功能、胃溃疡和正在服用的药物；布洛芬等止痛退热药并非适合所有人，不能按别人的剂量照用。\n\n高热持续、呼吸困难、胸痛、抽搐、意识模糊、明显脱水或老人整体状态变差时，应尽快就医。",
      nextStep:
        "请补充体温、持续天数、是否畏寒咳嗽，以及有无心脏病、肾病、胃溃疡或抗凝药。",
      keywords: ["发热", "退热药", "基础病"]
    },
    {
      re: /头痛|头疼|偏头痛|太阳穴.*疼/,
      title: "头痛先排除卒中和其他急症",
      summary:
        "头痛的原因很多。如果不是突然剧烈头痛，可以先休息、补水并记录血压；在原因未确认前，不建议只靠止痛药掩盖症状。\n\n突然出现“人生最剧烈”的头痛、伴呕吐或视力改变、说话含糊、一侧无力、发热颈硬或跌倒撞头后头痛，应立即就医。",
      nextStep:
        "请补充是突然还是逐渐出现、持续多久、是否伴血压升高、神经症状或近期头部外伤。",
      keywords: ["头痛", "卒中", "头部外伤"]
    },
    {
      re: /胃痛|胃疼|肚子疼|肚子痛|腹痛|肚子.*疼|反酸|烧心|胃溃疡|胃炎|肚子.*不舒服|绞痛/,
      title: "胃痛或腹痛先判断急症风险",
      summary:
        "腹痛的位置、持续时间和伴随症状很重要。在原因未明确前，不建议自行使用止痛药或多种胃药，因为可能掩盖阑尾炎、胆囊炎、胰腺炎或消化道出血。\n\n如果疼痛突然剧烈、持续加重，伴发热、呕吐、黑便呕血、腹部僵硬或胸痛，应尽快就医或拨打 120。",
      nextStep:
        "请补充具体位置、开始时间、饭前饭后规律，以及是否伴呕吐、发热、黑便或胸闷。",
      keywords: ["腹痛", "消化道出血", "急腹症"]
    },
    {
      re: /失眠|睡不着|睡不好|失眠.*吃什么|助眠/,
      title: "失眠先调整作息并排查药物影响",
      summary:
        "失眠可以先固定起床时间、减少午睡过长和睡前屏幕刺激，并记录咖啡因、酒精及晚间用药。老年人自行使用安眠药或助眠保健品可能增加跌倒、嗜睡和意识混乱风险。\n\n如果持续数周、明显影响白天生活，或伴随严重焦虑、胸痛、呼吸困难，应由医生评估。",
      nextStep:
        "请补充失眠持续多久、每天睡眠时间、是否打鼾或憋醒，以及晚间正在使用的药。",
      keywords: ["失眠", "安眠药", "跌倒"]
    },
    {
      re: /皮肤.*痒|过敏|荨麻疹|湿疹|皮炎/,
      title: "皮肤过敏先看范围和呼吸症状",
      summary:
        "轻微局部瘙痒可以先避免抓挠和可疑接触物，并记录是否与新增药物有关。外用或口服抗过敏药也需结合皮肤情况、年龄和其他药物核对，不能把激素药膏长期随意使用。\n\n如果皮疹迅速扩散，伴嘴唇或眼睑肿胀、喉部紧缩、呼吸困难、头晕或意识变化，应按严重过敏处理并立即拨打 120。",
      nextStep:
        "请补充皮疹范围、开始时间、近期新增药物或食物，以及是否有呼吸或吞咽困难。",
      keywords: ["严重过敏", "皮疹", "呼吸困难"]
    }
  ];
  const symptomHit = symptomAdvice.find((s) => s.re.test(normalizedQuery));
  if (symptomHit) {
    const check = makeCheck(
      {
        level: "medium",
        title: symptomHit.title,
        summary: symptomHit.summary,
        nextStep: symptomHit.nextStep,
        reasons: [
          "识别到常见症状咨询",
          "本回答为非处方建议，不能代替医生诊断"
        ],
        sourceIds: ["src-symptom-advice"],
        involvedMedicationIds: currentMedications.map((m) => m.id)
      },
      currentMedications
    );
    return {
      message: buildRulesMessage(check, mode, query),
      riskCheck: check,
      stages: [
        { id: "intent", label: "识别症状咨询", status: "done" },
        { id: "rag", label: "匹配非处方安全建议", status: "done" },
        { id: "risk", label: "标注非诊断性质", status: "done" }
      ],
      mode: "rules"
    };
  }

  const check = makeCheck(
    {
      level: "unknown",
      title: "暂未收录这个具体主题",
      summary:
        `资料不足：当前知识库没有找到足以可靠回答“${query.slice(0, 40)}”的资料，因此不会猜测诊断或生成具体剂量、停药、补服建议。`,
      nextStep:
        "请补充医生确认的疾病名称、持续时间、主要症状、药盒或说明书；涉及胸痛、呼吸困难、意识异常或明显出血时，不要等待在线回答。",
      reasons: ["未检索到匹配知识条目", "当前知识库覆盖范围有限"],
      sourceIds: ["src-no-evidence"],
      involvedMedicationIds: currentMedications.map((medication) => medication.id)
    },
    currentMedications
  );
  return {
    message: buildRulesMessage(check, mode, query),
    riskCheck: check,
    stages: [
      { id: "intent", label: "理解问题", status: "done" },
      { id: "profile", label: "读取当前用药", status: "done" },
      { id: "rag", label: "检索资料", status: "done" },
      { id: "risk", label: "停止无依据推断", status: "done" }
    ],
    mode: "rules"
  };
}

function humanizeMedicationUsage(medication: Medication): string {
  const relation =
    medication.relation === "饭前"
      ? "吃饭前半小时"
      : medication.relation === "饭后"
        ? "吃完饭以后"
        : medication.relation === "随餐"
          ? "吃饭时"
          : medication.relation || "按说明书或处方使用";
  const schedule = medication.times.length
    ? `时间 ${medication.times.join("、")}`
    : "不固定时间服用";
  return `${relation}服用，每次 ${medication.dosage}，${medication.frequency}，${schedule}；参考价格：${medication.price || "暂无可靠价格数据"}`;
}

export function summaryForFamily(
  currentMedications: Medication[],
  profile: ElderProfile
): string {
  return `${profile.name}当前有 ${currentMedications.length} 种药物需要核对。`;
}
