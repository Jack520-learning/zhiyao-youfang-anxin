import { answerFromDrugCatalog } from "../catalog/chatBridge";
import { herbs } from "../catalog/herbs";
import { medicines } from "../catalog/medicines";
import {
  reconcileMedicationList,
  type ReconciliationResult
} from "../catalog/multiDrug";
import { findBestMedicine } from "../catalog/retrieval";
import { supplements } from "../catalog/supplements";
import type {
  AssistantResponse,
  ElderProfile,
  Medication,
  RiskLevel,
  RiskCheck
} from "../types";
import { createId } from "./ids";
import type { AnswerMode } from "./riskEngine";
import { nowIso } from "./time";

export type ChatSkill = "photo" | "catalog" | "herbs" | "multi-drug";

interface SkillContext {
  profile: ElderProfile;
  medications: Medication[];
  currentMedicationNames: string[];
  answerMode: AnswerMode;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[\s，。,.、:：;；()（）/?？!！-]/g, "");
}

function unique(values: string[]): string[] {
  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index);
}

function mentionedCatalogNames(query: string): string[] {
  const normalizedQuery = normalize(query);
  const referredMedicines = medicines
    .map((medicine) => ({
      label: medicine.displayName,
      matchLength: Math.max(
        ...[medicine.displayName, medicine.activeIngredient, ...medicine.aliases]
          .map(normalize)
          .filter((term) => term.length >= 2)
          .filter((term) => normalizedQuery.includes(term))
          .map((term) => term.length),
        0
      )
    }))
    .filter((item) => item.matchLength > 0)
    .sort((left, right) => right.matchLength - left.matchLength)
    .map((item) => item.label);
  const referredHerbs = herbs
    .filter((herb) =>
      [herb.name, ...herb.aliases]
        .map(normalize)
        .some((term) => term.length >= 2 && normalizedQuery.includes(term))
    )
    .map((herb) => herb.name);
  const referredSupplements = supplements
    .filter((supplement) =>
      [supplement.name, ...supplement.aliases]
        .map(normalize)
        .some((term) => term.length >= 2 && normalizedQuery.includes(term))
    )
    .map((supplement) => supplement.name);
  return unique([
    ...referredMedicines.slice(0, 8),
    ...referredHerbs.slice(0, 6),
    ...referredSupplements.slice(0, 4)
  ]);
}

function riskLevelForReconciliation(result: ReconciliationResult): RiskLevel {
  if (result.warnings.some((warning) => warning.level === "high")) return "high";
  if (
    result.warnings.some((warning) => warning.level === "medium") ||
    result.unresolved.length
  ) {
    return "medium";
  }
  return "low";
}

function riskLabel(level: RiskLevel): string {
  return level === "high"
    ? "高"
    : level === "medium"
      ? "中"
      : level === "low"
        ? "低"
        : "未明确";
}

function buildMultiDrugMessage(
  result: ReconciliationResult,
  names: string[],
  answerMode: AnswerMode
): string {
  const level = riskLevelForReconciliation(result);
  const warningLines = result.warnings.map(
    (warning) => `${warning.title}：${warning.detail} ${warning.action}`
  );
  const spacingLines = result.spacing;
  const unresolvedLine = result.unresolved.length
    ? `以下名称尚未匹配到可靠成分资料，不能据此判断安全：${result.unresolved.join("、")}。`
    : "";
  const firstWarning = result.warnings[0];
  const conclusion = firstWarning
    ? `${firstWarning.title}。${firstWarning.action}`
    : result.unresolved.length
      ? `有 ${result.unresolved.length} 个名称未能可靠匹配，暂时不能完成全部对账。`
      : `当前资料中未发现重复成分或已知相互作用，但仍需以完整包装和医生或药师核对为准。`;

  if (answerMode === "quick") {
    return `直接回答：已核对 ${names.length} 项，${conclusion}${
      result.warnings.length ? "不要自行同时加用或停用任何药。" : "继续按现有处方使用。"
    }`.slice(0, 460);
  }

  if (answerMode === "detailed") {
    return [
      "## 多药对账的详细说明",
      `**风险等级：${riskLabel(level)}**`,
      "### 已核对范围",
      `本次逐项核对 ${names.length} 项：${names.join("、")}。`,
      "### 发现的问题",
      ...(warningLines.length
        ? warningLines.map((line) => `- ${line}`)
        : ["- 当前知识库中未发现重复成分、同类药重复或已知直接相互作用。"]),
      ...(spacingLines.length
        ? ["### 需要错开服用", ...spacingLines.map((line) => `- ${line}`)]
        : []),
      ...(unresolvedLine ? ["### 仍需核对", unresolvedLine] : []),
      "### 下一步",
      firstWarning?.action ||
        "请保留所有药盒和完整成分表；新增、停用或调整剂量前，让医生或药师统一核对。",
      "以上对账只依据当前知识库和您提供的名称，未匹配项不会被猜测成安全。"
    ].join("\n\n");
  }

  return [
    "## 多药对账结果",
    `**风险等级：${riskLabel(level)}**`,
    `已逐项核对 ${names.length} 项：${names.join("、")}。`,
    ...(warningLines.length
      ? ["", "### 发现的问题", ...warningLines.map((line) => `- ${line}`)]
      : ["", conclusion]),
    ...(spacingLines.length
      ? ["", "### 错开服用", ...spacingLines.map((line) => `- ${line}`)]
      : []),
    ...(unresolvedLine ? ["", "### 仍需核对", unresolvedLine] : []),
    "",
    "### 现在先做",
    `- ${
      firstWarning?.action ||
      "继续按处方或说明书使用，并把所有药盒、中药和保健品交给医生或药师统一核对。"
    }`
  ].join("\n");
}

function buildMultiDrugResponse(
  query: string,
  context: SkillContext
): AssistantResponse {
  const names = unique([
    ...context.currentMedicationNames,
    ...mentionedCatalogNames(query)
  ]);
  const result = reconcileMedicationList(names);
  const level = names.length < 2 ? "unknown" : riskLevelForReconciliation(result);
  const title =
    names.length < 2
      ? "多药对账至少需要两项用药信息"
      : level === "high"
        ? "多药对账发现高风险联合用药"
        : level === "medium"
          ? "多药对账发现需要专业核对的问题"
          : "多药对账未发现当前资料中的已知冲突";
  const summary =
    names.length < 2
      ? "请补充至少两种正在使用或准备一起使用的药、中药材或保健品名称。"
      : result.warnings.length
        ? result.warnings.map((warning) => `${warning.title}：${warning.action}`).join("；")
        : result.unresolved.length
          ? `有 ${result.unresolved.length} 个名称未能可靠匹配，不能判定为安全。`
          : "当前知识库未发现重复成分、同类药重复或已知直接相互作用，但这不等于绝对安全。";
  const involvedMedicationIds = context.medications
    .filter((medication) =>
      names.some(
        (name) =>
          medication.name.includes(name) ||
          name.includes(medication.name) ||
          medication.genericName.includes(name) ||
          name.includes(medication.genericName)
      )
    )
    .map((medication) => medication.id);

  return {
    message:
      names.length < 2
        ? "## 多药对账还缺用药信息\n\n请至少补充两种药、中药材或保健品的名称。只写“这些药”而没有具体名称时，我不能猜测成分或给出安全结论。"
        : buildMultiDrugMessage(result, names, context.answerMode),
    riskCheck: {
      id: createId("skill-multi"),
      level,
      title,
      summary,
      nextStep:
        names.length < 2
          ? "请逐项写出名称；也可以拍照添加多个药盒后再核对。"
          : result.warnings[0]?.action ||
            "请保留完整药盒和成分表，新增、停用或调整剂量前让医生或药师统一核对。",
      reasons: [
        `已纳入 ${names.length} 项用药信息`,
        ...(result.warnings.length
          ? [`发现 ${result.warnings.length} 条需要核对的问题`]
          : ["当前资料未命中已知直接冲突"]),
        ...(result.unresolved.length
          ? [`未匹配名称：${result.unresolved.join("、")}`]
          : [])
      ],
      sourceIds: ["src-drug-catalog", "src-herb-catalog", "src-no-evidence"],
      involvedMedicationIds,
      medicationSnapshot: names,
      createdAt: nowIso()
    },
    stages: [
      { id: "skill-multi-items", label: "逐项识别药、中药与保健品", status: "done" },
      { id: "skill-multi-duplicates", label: "核对重复成分与同类重复", status: "done" },
      { id: "skill-multi-interactions", label: "核对相互作用与服用间隔", status: "done" }
    ],
    mode: "rules"
  };
}

function buildCatalogSkillMessage(
  medicine: NonNullable<ReturnType<typeof findBestMedicine>>["medicine"],
  riskCheck: RiskCheck,
  answerMode: AnswerMode
): string {
  const specification = medicine.strength.replace(/^常见\s*/, "");
  const introduction = `${medicine.displayName}的主要成分是${medicine.activeIngredient}，剂型为${medicine.dosageForm}，常见规格为${specification}。`;
  const personalNote =
    medicine.specialGroups?.older ||
    "老年人使用前仍需结合肝肾功能、胃溃疡风险和正在服用的其他药物核对。";
  const matchedLine = `- 已匹配：${medicine.displayName}`;
  const usageLines = [
    medicine.howToTake,
    `每日上限：${medicine.maxDaily}`,
    `服用时机：${medicine.timing}`,
    medicine.food
  ].map((line) => line.trim());

  if (answerMode === "quick") {
    return `直接回答：${introduction}${riskCheck.summary
      .split(/[。！？\n]/)[0]
      .trim()}。${riskCheck.nextStep.trim()}`.slice(
      0,
      460
    );
  }

  if (answerMode === "detailed") {
    return [
      `## ${medicine.displayName}详细说明`,
      `**风险等级：${riskLabel(riskCheck.level)}**`,
      `### 药品基本信息`,
      introduction,
      `### 用法用量与时间`,
      ...usageLines,
      "### 当前问题结论",
      riskCheck.summary,
      "### 可能的副作用",
      ...medicine.sideEffects.map((item) => `- ${item}`),
      "### 重要安全提醒",
      ...medicine.keyWarnings.map((item) => `- ${item}`),
      "### 老年人特别注意",
      personalNote,
      "### 下一步",
      riskCheck.nextStep,
      "### 本次技能依据",
      matchedLine,
      `- 药品知识版本：${medicine.knowledgeVersion}（待专业复核）`
    ].join("\n\n");
  }

  return [
    `## ${medicine.displayName}介绍`,
    `**风险等级：${riskLabel(riskCheck.level)}**`,
    introduction,
    `### 具体使用方法`,
    ...usageLines,
    "### 本问题要点",
    riskCheck.summary,
    "### 常见不适",
    medicine.sideEffects.slice(0, 5).map((item) => `- ${item}`).join("\n"),
    "### 老年人注意",
    personalNote,
    "### 现在先做",
    `- ${riskCheck.nextStep}`,
    "### 本次技能依据",
    matchedLine
  ].join("\n\n");
}

function buildMissingSkillInput(
  skill: "catalog" | "herbs",
  query: string
): AssistantResponse {
  const isCatalog = skill === "catalog";
  const subject = isCatalog ? "药品名称" : "中药材名称";
  const title = isCatalog ? "请补充具体药品名称" : "请补充具体中药材名称";
  const summary = isCatalog
    ? "药品百科需要完整药名或通用名，不能只根据“这个药”猜测用法、禁忌或副作用。"
    : "中药材辨识需要药材名、别名或清晰照片，不能只根据“这个药材”猜测性味和搭配风险。";

  return {
    message: [
      `## ${title}`,
      summary,
      "",
      "### 现在先做",
      isCatalog
        ? "- 请告诉我药盒上的完整名称，例如“布洛芬颗粒”；也可以直接拍药盒。"
        : "- 请输入药材名或常见别名，例如“黄芪”；也可以拍清根茎、叶、花或果实特征。"
    ].join("\n"),
    riskCheck: {
      id: createId("skill-input"),
      level: "unknown",
      title,
      summary,
      nextStep: `请补充${subject}后再问。`,
      reasons: [`当前问题没有可唯一匹配的${subject}`],
      sourceIds: ["src-no-evidence"],
      involvedMedicationIds: [],
      medicationSnapshot: [],
      createdAt: nowIso()
    },
    stages: [
      { id: "skill-focus", label: isCatalog ? "确认药品百科技能" : "确认识中药材技能", status: "done" },
      { id: "skill-input", label: `等待${subject}`, status: "done" }
    ],
    mode: "rules"
  };
}

function buildUnknownSkillKnowledgeGap(
  skill: "catalog" | "herbs",
  query: string,
  candidateName: string
): AssistantResponse {
  const subject = skill === "catalog" ? "药品" : "中药材";
  const summary = `资料不足：本地${subject}资料中没有可靠命中“${candidateName}”，需要检索公开资料后再回答。`;
  return {
    message: `## ${candidateName}的资料正在核对\n\n${summary}`,
    riskCheck: {
      id: createId("skill-gap"),
      level: "unknown",
      title: `暂未收录这个${subject}`,
      summary,
      nextStep: `请核对名称是否正确；如名称无误，将以可追溯公开资料补充回答。`,
      reasons: [`未在本地${subject}资料中可靠匹配`],
      sourceIds: ["src-no-evidence"],
      involvedMedicationIds: [],
      medicationSnapshot: [],
      createdAt: nowIso()
    },
    stages: [
      { id: "skill-focus", label: `使用${skill === "catalog" ? "药品百科" : "识中药材"}技能`, status: "done" },
      { id: "skill-gap", label: `发现${subject}知识缺口`, status: "done" }
    ],
    mode: "rules"
  };
}

function candidateForKnowledgeLookup(query: string, skill: "catalog" | "herbs") {
  return query
    .replace(
      /请问|请|帮我|查一下|介绍一下|介绍|说明书|怎么|如何|什么|哪些|注意|用途|功效|用法|用量|剂量|副作用|禁忌|可以|能不能|是否|这个|这种|这味|药材|中药|药|片剂|胶囊|颗粒|丸|散|膏|口服液/g,
      ""
    )
    .replace(/[，。,.、:：;；()（）/?？!！]/g, "")
    .trim();
}

function looksLikeConcreteName(candidate: string): boolean {
  return candidate.length >= 2 && /[\u4e00-\u9fa5A-Za-z]/.test(candidate);
}

export function buildSkillResponse(
  skill: ChatSkill | undefined,
  query: string,
  context: SkillContext
): AssistantResponse | null {
  if (!skill || skill === "photo") return null;

  if (skill === "catalog") {
    const catalogResponse = answerFromDrugCatalog(
      query,
      context.profile,
      context.currentMedicationNames,
      undefined,
      context.answerMode
    );
    const medicine = findBestMedicine(query)?.medicine;
    if (catalogResponse && medicine) {
      return {
        ...catalogResponse,
        message: buildCatalogSkillMessage(
          medicine,
          catalogResponse.riskCheck,
          context.answerMode
        )
      };
    }
    const candidate = candidateForKnowledgeLookup(query, "catalog");
    return looksLikeConcreteName(candidate)
      ? buildUnknownSkillKnowledgeGap("catalog", query, candidate)
      : buildMissingSkillInput("catalog", query);
  }

  if (skill === "herbs") {
    const normalizedQuery = normalize(query);
    const matchedHerbs = herbs
      .map((herb) => {
        const indexes = [herb.name, ...herb.aliases]
          .map((term) => normalizedQuery.indexOf(normalize(term)))
          .filter((index) => index >= 0);
        return {
          herb,
          mentionIndex: indexes.length ? Math.min(...indexes) : Number.POSITIVE_INFINITY
        };
      })
      .filter((item) => Number.isFinite(item.mentionIndex))
      .sort((left, right) => left.mentionIndex - right.mentionIndex)
      .map((item) => item.herb);
    if (!matchedHerbs.length) {
      const candidate = candidateForKnowledgeLookup(query, "herbs");
      return looksLikeConcreteName(candidate)
        ? buildUnknownSkillKnowledgeGap("herbs", query, candidate)
        : buildMissingSkillInput("herbs", query);
    }
    const hasAnticoagulant = context.currentMedicationNames.some((name) =>
      /华法林|阿司匹林|氯吡格雷|利伐沙班/.test(name)
    );
    const hasBleedingRiskHerb = matchedHerbs.some((herb) =>
      /三七|丹参|当归|人参/.test(herb.name)
    );
    const level: RiskLevel =
      hasAnticoagulant && hasBleedingRiskHerb
        ? "high"
        : hasAnticoagulant
          ? "medium"
          : "low";
    const nextStep = hasAnticoagulant
      ? "不要自行同服。请携带药材实物和全部处方药，让医生或药师评估。"
      : "不要用单一症状自行确定体质，也不能用中药材替代处方药。";
    const herbNames = matchedHerbs.map((herb) => herb.name).join("、");

    if (matchedHerbs.length > 1) {
      const quickAnswer = `直接回答：${matchedHerbs
        .map((herb) => `${herb.name}的传统作用为${herb.functions.join("、")}`)
        .join("；")}。这些作用不能替代医生对具体疾病的诊断和治疗。`;
      const herbSections = matchedHerbs.flatMap((herb) => [
        `### ${herb.name}`,
        `传统作用：${herb.functions.join("、")}`,
        `性味归经：${herb.nature} · ${herb.flavor} · 归${herb.meridians.join("、")}经`,
        `辨识要点：${herb.identification.join(" ")}`,
        ...herb.safety.map((item) => `- ${item}`)
      ]);
      return {
        message:
          context.answerMode === "quick"
            ? quickAnswer
            : context.answerMode === "detailed"
              ? [
                  `## ${matchedHerbs.length} 种中药材的详细说明`,
                  `**风险等级：${riskLabel(level)}**`,
                  ...herbSections,
                  "### 共同注意",
                  hasAnticoagulant
                    ? "您当前有需要关注凝血风险的处方药，不要自行把上述药材加入日常服用；请先让医生或药师逐项核对。"
                    : "中药材也需要结合体质、炮制方法和正在服用的药物判断，不能仅凭“补益”或“清热”自行长期服用。",
                  `老人特别说明：${context.profile.age >= 65 ? "您年龄较大，更应避免自行叠加药材和保健品。" : "使用前仍需核对年龄和基础疾病。"}`,
                  "### 判断依据",
                  `- 已分别匹配中药材：${herbNames}`,
                  `- 当前基础疾病：${context.profile.conditions.join("、") || "未填写"}`,
                  "### 下一步",
                  `- ${nextStep}`
                ].join("\n\n")
              : [
                  `## ${matchedHerbs.length} 种中药材安全问药`,
                  `**风险等级：${riskLabel(level)}**`,
                  ...herbSections,
                  "### 现在先做",
                  `- ${nextStep}`
                ].join("\n\n"),
        riskCheck: {
          id: createId("skill-herbs"),
          level,
          title: `${matchedHerbs.length} 种中药材需要分别判断用途与风险`,
          summary: matchedHerbs
            .map((herb) => `${herb.name}：${herb.functions.join("、")}`)
            .join("；"),
          nextStep,
          reasons: [
            `已分别匹配中药材：${herbNames}`,
            `当前基础疾病：${context.profile.conditions.join("、") || "未填写"}`
          ],
          sourceIds: ["src-herb-catalog"],
          involvedMedicationIds: [],
          medicationSnapshot: context.currentMedicationNames,
          createdAt: nowIso()
        },
        stages: [
          {
            id: "skill-herb-matches",
            label: `分别识别中药材：${herbNames}`,
            status: "done"
          },
          {
            id: "skill-herb-safety",
            label: "逐项核对用途、辨识与安全提醒",
            status: "done"
          },
          {
            id: "skill-herb-answer",
            label: "生成多种药材对应解答",
            status: "done"
          }
        ],
        mode: "rules"
      };
    }

    const herb = matchedHerbs[0];
    const singleHerbMessage =
      context.answerMode === "quick"
        ? `直接回答：${herb.name}的传统作用是${herb.functions.join("、")}。${herb.safety[0] || nextStep}`
        : context.answerMode === "detailed"
          ? [
              `## ${herb.name}的详细说明`,
              `**风险等级：${riskLabel(level)}**`,
              "### 药材基本信息",
              `性味归经：${herb.nature} · ${herb.flavor} · 归${herb.meridians.join("、")}经`,
              `传统作用：${herb.functions.join("、")}`,
              herb.traditionalUse,
              "### 辨识要点",
              ...herb.identification.map((item) => `- ${item}`),
              "### 安全提醒",
              ...herb.safety.map((item) => `- ${item}`),
              "### 判断依据",
              `- 已匹配中药材：${herb.name}`,
              `- 当前基础疾病：${context.profile.conditions.join("、") || "未填写"}`,
              "### 下一步",
              `- ${nextStep}`
            ].join("\n\n")
          : [
              `## ${herb.name}安全问药`,
              `**风险等级：${riskLabel(level)}**`,
              `传统作用：${herb.functions.join("、")}`,
              "",
              "### 需要重点关注",
              ...herb.safety.slice(0, 2).map((item) => `- ${item}`),
              "### 现在先做",
              `- ${nextStep}`
            ].join("\n\n");
    return {
      message: singleHerbMessage,
      riskCheck: {
        id: createId("skill-herb"),
        level,
        title: hasAnticoagulant
          ? `${herb.name}与当前抗凝用药需要专业核对`
          : `${herb.name}使用前需要核对`,
        summary: herb.traditionalUse,
        nextStep,
        reasons: [
          `已匹配中药材：${herb.name}`,
          `当前基础疾病：${context.profile.conditions.join("、") || "未填写"}`
        ],
        sourceIds: ["src-herb-catalog"],
        involvedMedicationIds: [],
        medicationSnapshot: context.currentMedicationNames,
        createdAt: nowIso()
      },
      stages: [
        { id: "skill-herb-match", label: `识别中药材：${herb.name}`, status: "done" },
        { id: "skill-herb-safety", label: "核对辨识要点与当前用药", status: "done" },
        { id: "skill-herb-answer", label: "生成中药材针对性解答", status: "done" }
      ],
      mode: "rules"
    };
  }

  return buildMultiDrugResponse(query, context);
}

export function isSkillAnswerCompliant(
  skill: ChatSkill | undefined,
  candidate: string,
  groundingText: string
): boolean {
  const text = candidate.trim();
  if (!skill || skill === "photo" || !text) return true;

  if (skill === "catalog") {
    const match =
      groundingText.match(/已匹配：([^\n]+)/)?.[1]?.trim() ||
      groundingText.match(/^## (.+?)(?:介绍|详细说明)/m)?.[1]?.trim();
    const medicine = match ? findBestMedicine(match)?.medicine : undefined;
    if (!medicine) {
      return /(药品|通用名|药名|用法|用量|剂量|禁忌|副作用|不良反应|服用)/.test(text);
    }
    return [medicine.displayName, medicine.activeIngredient, ...medicine.aliases]
      .filter(Boolean)
      .some((term) => text.includes(term));
  }

  if (skill === "herbs") {
    const matchedLine = groundingText.match(
      /已(?:分别)?匹配中药材：([^\n]+)/
    )?.[1];
    const expectedNames = matchedLine
      ? matchedLine.split(/[、，,]/).map((name) => name.trim()).filter(Boolean)
      : [];
    const expectedHerbs = expectedNames.length
      ? expectedNames
          .map((name) =>
            herbs.find(
              (herb) => herb.name === name || herb.aliases.includes(name)
            )
          )
          .filter((herb): herb is (typeof herbs)[number] => Boolean(herb))
      : herbs.filter(
          (herb) =>
            groundingText.includes(`识别到中药材：${herb.name}`) ||
            groundingText.includes(`### ${herb.name}`)
        );
    if (!expectedHerbs.length) {
      return /(中药材|药材|性味|归经|辨识|传统用途|配伍)/.test(text);
    }
    return (
      expectedHerbs.every((herb) =>
        [herb.name, ...herb.aliases].some((term) => text.includes(term))
      ) &&
      /(作用|功效|传统|性味|归经|辨识|安全|注意)/.test(text)
    );
  }

  return /(对账|重复成分|同类药|相互作用|同服|联合用药|错开服用|正在用|用药清单)/.test(
    text
  );
}
