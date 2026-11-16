import type { RiskLevel } from "../types";

export interface SafetyTopic {
  id: string;
  title: string;
  keywords: string[];
  riskLevel: RiskLevel;
  summary: string;
  nextStep: string;
  sourceIds: string[];
}

const sourceIds = ["src-common-safety"];

export const safetyTopics: SafetyTopic[] = [
  {
    id: "missed-dose-general",
    title: "漏服后不要自行补双倍",
    keywords: ["漏服", "忘了吃", "忘记吃", "少吃一次", "补服", "补吃"],
    riskLevel: "medium",
    summary:
      "漏服后是否补服取决于药物、距离下一次服药的时间和说明书，不应自行加倍。",
    nextStep:
      "查看手中说明书的漏服规则。抗凝药、胰岛素、降糖药或抗癫痫药漏服时，直接联系医生或药师。",
    sourceIds
  },
  {
    id: "unsure-taken",
    title: "不确定是否吃过时先核对，不要直接补两倍",
    keywords: ["不确定吃没吃", "不知道吃没吃", "忘了是否吃", "是否吃过", "重复吃"],
    riskLevel: "medium",
    summary:
      "不确定是否已经服药时，无法仅凭时间判断是否补服；重复服用可能增加不良反应。",
    nextStep:
      "先查看药盒、分药盒和服药记录。若无法确认，联系医生或药师；出现不适时立即求助。",
    sourceIds
  },
  {
    id: "accidental-overdose",
    title: "怀疑服药过量应立即联系专业人员",
    keywords: ["吃多了", "服药过量", "一次吃了好几片", "重复吃了", "多吃了"],
    riskLevel: "high",
    summary:
      "过量服药可能导致严重不良反应，在线问答不能替代中毒评估或解毒处理。",
    nextStep:
      "保留药盒并立即联系急诊、医生或中毒咨询机构；出现意识异常、呼吸困难或抽搐时拨打 120。",
    sourceIds
  },
  {
    id: "medicine-alcohol",
    title: "服药期间不建议自行饮酒",
    keywords: ["喝酒", "饮酒", "啤酒", "白酒", "红酒", "酒精"],
    riskLevel: "medium",
    summary:
      "酒精可能加重肝脏负担、胃刺激、嗜睡、低血压或低血糖，并影响部分药物代谢。",
    nextStep:
      "查看具体药品说明书是否禁酒。已经饮酒并出现明显头晕、呕吐、意识异常或呼吸困难时及时就医。",
    sourceIds
  },
  {
    id: "split-crush",
    title: "缓释、控释和肠溶制剂不要自行掰开或碾碎",
    keywords: ["掰开", "掰半", "碾碎", "磨碎", "嚼碎", "研碎"],
    riskLevel: "medium",
    summary:
      "缓释、控释、肠溶和部分胶囊被破坏后可能一次释放过多药物，或失去对胃部的保护。",
    nextStep:
      "核对药名、剂型、刻痕和说明书。吞咽困难时咨询医生或药师，不要自行改变服法。",
    sourceIds
  },
  {
    id: "food-timing",
    title: "饭前饭后以具体说明书为准",
    keywords: ["饭前", "饭后", "空腹", "随餐", "餐前", "餐后", "什么时候吃"],
    riskLevel: "low",
    summary:
      "不同药物对进食时间有不同要求，不能把一种药的饭前饭后规则套用到另一种药。",
    nextStep:
      "查看包装或说明书中的服用时间；没有明确说明时联系医生或药师。",
    sourceIds
  },
  {
    id: "milk-juice",
    title: "不要随意用牛奶、茶或果汁送服",
    keywords: ["牛奶送服", "果汁送服", "茶水送服", "饮料送服", "葡萄柚", "西柚"],
    riskLevel: "medium",
    summary:
      "牛奶、茶、葡萄柚汁等可能影响部分药物吸收或代谢，具体影响取决于药物。",
    nextStep:
      "除非说明书允许，通常使用适量温水送服。正在服用慢病药时，把常喝的果汁或保健品告诉药师。",
    sourceIds
  },
  {
    id: "antibiotic-course",
    title: "抗生素疗程不要凭感觉提前停止",
    keywords: ["抗生素", "消炎药", "头孢", "阿莫西林", "症状好了", "提前停药"],
    riskLevel: "medium",
    summary:
      "抗生素只对细菌感染有效，疗程与感染部位、药物和个体情况有关。症状好转不等于可以自行停药。",
    nextStep:
      "按处方疗程使用。出现皮疹、呼吸困难、严重腹泻或面唇肿胀时停止自行处理并尽快就医。",
    sourceIds
  },
  {
    id: "duplicate-cold-medicine",
    title: "复方感冒药容易隐藏重复成分",
    keywords: ["感冒药", "复方感冒", "退烧药", "对乙酰氨基酚", "重复成分", "退热"],
    riskLevel: "high",
    summary:
      "多种复方感冒药可能同时含有对乙酰氨基酚或其他相同成分，叠加后容易超过安全剂量。",
    nextStep:
      "逐项阅读成分表，不要同时服用多种复方感冒药，也不要与同成分退烧药叠加。",
    sourceIds
  },
  {
    id: "blood-thinner-bleeding",
    title: "抗凝和抗血小板药要观察异常出血",
    keywords: ["华法林", "抗凝", "阿司匹林", "氯吡格雷", "利伐沙班", "出血", "黑便", "瘀斑"],
    riskLevel: "high",
    summary:
      "抗凝和抗血小板药可能增加出血风险，新增药物、中药或保健品前需要专业核对。",
    nextStep:
      "不要自行停药或调整剂量。黑便、呕血、血尿、持续头痛或无法止住的出血时立即就医。",
    sourceIds
  },
  {
    id: "diabetes-low-sugar",
    title: "降糖药期间警惕低血糖",
    keywords: ["低血糖", "出汗心慌", "手抖", "头晕饥饿", "降糖药", "胰岛素", "格列"],
    riskLevel: "high",
    summary:
      "部分降糖药和胰岛素可能导致低血糖，老人出现出汗、心慌、手抖、意识改变时风险较高。",
    nextStep:
      "按既定低血糖方案处理并尽快联系医生；意识不清、无法吞咽或抽搐时拨打 120，不要强行喂食。",
    sourceIds
  },
  {
    id: "blood-pressure-dizziness",
    title: "降压药后头晕先坐下并测量血压",
    keywords: ["降压药", "血压低", "头晕", "站不稳", "起身发黑", "氨氯地平", "缬沙坦"],
    riskLevel: "medium",
    summary:
      "降压药可能导致血压偏低或体位性头晕，但头晕也可能来自卒中、心律失常等其他原因。",
    nextStep:
      "先坐下或躺下并测量血压。胸痛、言语不清、单侧无力或晕厥时立即拨打 120；不要自行停药。",
    sourceIds
  },
  {
    id: "painkiller-kidney-stomach",
    title: "止痛药不要长期叠加使用",
    keywords: ["止痛药", "布洛芬", "双氯芬酸", "塞来昔布", "胃痛", "肾损伤", "止痛"],
    riskLevel: "medium",
    summary:
      "非甾体抗炎止痛药可能增加胃出血、肾损伤和心血管风险，老年人风险更高。",
    nextStep:
      "不要同时叠加多种止痛药或与抗凝药自行同服。持续疼痛、黑便、尿量减少或胸闷时及时就医。",
    sourceIds
  },
  {
    id: "supplement-interaction",
    title: "保健品也可能与处方药相互作用",
    keywords: ["保健品", "鱼油", "银杏", "维生素", "钙片", "铁剂", "营养素"],
    riskLevel: "medium",
    summary:
      "保健食品和营养素不是天然无风险，可能影响凝血、药物吸收或代谢。",
    nextStep:
      "把保健品包装和全部处方药一起交给医生或药师核对，不要自行替代处方药。",
    sourceIds
  },
  {
    id: "herb-interaction",
    title: "中药和草本制品需要纳入同服核对",
    keywords: ["中药", "三七", "丹参", "当归", "人参", "草本", "中成药"],
    riskLevel: "medium",
    summary:
      "中药成分复杂，可能与抗凝、降压、降糖或免疫抑制药发生相互作用。",
    nextStep:
      "提供药材或中成药的完整名称、成分和剂量，让医生或药师与西药一起核对。",
    sourceIds
  },
  {
    id: "expired-medicine",
    title: "过期或变质药品不要继续服用",
    keywords: ["过期", "有效期", "变质", "变色", "受潮", "药片碎了"],
    riskLevel: "medium",
    summary:
      "药品过期、受潮、变色或包装破损后，效力和安全性无法保证。",
    nextStep:
      "停止使用并按当地药品回收要求处理，不要继续服用或转送给他人。",
    sourceIds
  },
  {
    id: "medicine-storage",
    title: "储存条件以药品包装为准",
    keywords: ["储存", "保存", "冷藏", "放冰箱", "避光", "放在哪里"],
    riskLevel: "low",
    summary:
      "不同药品对温度、湿度、光照和冷藏要求不同，不能把所有药都放进冰箱。",
    nextStep:
      "查看包装上的储存条件，保持原包装和说明书，避免放在潮湿、高温或儿童可触及的位置。",
    sourceIds
  },
  {
    id: "drowsy-driving",
    title: "可能嗜睡的药物期间避免驾驶",
    keywords: ["开车", "驾驶", "嗜睡", "犯困", "反应慢", "镇静", "抗过敏药"],
    riskLevel: "medium",
    summary:
      "部分抗过敏药、镇静催眠药、止痛药和精神类药物可能引起嗜睡或反应变慢。",
    nextStep:
      "服药后出现困倦、头晕或反应变慢时不要驾驶或操作机械，并查看说明书中的驾驶警示。",
    sourceIds
  },
  {
    id: "polypharmacy",
    title: "多种药物同时使用需要定期集中复核",
    keywords: ["很多药", "多种药", "老年人吃药多", "重复用药", "相互作用", "多药"],
    riskLevel: "medium",
    summary:
      "同时使用多种处方药、OTC、中药和保健品时，重复成分和相互作用风险会增加。",
    nextStep:
      "复诊时携带全部药盒或使用多药对账，至少让医生或药师集中核对一次。",
    sourceIds
  },
  {
    id: "swallowing-difficulty",
    title: "吞咽困难不要自行改变药物剂型",
    keywords: ["吞咽困难", "咽不下去", "卡喉咙", "噎住", "不能吞药"],
    riskLevel: "medium",
    summary:
      "碾碎、拆胶囊或掰开可能改变药物释放和吸收，部分药物还会刺激口腔或食管。",
    nextStep:
      "联系医生或药师评估是否可以更换剂型或采用允许的服法，不要自行改变。",
    sourceIds
  }
];

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[，。！？、,.!?；;：:（）()]/g, "");
}

export function findSafetyTopics(query: string): Array<{
  topic: SafetyTopic;
  score: number;
  matchedKeywords: string[];
}> {
  const normalized = normalize(query);
  return safetyTopics
    .map((topic) => {
      const matchedKeywords = topic.keywords.filter((keyword) =>
        normalized.includes(normalize(keyword))
      );
      const score = matchedKeywords.reduce(
        (total, keyword) => total + Math.max(1, normalize(keyword).length),
        0
      );
      return { topic, score, matchedKeywords };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);
}
