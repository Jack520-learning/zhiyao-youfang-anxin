import type { HerbEntry } from "../catalog/herbs";
import type {
  AssistantResponse,
  ElderProfile,
  Medication
} from "../types";
import { nowIso } from "./time";

export type HerbAnswerContext = Pick<
  HerbEntry,
  | "aliases"
  | "nature"
  | "flavor"
  | "meridians"
  | "functions"
  | "traditionalUse"
  | "safety"
  | "identification"
>;

export function answerHerbQuestion(
  herbName: string,
  question: string,
  hasHighRiskMedication: boolean,
  herb?: HerbAnswerContext
): string {
  const normalized = question.trim();
  if (!normalized) return "";
  if (/成分|有效成分|含什么|化学组成/.test(normalized)) {
    return `结论：当前药材资料主要收录${herbName}的性味、归经、传统功用、辨识和安全提醒，没有足够可靠数据列出完整化学成分。

重点：${herb?.functions.join("、") || "传统功用需结合具体品种和炮制方法理解"}。

下一步：如需核对化学成分、质量标准或含量，请以《中国药典》、正式饮片包装和中药师审核结果为准，不要凭网传成分表自行使用。`;
  }
  if (/是什么|功效|作用|有什么用|治什么|传统功用/.test(normalized)) {
    return `结论：${herbName}${herb ? `性${herb.nature}、味${herb.flavor}，归${herb.meridians.join("、")}经` : ""}。

传统功用：${herb?.functions.join("、") || "请查看当前药材条目"}。

使用边界：${herb?.traditionalUse || "这些资料用于传统知识参考，不能替代诊断或处方。"}

下一步：是否适合您需要结合体质、症状、炮制方法和正在使用的药物，由中医师或药师判断。`;
  }
  if (/辨识|怎么认|长什么样|外观|别名/.test(normalized)) {
    return `结论：辨识${herbName}不能只看颜色或单一特征，需要结合形态、气味、质地和来源。

辨识要点：${herb?.identification.join("；") || "请查看当前药材条目的辨识说明"}。

别名参考：${herb?.aliases.join("、") || "暂无别名资料"}。

下一步：不确定品种时不要食用；饮片应保留正规包装并让药师核对。`;
  }
  if (/禁忌|副作用|安全|不能吃|哪些人不能|注意什么/.test(normalized)) {
    return `结论：${herbName}不是人人都适合，也不能因为属于传统药材就认为没有风险。

安全提醒：${herb?.safety.join("；") || "使用前需要专业评估"}。

下一步：${hasHighRiskMedication ? "您当前有需要重点关注的处方药，使用前必须让医生或药师核对。" : "同时使用西药、慢病用药或保健品时，应先让医生或药师核对。"} 出现严重不适应立即就医。`;
  }
  if (/多少钱|价格|价钱|哪里买|购买|最便宜/.test(normalized)) {
    return "结论：目前没有可靠的中药材实时价格数据，不能自动判断哪里购买最便宜。\n\n下一步：请到正规医疗机构药房或正规药店核对品种、产地和规格。不要因价格便宜购买来源不明的药材。";
  }
  if (/量|几克|吃多少|喝多少|剂量/.test(normalized)) {
    return `结论：不能仅凭“${herbName}”名称给您推荐自行用量。\n\n原因：中药用量需要结合品种、炮制方法、年龄、体重、肝肾功能、疾病和正在服用的药物。\n\n下一步：请让中医师或药师根据具体情况开具和核对，不要按短视频或网传配方自行加量。`;
  }
  if (/一起吃|同服|相互作用|西药|能不能配/.test(normalized)) {
    return `结论：${hasHighRiskMedication ? "您当前使用了需要重点关注出血或慢病风险的处方药，不能自行把中药叠加进去。" : "当前知识库不足以判断这组中西药组合是否安全。"}\n\n原因：药材成分复杂，保健品、饮片和中成药的规格也可能不同。\n\n下一步：把药材实物、包装和全部西药清单交给医生或药师核对；如出现出血、严重头晕或呼吸困难，立即就医。`;
  }
  return `结论：请先阅读这款药材页面中的传统功用、安全提醒和辨识要点。\n\n下一步：不要用单一症状自行确定体质，也不要把它替代处方药。需要个体化建议时，请让中医师或药师查看实物。`;
}

export function buildHerbChatResponse(
  herb: HerbEntry,
  query: string,
  medications: Medication[],
  _profile: ElderProfile
): AssistantResponse {
  const activeMedications = medications.filter(
    (medication) => medication.status === "active"
  );
  const highRiskMedication = activeMedications.some((medication) =>
    /华法林|阿司匹林|氯吡格雷|胰岛素/.test(
      `${medication.name}${medication.genericName}`
    )
  );
  const answer = answerHerbQuestion(
    herb.name,
    query,
    highRiskMedication,
    herb
  );
  const interactionQuery = /一起吃|同服|相互作用|西药|能不能配/.test(query);
  const level =
    interactionQuery && highRiskMedication ? "medium" : "unknown";
  return {
    message: answer,
    riskCheck: {
      id: `herb-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      level,
      title: `${herb.name}中药材资料`,
      summary: answer,
      nextStep:
        answer.split("下一步：")[1]?.split(/\n\n/)[0] ||
        "涉及体质、剂量和中西药同用时，请咨询中医师或药师。",
      reasons: [
        `已匹配中药材条目：${herb.name}`,
        "回答仅使用当前本草资料和安全边界"
      ],
      sourceIds: ["src-herb-catalog"],
      involvedMedicationIds: activeMedications.map(
        (medication) => medication.id
      ),
      medicationSnapshot: activeMedications.map(
        (medication) => medication.name
      ),
      createdAt: nowIso(),
      trackInRiskSummary: false
    },
    stages: [
      { id: "herb-match", label: `匹配中药材：${herb.name}`, status: "done" },
      { id: "herb-question", label: "识别当前问题的资料字段", status: "done" },
      { id: "herb-safety", label: "核对安全边界与当前用药", status: "done" }
    ],
    mode: "rules",
    conversationOnly: true
  };
}
