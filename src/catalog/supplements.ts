export interface SupplementEntry {
  id: string;
  name: string;
  aliases: string[];
  kind: "OTC" | "保健食品" | "营养素";
  caution: string;
  affectedMedicationTerms: string[];
}

export const supplements: SupplementEntry[] = [
  {
    id: "fish-oil",
    name: "鱼油",
    aliases: ["深海鱼油", "Omega-3", "欧米伽3"],
    kind: "保健食品",
    caution:
      "鱼油属于保健食品。正在使用华法林、阿司匹林、氯吡格雷等影响凝血或血小板的药物时，应先咨询医生或药师。",
    affectedMedicationTerms: ["华法林", "阿司匹林", "氯吡格雷"]
  },
  {
    id: "ginkgo",
    name: "银杏叶制品",
    aliases: ["银杏叶", "银杏提取物", "银杏"],
    kind: "保健食品",
    caution:
      "银杏叶制品可能与抗凝、抗血小板或部分慢病药发生相互作用，不应和处方药自行叠加。",
    affectedMedicationTerms: ["华法林", "阿司匹林", "氯吡格雷"]
  },
  {
    id: "vitamin-k",
    name: "维生素 K",
    aliases: ["维生素K", "维K"],
    kind: "营养素",
    caution:
      "维生素 K 可能影响华法林的抗凝效果。不要自行加量或改变摄入，应先联系医生或药师。",
    affectedMedicationTerms: ["华法林"]
  },
  {
    id: "calcium",
    name: "钙片",
    aliases: ["碳酸钙", "补钙", "钙剂"],
    kind: "营养素",
    caution:
      "钙剂可能影响部分口服药吸收。与其他药同服前应核对说明书，必要时由药师安排间隔。",
    affectedMedicationTerms: ["头孢", "左氧氟沙星", "四环素"]
  },
  {
    id: "iron",
    name: "铁剂",
    aliases: ["补铁", "硫酸亚铁", "富马酸亚铁"],
    kind: "营养素",
    caution:
      "铁剂可能影响部分药物吸收，也可能引起胃肠道不适。与其他口服药同服前咨询医生或药师。",
    affectedMedicationTerms: ["甲状腺", "四环素", "左氧氟沙星"]
  },
  {
    id: "st-johns-wort",
    name: "圣约翰草",
    aliases: ["贯叶连翘", "St John's wort"],
    kind: "保健食品",
    caution:
      "圣约翰草可影响多种药物代谢，可能降低部分处方药效果或增加风险，禁止自行与处方药叠加。",
    affectedMedicationTerms: ["华法林", "抗抑郁", "免疫抑制"]
  }
];

export function findSupplement(name: string): SupplementEntry | undefined {
  return supplements.find((item) =>
    [item.name, ...item.aliases].some((alias) => name.includes(alias))
  );
}

