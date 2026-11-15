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

export function answerWithRules(
  query: string,
  currentMedications: Medication[],
  profile: ElderProfile,
  options?: { missedMedication?: Medication }
): AssistantResponse {
  const started = nowIso();
  void started;

  if (options?.missedMedication) {
    const check = handleMissedDose(options.missedMedication, currentMedications);
    return {
      message: `${check.summary}\n\n${check.nextStep}`,
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
      message: `${check.summary}\n\n${check.nextStep}`,
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
      message: `${check.summary}\n\n${check.nextStep}`,
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
          `提醒时间：${medication.times.join("、")}`
        ],
        sourceIds: highRisk
          ? ["src-user-profile", ...highRisk.sourceIds]
          : ["src-user-profile"],
        involvedMedicationIds: [medication.id]
      },
      currentMedications
    );
    return {
      message: `${check.summary}\n\n${check.nextStep}`,
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
    const check = makeCheck(
      {
        level: "low",
        title: "已按当前用药档案逐项核对",
        summary: lines.join("；") || "当前没有已确认的在用药物。",
        nextStep:
          "这只是档案中的计划，请以处方或说明书为准；不同药物不要自行合并或拆分剂量。",
        reasons: ["逐项读取当前全部在用药物"],
        sourceIds: ["src-user-profile"],
        involvedMedicationIds: currentMedications.map(
          (medication) => medication.id
        )
      },
      currentMedications
    );
    return {
      message: `${check.summary}\n\n${check.nextStep}`,
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
      message: `${check.summary}\n\n${check.nextStep}`,
      riskCheck: check,
      stages: [
        { id: "intent", label: "发现问题缺少具体药名", status: "done" },
        { id: "profile", label: "读取可用药物清单", status: "done" },
        { id: "risk", label: "停止猜测具体药物", status: "done" }
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
      message: `${check.summary}\n\n${check.nextStep}`,
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
      message: `${check.summary}\n\n${check.nextStep}`,
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

  const check = makeCheck(
    {
      level: "unknown",
      title: "资料不足，先不要按猜测处理",
      summary:
        "资料不足：当前知识库没有找到足以回答这个问题的可靠资料，因此不会生成具体剂量、停药或补服建议。",
      nextStep:
        "请补充药盒或说明书照片，或联系医生、药师确认。您也可以查看当前用药清单继续核对。",
      reasons: ["未检索到匹配知识条目", "当前知识库覆盖范围有限"],
      sourceIds: ["src-no-evidence"],
      involvedMedicationIds: currentMedications.map((medication) => medication.id)
    },
    currentMedications
  );
  return {
    message: `${check.summary}\n\n${check.nextStep}`,
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
  return `${relation}服用，每次 ${medication.dosage}，${medication.frequency}，时间 ${medication.times.join("、")}；参考价格：${medication.price || "暂无可靠价格数据"}`;
}

export function summaryForFamily(
  currentMedications: Medication[],
  profile: ElderProfile
): string {
  return `${profile.name}当前有 ${currentMedications.length} 种药物需要核对。`;
}
