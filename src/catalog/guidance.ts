import { findInteractions } from "./interactions";
import { getMedicine } from "./medicines";
import type {
  AdviseRequest,
  Guidance,
  HealthContext,
  Medicine,
} from "./types";

const contextLabels: Record<HealthContext, string> = {
  older: "65 岁以上",
  pregnancy: "怀孕或哺乳",
  kidney: "肾脏疾病",
  liver: "肝脏疾病",
  alcohol: "近期饮酒",
  surgery: "近期手术或有创操作",
  allergy: "药物过敏史",
};

function specialGroupWarning(medicine: Medicine, context: HealthContext): string | null {
  if (context === "older") return medicine.specialGroups.older;
  if (context === "pregnancy") return medicine.specialGroups.pregnancy;
  if (context === "kidney") return medicine.specialGroups.kidney;
  if (context === "liver") return medicine.specialGroups.liver;

  if (context === "alcohol") {
    return `你选择了“${contextLabels.alcohol}”。服药期间不要饮酒，酒精可能加重胃、肝或低血压风险。`;
  }
  if (context === "surgery") {
    return "近期有手术、拔牙或其他有创操作时，请主动告知医生全部正在使用的药物，尤其是抗凝和抗血小板药。";
  }
  if (context === "allergy") {
    return "你选择了“药物过敏史”。请先核对成分和辅料；出现呼吸困难、面唇肿胀或全身皮疹应立即就医。";
  }
  return null;
}

function drugSpecificRedFlags(medicine: Medicine): string[] {
  const common = "症状突然加重、意识异常或无法正常进食饮水时，应及时就医。";
  const flags: Record<string, string[]> = {
    warfarin: [
      "黑便、血尿、呕血、持续头痛或无法止住的出血：立即前往急诊。",
      "任何新药、中药或保健品开始前：先联系医生或药师核对 INR 与相互作用。",
    ],
    aspirin: [
      "黑便、呕血、突发剧烈头痛或一侧肢体无力：立即拨打急救电话。",
    ],
    clopidogrel: [
      "黑便、呕血、血尿或异常持续的鼻出血：立即就医。",
    ],
    nitroglycerin: [
      "胸痛含服后仍未缓解、伴大汗、呼吸困难或濒死感：立即拨打 120，不要继续等待。",
    ],
    amoxicillin: [
      "呼吸困难、面唇肿胀、全身大片皮疹或意识异常：立即拨打急救电话。",
    ],
    ibuprofen: [
      "黑便、呕血、尿量明显减少、胸闷或突发呼吸困难：立即就医。",
    ],
    metformin: [
      "异常乏力、呼吸困难、持续腹痛或明显脱水：立即就医。",
    ],
    atorvastatin: [
      "持续肌肉疼痛、无力或深色尿：暂停自行处理并尽快就医。",
    ],
  };
  return [...(flags[medicine.slug] ?? []), common];
}

function answerKnownQuestion(
  medicine: Medicine,
  question: string,
  interactionTitles: string[],
): string {
  const normalized = question.trim();
  if (!normalized) return "";

  if (/多少钱|价格|价钱|最便宜|哪个平台|哪里买|购买|医保|报销/.test(normalized)) {
    return `结论：我无法核实实时价格，也不能判断哪个平台最便宜。

原因：同一种药可能有不同厂家、规格和包装，平台价格、运费、优惠活动及医保政策也会变化；本产品没有接入实时电商或医保价格数据。

下一步：拍下药盒正面和说明书规格，在公立医院药房或正规连锁药店的官方网站、官方应用核对。不要只因为价格便宜自行更换药品，也不要在无法确认资质的个人卖家处购买。如果你问的是处方药，请先遵循医生给出的药品和疗程。`;
  }

  if (/酒|啤酒|白酒|饮酒/.test(normalized)) {
    return `结论：服用${medicine.displayName}期间不建议饮酒。

原因：${medicine.food} 酒精还可能与药物共同增加胃、肝、低血压或嗜睡等风险。

下一步：如果已经饮酒，先停止继续饮酒并观察是否出现明显不适；有基础病、正在服用抗凝药或降糖药时，建议尽快联系医生或药师。`;
  }
  if (/吃多了|过量|误服|吃错|重复吃了/.test(normalized)) {
    return `结论：怀疑${medicine.displayName}服用过量时，不要继续补服或等待在线回答。

原因：药物过量可能出现延迟或严重反应，处理方式取决于具体剂量、时间和个人情况。

下一步：保留药盒并立即联系急诊、医生或中毒咨询机构；出现意识异常、呼吸困难、抽搐或剧烈不适时拨打 120。`;
  }
  if (/漏服|忘了|少吃一次/.test(normalized)) {
    return `结论：不要为了补服而自行加倍。

原因：双倍服药可能让短时间内药物浓度过高，增加不良反应。

下一步：查看手中说明书的漏服规则。若已经接近下一次服药时间，通常应跳过漏服剂量；${medicine.displayName}属于处方药或你正在使用抗凝药、降糖药时，请直接联系医生或药师确认。`;
  }
  if (/一起吃|同服|联用|相互作用|能不能配/.test(normalized)) {
    if (!interactionTitles.length) {
      return `结论：当前知识库没有命中明确相互作用，但不能据此认定绝对安全。

原因：未收录药物、中药、保健品以及个人肝肾功能都可能影响联合用药风险。

下一步：把全部药盒、剂量和用药时间交给医生或药师核对；出现黑便、异常出血、严重头晕或呼吸困难时立即就医。`;
    }
    return `结论：当前组合需要重点关注。

原因：知识库命中以下风险：${interactionTitles.join("；")}。

下一步：不要自行开始、停止或调整药物，先查看页面中的联合用药风险详情，并把完整用药清单交给医生或药师确认。`;
  }
  if (/禁忌|禁用|不能吃|不适合|什么情况下不能/.test(normalized)) {
    return `结论：使用${medicine.displayName}前需要核对说明书禁忌和警告。

重点警告：${medicine.keyWarnings.join("；")}

下一步：如您有肝肾功能异常、怀孕或哺乳、近期手术、消化道出血、药物过敏，或正在服用其他处方药，请让医生或药师确认是否适合使用。`;
  }
  if (/老人|老年|65岁|高龄/.test(normalized)) {
    return `结论：${medicine.specialGroups.older}

原因：老年人可能同时存在肝肾功能变化、多种慢病和联合用药，出现头晕、出血或低血糖后的后果也更高。

下一步：按医生确认的剂量使用，复诊时携带全部药盒，不要自行增加剂量。`;
  }
  if (/几片|多少|剂量|怎么吃|几次|多久/.test(normalized)) {
    return `结论：${medicine.howToTake}

注意上限：${medicine.maxDaily}

下一步：先核对手中包装每片或每粒的含量。不同厂家和剂型不能直接套用同一剂量；不确定时拍下包装正反面并咨询医生或药师。`;
  }
  if (/副作用|不良反应|难受/.test(normalized)) {
    return `结论：较常见的不适包括${medicine.sideEffects.join("、")}。

怎么观察：轻微不适可记录出现时间和是否与服药有关，不要自行加倍或叠加其他药。

何时求助：症状持续或加重，或出现严重过敏、出血、呼吸困难、胸痛等情况时，请及时就医或拨打 120。`;
  }
  if (/开车|驾驶|嗜睡|犯困|反应慢/.test(normalized)) {
    return `结论：服药后如果出现嗜睡、头晕或反应变慢，不要驾驶或操作机械。

注意：${medicine.displayName}的不良反应包括${medicine.sideEffects.join("、")}，具体驾驶警示以说明书为准。

下一步：首次服用或调整剂量后先观察反应；需要驾驶时咨询医生或药师。`;
  }
  if (/储存|保存|冷藏|放冰箱|避光/.test(normalized)) {
    return `结论：${medicine.displayName}的储存条件必须查看手中包装和说明书。

原因：不同药品对温度、湿度、光照和冷藏要求不同，不能按药名经验推断。

下一步：保持原包装和说明书，避免潮湿和高温；过期、变色、受潮或包装破损时不要继续使用。`;
  }
  if (/怀孕|孕期|哺乳/.test(normalized)) {
    return medicine.specialGroups.pregnancy;
  }
  if (/肾/.test(normalized)) {
    return medicine.specialGroups.kidney;
  }
  if (/肝/.test(normalized)) {
    return medicine.specialGroups.liver;
  }

  return `结论：${medicine.howToTake}

重点注意：${medicine.keyWarnings[0]}

下一步：这个问题可能涉及你的年龄、肝肾功能、同服药物或其他个体情况。当前知识卡不足以保证个体化判断，请把药盒和完整用药清单交给开药医生或药师确认。`;
}

export function buildLocalGuidance(request: AdviseRequest): Guidance | null {
  const medicine = getMedicine(request.medicineSlug);
  if (!medicine) return null;

  const context = [...new Set(request.healthContext)];
  const personalWarnings = context
    .map((item) => specialGroupWarning(medicine, item))
    .filter((warning): warning is string => Boolean(warning));
  const interactions = findInteractions([medicine.slug, ...request.companionSlugs]);
  const questionAnswer = request.question
    ? answerKnownQuestion(
        medicine,
        request.question,
        interactions.map((interaction) => interaction.title),
      )
    : undefined;

  return {
    headline: `先核对规格，再按说明使用${medicine.displayName}`,
    plainSummary: `${medicine.displayName}为${medicine.category}用药，常见规格是${medicine.strength}。${medicine.howToTake} 本结果用于帮助读懂说明，不替代医生诊断或处方。`,
    questionAnswer,
    doseSteps: [
      `核对药名与规格：${medicine.displayName}，${medicine.strength}。`,
      `参考用法：${medicine.howToTake}`,
      `每日上限：${medicine.maxDaily}`,
      `服用时机：${medicine.timing}`,
      `饮食配合：${medicine.food}`,
    ],
    safetyPoints: medicine.keyWarnings,
    interactions,
    personalWarnings,
    redFlags: drugSpecificRedFlags(medicine),
    sourceLabels: [medicine.sourceTitle, medicine.sourceNote],
    mode: "local",
  };
}
