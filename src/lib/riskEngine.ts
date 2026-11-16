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
  const missedDoseIntent = /漏服|忘了吃|忘记吃|少吃一次|补服|补吃/.test(
    normalizedQuery
  );
  if (missedDoseIntent && mentionedMedications.length) {
    const medication = mentionedMedications[0];
    const check = handleMissedDose(medication, currentMedications);
    return {
      message: `${check.summary}\n\n${check.nextStep}`,
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
      message: `${check.summary}\n\n${check.nextStep}`,
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

  // === 常见症状非处方建议分支 ===
  const symptomAdvice: Array<{
    re: RegExp;
    title: string;
    summary: string;
    nextStep: string;
    keywords: string[];
  }> = [
    {
      re: /腹泻|拉肚子|拉稀|肚子疼.*拉/,
      title: "腹泻的非处方建议",
      summary:
        "拉肚子的时候，建议先喝口服补液盐（ORS）或淡盐水，防止脱水。\n\n常用的非处方止泻药：蒙脱石散（思密达）可以保护肠黏膜；益生菌（如双歧杆菌、乳酸菌素片）可以调节肠道菌群。\n\n⚠️ 注意：如果拉肚子同时伴随高烧、持续腹痛、大便带血或黑色，或者一天超过 8 次水样便，请尽快去医院，不要自己吃药硬扛。",
      nextStep:
        "您现在有在吃的其他药物吗？有些止泻药可能和正在吃的药有冲突，告诉我药名我可以帮您核对。",
      keywords: ["蒙脱石散", "益生菌", "口服补液盐", "ORS"]
    },
    {
      re: /咳嗽|咳.*痰|干咳|喉咙痒.*咳/,
      title: "咳嗽的非处方建议",
      summary:
        "咳嗽分有痰和无痰两种：\n\n• 有痰咳嗽：可以用氨溴索（沐舒坦）或乙酰半胱氨酸，帮助化痰。不要单独用止咳药。\n• 干咳无痰：可以用右美沙芬或苯丙哌林。\n• 喉咙痒引起的咳嗽：可以用含片（如西瓜霜、金嗓子）润喉。\n\n⚠️ 如果咳嗽超过 2 周不好转、伴随呼吸困难或胸痛，请去医院检查。",
      nextStep:
        "您现在咳嗽有痰吗？痰是什么颜色的？这些信息能帮您选更合适的药。",
      keywords: ["氨溴索", "沐舒坦", "右美沙芬", "西瓜霜"]
    },
    {
      re: /感冒|着凉|流鼻涕|打喷嚏|鼻塞/,
      title: "感冒的非处方建议",
      summary:
        "感冒大多是病毒引起的，一般 5-7 天自己就好。非处方感冒药主要缓解症状：\n\n• 发热头痛：对乙酰氨基酚（泰诺林）或布洛芬（芬必得）\n• 鼻塞流鼻涕：氯雷他定、西替利嗪，或伪麻黄碱滴鼻液（连续用不超过 3 天）\n• 咳嗽：见咳嗽建议\n\n⚠️ 不要同时吃多种感冒药，很多复方感冒药里已经含有对乙酰氨基酚，重复吃会伤肝。如果发烧超过 38.5℃ 超过 3 天不好转，请去医院。",
      nextStep:
        "您现在有发烧吗？发烧的话体温多少度？另外您现在有没有在吃其他药？",
      keywords: ["对乙酰氨基酚", "泰诺林", "布洛芬", "氯雷他定"]
    },
    {
      re: /发烧|发热|高烧|体温.*3[7-9]|体温.*4/,
      title: "发烧的非处方建议",
      summary:
        "如果体温在 37.3℃-38.5℃ 之间，建议先物理降温：多喝水、用温水擦身体、不要捂汗。\n\n超过 38.5℃ 或身体明显不舒服时可以吃退烧药：\n• 对乙酰氨基酚（泰诺林）：每 4-6 小时一次，24 小时不超过 4 次\n• 布洛芬（芬必得）：每 6-8 小时一次，24 小时不超过 3 次\n\n⚠️ 两个退烧药不要同时吃。如果发烧超过 3 天不退、或者体温超过 39℃，请尽快去医院。",
      nextStep:
        "您现在体温多少？另外注意有没有胸痛、呼吸困难、意识模糊这些严重症状。",
      keywords: ["对乙酰氨基酚", "布洛芬", "泰诺林", "芬必得"]
    },
    {
      re: /头痛|头疼|偏头痛|太阳穴.*疼/,
      title: "头痛的非处方建议",
      summary:
        "常见头痛可以先用非处方止痛药：\n• 对乙酰氨基酚（泰诺林）\n• 布洛芬（芬必得）\n\n另外注意休息、多喝水，避免强光和噪音刺激。\n\n⚠️ 如果头痛突然很剧烈、伴随呕吐或视力模糊，或者是这辈子经历过最疼的一次，请立即去医院——这可能是脑出血的信号。",
      nextStep:
        "您以前有偏头痛病史吗？这次头痛是慢慢疼起来的还是突然疼的？",
      keywords: ["对乙酰氨基酚", "布洛芬"]
    },
    {
      re: /胃痛|胃疼|肚子疼|肚子痛|腹痛|肚子.*疼|反酸|烧心|胃溃疡|胃炎|肚子.*不舒服|绞痛/,
      title: "胃痛/腹痛的非处方建议",
      summary:
        "肚子痛的原因很多，先看位置：\n\n• 如果是上腹部（胃的位置），伴随反酸/烧心：可以用铝碳酸镁（达喜）咀嚼片临时缓解，或奥美拉唑/雷贝拉唑抑制胃酸。暂时吃点馒头、白粥这类好消化的，避免辛辣油腻。\n• 如果是肚脐周围绞痛、拉肚子：可能是肠炎或肠痉挛，注意补水，可以吃蒙脱石散保护肠黏膜。\n• 如果是右下腹痛（阑尾炎位置）、右上腹痛（胆囊炎位置），或者疼痛持续加重、伴随呕吐、发烧，请**尽快去医院**，不要自己吃药硬扛。⚠️ 急性腹痛可能是急症。",
      nextStep:
        "您具体是哪个位置疼？是饭前疼还是饭后疼？有没有伴随拉肚子、呕吐或发烧？",
      keywords: ["铝碳酸镁", "达喜", "奥美拉唑", "蒙脱石散"]
    },
    {
      re: /失眠|睡不着|睡不好|失眠.*吃什么|助眠/,
      title: "失眠的建议",
      summary:
        "老年人不建议自己吃安眠药！助眠可以先试这些温和的方法：\n\n• 固定睡觉时间，每天同一个点上床\n• 睡前 1 小时不要看手机、电视\n• 卧室保持黑暗和安静，温度凉爽\n• 白天适当活动但不要临睡前剧烈运动\n• 可以试试睡前喝一杯温牛奶、听轻音乐\n\n如果确实需要药物辅助，建议先去医院睡眠科就诊，由医生开药（比如褪黑素、或新型非苯二氮䓬类催眠药）。不建议自己买助眠保健品乱吃。",
      nextStep:
        "您失眠持续多久了？大概每天能睡几个小时？这些信息能帮医生判断情况。",
      keywords: []
    },
    {
      re: /皮肤.*痒|过敏|荨麻疹|湿疹|皮炎/,
      title: "皮肤痒/过敏的非处方建议",
      summary:
        "皮肤过敏/湿疹可以先用非处方药膏：\n\n• 局部止痒：炉甘石洗剂（无激素，安全温和）\n• 湿疹/皮炎：弱效糖皮质激素乳膏如氢化可的松乳膏（连续用不超过 1 周，薄涂）\n• 口服抗过敏：氯雷他定、西替利嗪、扑尔敏（扑尔敏会犯困，白天别吃）\n\n⚠️ 如果面积很大、或者伴随呼吸困难、嘴唇眼皮肿，这是严重过敏反应，请立即就医！",
      nextStep:
        "痒的地方是局部一小块还是全身都有？最近有没有接触什么新的东西？",
      keywords: ["炉甘石", "氢化可的松", "氯雷他定"]
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
      message: `${check.summary}\n\n${check.nextStep}`,
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
