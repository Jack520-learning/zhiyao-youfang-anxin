import { getMedicine } from "./medicines";
import type { Interaction, InteractionResult } from "./types";

function pair(a: string, b: string): string {
  return [a, b].sort().join("::");
}

const interactionList: Interaction[] = [
  {
    a: "warfarin",
    b: "aspirin",
    severity: "high",
    title: "出血风险明显增加",
    explanation: "华法林与阿司匹林分别影响凝血和血小板功能，联合使用时出血风险可能叠加。",
    action: "不要自行同服。若医生同时开具，应严格监测 INR、出血表现和复诊时间。",
  },
  {
    a: "warfarin",
    b: "ibuprofen",
    severity: "high",
    title: "消化道出血风险增加",
    explanation: "布洛芬可能损伤胃黏膜并影响血小板，与华法林联用时出血风险升高。",
    action: "避免自行同服。需要止痛时先咨询医生或药师，确认更适合的替代方案。",
  },
  {
    a: "warfarin",
    b: "ibuprofen-granules",
    severity: "high",
    title: "颗粒剂与华法林同用仍有出血风险",
    explanation: "布洛芬颗粒同样属于非甾体抗炎药，可能损伤胃黏膜并影响止血，与华法林同用时出血风险升高。",
    action: "不要因为换成颗粒剂就认为更安全，使用前必须咨询医生或药师。",
  },
  {
    a: "warfarin",
    b: "ibuprofen-tablets",
    severity: "high",
    title: "布洛芬片与华法林同用会增加出血风险",
    explanation: "布洛芬片与华法林联用可能同时损伤胃黏膜和影响凝血，导致消化道或其他部位出血风险升高。",
    action: "不要自行同服。需要止痛或退烧时先联系医生或药师。",
  },
  {
    a: "aspirin",
    b: "ibuprofen",
    severity: "high",
    title: "胃出血风险与抗血小板作用受影响",
    explanation: "两者同属影响前列腺素的药物，联用可能增加胃出血；布洛芬还可能干扰小剂量阿司匹林的抗血小板作用。",
    action: "不要自行叠加。必须联用时，由医生安排剂量与服药间隔。",
  },
  {
    a: "aspirin",
    b: "ibuprofen-granules",
    severity: "high",
    title: "颗粒剂与阿司匹林不宜自行同服",
    explanation: "布洛芬颗粒与阿司匹林同属非甾体抗炎药，联用会增加胃出血风险，并可能影响小剂量阿司匹林的抗血小板作用。",
    action: "不要自行叠加。需要止痛或退烧时先咨询医生或药师。",
  },
  {
    a: "aspirin",
    b: "ibuprofen-tablets",
    severity: "high",
    title: "布洛芬片与阿司匹林不宜自行同服",
    explanation: "两者同属非甾体抗炎药，联用会增加胃出血风险，并可能影响小剂量阿司匹林的抗血小板作用。",
    action: "不要自行叠加。必须联用时由医生安排剂量与服药间隔。",
  },
  {
    a: "ibuprofen",
    b: "ibuprofen-granules",
    severity: "high",
    title: "属于同一成分重复用药",
    explanation: "缓释胶囊和颗粒都含布洛芬，同时服用会造成布洛芬总剂量叠加。",
    action: "不要同时使用。二者只能选择一种，并按下一次服药时间重新核对剂量。",
  },
  {
    a: "ibuprofen",
    b: "ibuprofen-tablets",
    severity: "high",
    title: "胶囊与片剂属于同一成分重复用药",
    explanation: "缓释胶囊和布洛芬片都含布洛芬，同时服用会造成总剂量叠加。",
    action: "不要同时使用。只能选择一种，并核对每片或每粒含量。",
  },
  {
    a: "ibuprofen-granules",
    b: "ibuprofen-tablets",
    severity: "high",
    title: "颗粒与片剂属于同一成分重复用药",
    explanation: "颗粒剂和普通片都含布洛芬，同时服用会造成布洛芬总剂量叠加。",
    action: "不要同时使用。选择一种后重新核对剂量。",
  },
  {
    a: "valsartan",
    b: "ibuprofen-granules",
    severity: "caution",
    title: "颗粒剂也可能影响肾功能和降压效果",
    explanation: "布洛芬颗粒属于非甾体抗炎药，可能减弱缬沙坦降压作用，脱水或肾功能异常时肾损伤风险更高。",
    action: "不要长期自行合用。服用前告知医生，并关注尿量、水肿和血压变化。",
  },
  {
    a: "valsartan",
    b: "ibuprofen-tablets",
    severity: "caution",
    title: "布洛芬片可能影响肾功能和降压效果",
    explanation: "布洛芬片可能减弱缬沙坦的降压作用，在脱水或肾功能异常时可能增加肾损伤风险。",
    action: "不要长期自行合用，服用前告知医生并关注尿量、水肿和血压变化。",
  },
  {
    a: "losartan",
    b: "ibuprofen-tablets",
    severity: "caution",
    title: "布洛芬片可能影响氯沙坦的降压效果",
    explanation: "非甾体抗炎药可能减弱氯沙坦的降压作用，在脱水或肾功能异常时可能增加肾损伤风险。",
    action: "不要长期自行合用，尤其是老年人和肾病患者应先咨询医生。",
  },
  {
    a: "compound-cold",
    b: "ibuprofen-granules",
    severity: "caution",
    title: "复方感冒药与布洛芬需核对成分",
    explanation: "布洛芬与部分复方感冒药可能造成重复用药或增加胃肠道与肾脏负担。",
    action: "逐项核对两种药的成分和剂量，联合使用前咨询医生或药师。",
  },
  {
    a: "clopidogrel",
    b: "aspirin",
    severity: "caution",
    title: "双联抗血小板需严格遵医嘱",
    explanation: "两者联用会增加出血风险，但在部分心脑血管疾病中可能是医生有意安排的治疗方案。",
    action: "不要自行开始或停止组合。确认处方、疗程和异常出血的应对方式。",
  },
  {
    a: "clopidogrel",
    b: "omeprazole",
    severity: "caution",
    title: "可能影响氯吡格雷的活化",
    explanation: "奥美拉唑可能降低氯吡格雷转化为活性代谢物的程度，具体影响因个体和方案而异。",
    action: "不要自行换停药。请医生或药师评估是否需要调整抑酸药。",
  },
  {
    a: "acetaminophen",
    b: "compound-cold",
    severity: "high",
    title: "可能重复摄入对乙酰氨基酚",
    explanation: "不少复方感冒药已经含有对乙酰氨基酚，再额外服用退烧药容易超过安全剂量并增加肝损伤风险。",
    action: "立即核对两种药的成分表，不要叠加。需要联合时先让药师计算总摄入量。",
  },
  {
    a: "valsartan",
    b: "ibuprofen",
    severity: "caution",
    title: "肾功能与降压效果可能受影响",
    explanation: "非甾体抗炎药可能减弱缬沙坦的降压作用，在脱水或肾功能异常时还可能增加肾损伤风险。",
    action: "尤其不能长期自行合用。服用前告知医生，并关注尿量、水肿和血压变化。",
  },
  {
    a: "warfarin",
    b: "amoxicillin",
    severity: "caution",
    title: "感染期间需关注 INR 和出血",
    explanation: "部分患者在使用阿莫西林期间可能出现 INR 变化，感染和饮食变化也会影响抗凝效果。",
    action: "不要自行停抗凝药，联系开药医生安排 INR 监测并观察异常出血。",
  },
  {
    a: "warfarin",
    b: "amoxicillin-granules",
    severity: "caution",
    title: "阿莫西林颗粒与华法林需监测出血",
    explanation: "感染、饮食变化和部分患者用药后的 INR 波动都可能影响华法林安全性。",
    action: "不要自行停抗凝药，联系开药医生安排 INR 监测并观察异常出血。",
  },
  {
    a: "warfarin",
    b: "atorvastatin",
    severity: "caution",
    title: "抗凝监测不可省略",
    explanation: "他汀类药物在部分患者中可能影响华法林作用，开始、停药或换剂量时需要重新评估。",
    action: "保持按医嘱监测 INR，并把所有新药告知医生或药师。",
  },
  {
    a: "amlodipine",
    b: "atorvastatin",
    severity: "info",
    title: "高剂量他汀时需关注相互作用",
    explanation: "氨氯地平可能增加阿托伐他汀暴露，通常在常规低至中等剂量下风险可控。",
    action: "按处方剂量服用，出现明显肌肉疼痛或无力时及时就医。",
  },
  {
    a: "loratadine",
    b: "cetirizine",
    severity: "info",
    title: "属于重复抗过敏治疗",
    explanation: "两者都是抗组胺药，同时使用通常不会带来额外收益，反而可能增加嗜睡和口干。",
    action: "选择一种即可；如果症状控制不佳，请医生或药师调整方案。",
  },
  {
    a: "warfarin",
    b: "cefixime-tablets",
    severity: "caution",
    title: "头孢克肟期间需观察出血与 INR",
    explanation: "抗感染治疗、饮食变化或药物相互作用可能影响华法林作用。",
    action: "不要自行停抗凝药，联系开药医生监测 INR 并观察异常出血。",
  },
  {
    a: "warfarin",
    b: "cefuroxime-axetil-tablets",
    severity: "caution",
    title: "头孢呋辛酯与华法林需要监测",
    explanation: "部分患者在联合用药期间可能出现凝血指标变化。",
    action: "使用前告知医生正在服用华法林，并按要求监测 INR。",
  },
  {
    a: "warfarin",
    b: "cefdinir-capsules",
    severity: "caution",
    title: "头孢地尼期间不可省略抗凝监测",
    explanation: "感染和联合用药可能影响华法林的安全范围。",
    action: "联系开药医生监测 INR，并观察黑便、血尿或异常瘀斑。",
  },
  {
    a: "warfarin",
    b: "cefalexin-capsules",
    severity: "caution",
    title: "头孢氨苄与华法林需关注出血",
    explanation: "联合用药期间部分患者可能出现凝血指标变化。",
    action: "不要自行停抗凝药，使用抗菌药前告知医生并监测出血表现。",
  },
  {
    a: "warfarin",
    b: "cefaclor-capsules",
    severity: "caution",
    title: "头孢克洛与华法林需要专业监测",
    explanation: "感染、饮食变化和联合用药都可能影响华法林的抗凝效果。",
    action: "使用前告知医生，按安排监测 INR 并观察异常出血。",
  },
];

export const interactionRules = interactionList;

const interactionMap = new Map(
  interactionList.map((interaction) => [pair(interaction.a, interaction.b), interaction]),
);

export function findInteractions(slugs: string[]): InteractionResult[] {
  const uniqueSlugs = [...new Set(slugs)].filter((slug) => Boolean(getMedicine(slug)));
  const results: InteractionResult[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < uniqueSlugs.length; i += 1) {
    for (let j = i + 1; j < uniqueSlugs.length; j += 1) {
      const a = uniqueSlugs[i];
      const b = uniqueSlugs[j];
      const key = pair(a, b);
      if (seen.has(key)) continue;
      seen.add(key);

      const medicineA = getMedicine(a);
      const medicineB = getMedicine(b);
      if (!medicineA || !medicineB) continue;

      const known = interactionMap.get(key);
      if (known) {
        results.push({
          severity: known.severity,
          title: known.title,
          explanation: known.explanation,
          action: known.action,
          medicineNames: [medicineA.displayName, medicineB.displayName],
        });
        continue;
      }

      if (a === "montmorillonite" || b === "montmorillonite") {
        results.push({
          severity: "caution",
          title: "蒙脱石散会吸附其他口服药",
          explanation: "蒙脱石散可能降低其他口服药物的吸收，不能在同一时段一起服用。",
          action: "将蒙脱石散与其他口服药至少间隔 2 小时，并参考具体说明书。",
          medicineNames: [medicineA.displayName, medicineB.displayName],
        });
      }
    }
  }

  const severityOrder = { high: 0, caution: 1, info: 2 };
  return results.sort((left, right) => severityOrder[left.severity] - severityOrder[right.severity]);
}

export { interactionList };
