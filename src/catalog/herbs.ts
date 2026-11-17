export interface HerbEntry {
  id: string;
  name: string;
  aliases: string[];
  nature: string;
  flavor: string;
  meridians: string[];
  functions: string[];
  traditionalUse: string;
  safety: string[];
  identification: string[];
  sourceTitle: string;
  reviewStatus: "pending_review";
}

export const herbs: HerbEntry[] = [
  {
    id: "goji",
    name: "枸杞子",
    aliases: ["枸杞", "宁夏枸杞", "杞子"],
    nature: "平",
    flavor: "甘",
    meridians: ["肝", "肾"],
    functions: ["滋补肝肾", "益精明目"],
    traditionalUse:
      "传统上用于肝肾阴虚相关的目昏、腰膝酸软等表现，不能仅凭单一症状自行判断体质。",
    safety: [
      "正在服用华法林、阿司匹林等影响凝血的药物时，使用前先咨询医生或药师。",
      "对茄科植物或相关食品过敏者应避免使用。"
    ],
    identification: [
      "果实多呈纺锤形或椭圆形，表面红色或暗红色。",
      "果皮柔韧，内部有多数细小种子。"
    ],
    sourceTitle: "《中华人民共和国药典》2020年版一部（公开资料整理，待专业复核）",
    reviewStatus: "pending_review"
  },
  {
    id: "chrysanthemum",
    name: "菊花",
    aliases: ["亳菊", "滁菊", "贡菊", "杭菊"],
    nature: "微寒",
    flavor: "甘、苦",
    meridians: ["肺", "肝"],
    functions: ["散风清热", "平肝明目", "清热解毒"],
    traditionalUse:
      "传统上用于风热感冒、头痛眩晕、目赤肿痛等表现，不能代替眼科或感染性疾病诊断。",
    safety: [
      "胃寒、容易腹泻的人不宜长期大量饮用。",
      "菊科植物过敏者慎用。"
    ],
    identification: [
      "头状花序，舌状花与管状花排列成盘状。",
      "不同产地的花朵大小、颜色和气味会有差异。"
    ],
    sourceTitle: "《中华人民共和国药典》2020年版一部（公开资料整理，待专业复核）",
    reviewStatus: "pending_review"
  },
  {
    id: "astragalus",
    name: "黄芪",
    aliases: ["黄耆", "北芪", "绵黄芪"],
    nature: "微温",
    flavor: "甘",
    meridians: ["肺", "脾"],
    functions: ["补气升阳", "固表止汗", "利水消肿", "生津养血"],
    traditionalUse:
      "传统上用于气虚乏力、表虚自汗等表现，是否适合需要结合整体辨证。",
    safety: [
      "发热、咽痛等急性感染期不宜自行当作补品使用。",
      "正在使用免疫抑制药、降糖药或抗凝药时，应先咨询医生或药师。"
    ],
    identification: [
      "根圆柱形，表面淡棕黄色或淡棕褐色，有纵皱纹。",
      "断面可见放射状纹理，质地较韧。"
    ],
    sourceTitle: "《中华人民共和国药典》2020年版一部（公开资料整理，待专业复核）",
    reviewStatus: "pending_review"
  },
  {
    id: "angelica",
    name: "当归",
    aliases: ["秦归", "云归", "岷当归"],
    nature: "温",
    flavor: "甘、辛",
    meridians: ["肝", "心", "脾"],
    functions: ["补血活血", "调经止痛", "润肠通便"],
    traditionalUse:
      "传统上用于血虚萎黄、月经不调、跌扑损伤等，不应将所有疲劳或面色差都归因于血虚。",
    safety: [
      "正在服用抗凝或抗血小板药者，使用前应先进行专业评估。",
      "腹泻明显或对当归过敏者慎用。"
    ],
    identification: [
      "根略呈圆柱形，根头肥大，有环纹。",
      "香气浓郁，断面黄白色或淡黄棕色。"
    ],
    sourceTitle: "《中华人民共和国药典》2020年版一部（公开资料整理，待专业复核）",
    reviewStatus: "pending_review"
  },
  {
    id: "ginseng",
    name: "人参",
    aliases: ["红参", "生晒参", "园参"],
    nature: "微温",
    flavor: "甘、微苦",
    meridians: ["脾", "肺", "心", "肾"],
    functions: ["大补元气", "复脉固脱", "补脾益肺", "生津养血"],
    traditionalUse:
      "传统上用于体虚欲脱、脾肺气虚等，不能作为所有老人日常保健的统一补品。",
    safety: [
      "高血压控制不佳、失眠、烦躁或正在发热时，不宜自行服用。",
      "可能与降糖、抗凝等药物发生相互作用，使用前必须咨询医生或药师。",
      "不可因“补气”自行加量或与多种含人参产品叠加。"
    ],
    identification: [
      "主根呈纺锤形或圆柱形，表面有纵皱纹和横向皮孔。",
      "须根有细小疣状突起，人工种植品与野生品外观差异较大。"
    ],
    sourceTitle: "《中华人民共和国药典》2020年版一部（公开资料整理，待专业复核）",
    reviewStatus: "pending_review"
  },
  {
    id: "tangerine-peel",
    name: "陈皮",
    aliases: ["橘皮", "广陈皮", "新会陈皮"],
    nature: "温",
    flavor: "苦、辛",
    meridians: ["肺", "脾"],
    functions: ["理气健脾", "燥湿化痰"],
    traditionalUse:
      "传统上用于脘腹胀满、食少吐泻、咳嗽痰多等表现，不能替代胃肠疾病诊断。",
    safety: [
      "口干明显、阴虚燥热或正在咳血者不宜自行长期大量使用。",
      "正在服用多种处方药时，应把中药与西药一并告知医生或药师。"
    ],
    identification: [
      "常呈不规则片状，外表面橙红色或棕褐色。",
      "有细密凹下的油点，气味芳香。"
    ],
    sourceTitle: "《中华人民共和国药典》2020年版一部（公开资料整理，待专业复核）",
    reviewStatus: "pending_review"
  },
  {
    id: "honeysuckle",
    name: "金银花",
    aliases: ["忍冬花", "双花", "银花"],
    nature: "寒",
    flavor: "甘",
    meridians: ["肺", "心", "胃"],
    functions: ["清热解毒", "疏散风热"],
    traditionalUse:
      "传统上用于痈肿疔疮、喉痹、丹毒、热毒血痢等表现，不能把所有发热都当作“上火”。",
    safety: [
      "脾胃虚寒、容易腹泻者慎用。",
      "发热伴呼吸困难、意识异常或高热不退时，应立即就医，不能只依赖泡饮。"
    ],
    identification: [
      "花蕾呈棒状，上粗下细，表面黄白色或绿白色。",
      "花冠筒状，先端开口，气味清香。"
    ],
    sourceTitle: "《中华人民共和国药典》2020年版一部（公开资料整理，待专业复核）",
    reviewStatus: "pending_review"
  },
  {
    id: "poria",
    name: "茯苓",
    aliases: ["云苓", "白茯苓", "茯神"],
    nature: "平",
    flavor: "甘、淡",
    meridians: ["心", "肺", "脾", "肾"],
    functions: ["利水渗湿", "健脾", "宁心"],
    traditionalUse:
      "传统上用于水肿尿少、痰饮眩悸、脾虚食少等表现，不能替代心肾功能评估。",
    safety: [
      "尿量明显减少、下肢水肿或体重快速变化时，应先就医查因。",
      "不要自行使用利尿类中药替代处方利尿药。"
    ],
    identification: [
      "多呈类球形、椭圆形或不规则块状，外皮棕褐色。",
      "断面白色或淡红色，质地坚实，部分可见细小裂隙。"
    ],
    sourceTitle: "《中华人民共和国药典》2020年版一部（公开资料整理，待专业复核）",
    reviewStatus: "pending_review"
  },
  {
    id: "chinese-yam",
    name: "山药",
    aliases: ["淮山", "怀山药", "薯蓣"],
    nature: "平",
    flavor: "甘",
    meridians: ["脾", "肺", "肾"],
    functions: ["补脾养胃", "生津益肺", "补肾涩精"],
    traditionalUse:
      "传统上用于脾虚食少、久泻不止、肺虚喘咳等表现，应结合整体情况判断。",
    safety: [
      "血糖异常者不能把山药当作可以无限量食用的普通蔬菜。",
      "对山药汁液接触过敏的人，削皮和加工时应注意皮肤防护。"
    ],
    identification: [
      "根茎圆柱形，表面黄白色或淡黄色，有纵皱纹。",
      "断面白色，颗粒状，质坚脆。"
    ],
    sourceTitle: "《中华人民共和国药典》2020年版一部（公开资料整理，待专业复核）",
    reviewStatus: "pending_review"
  },
  {
    id: "notoginseng",
    name: "三七",
    aliases: ["田七", "参三七", "滇七"],
    nature: "温",
    flavor: "甘、微苦",
    meridians: ["肝", "胃"],
    functions: ["散瘀止血", "消肿定痛"],
    traditionalUse:
      "传统上用于咯血、吐血、便血、跌扑肿痛等表现，不适合作所有老人日常抗血栓补品。",
    safety: [
      "可能增加出血风险，正在使用华法林、阿司匹林、氯吡格雷等药物时必须先咨询医生。",
      "近期手术、拔牙或出现黑便、血尿时不得自行使用。",
      "保健产品与药材的规格不同，不可混用。"
    ],
    identification: [
      "主根呈类圆锥形或圆柱形，表面灰褐色或灰黄色。",
      "断面粉白色或灰白色，常见放射状纹理。"
    ],
    sourceTitle: "《中华人民共和国药典》2020年版一部（公开资料整理，待专业复核）",
    reviewStatus: "pending_review"
  },
  {
    id: "salvia",
    name: "丹参",
    aliases: ["赤参", "紫丹参", "血参根"],
    nature: "微寒",
    flavor: "苦",
    meridians: ["心", "肝"],
    functions: ["活血祛瘀", "通经止痛", "清心除烦", "凉血消痈"],
    traditionalUse:
      "传统上用于胸痹心痛、月经不调、疮疡肿痛等表现，不能替代心血管急诊处置。",
    safety: [
      "正在服用抗凝或抗血小板药物时，使用前必须让医生或药师评估出血风险。",
      "胸痛持续不缓解、伴大汗或呼吸困难时立即拨打 120。"
    ],
    identification: [
      "根茎短粗，根数条，表面棕红色或暗棕红色。",
      "断面疏松，部分可见黄白色木部。"
    ],
    sourceTitle: "《中华人民共和国药典》2020年版一部（公开资料整理，待专业复核）",
    reviewStatus: "pending_review"
  },
  {
    id: "licorice",
    name: "甘草",
    aliases: ["国老", "甜草根", "粉甘草"],
    nature: "平",
    flavor: "甘",
    meridians: ["心", "肺", "脾", "胃"],
    functions: ["补脾益气", "清热解毒", "祛痰止咳", "缓急止痛", "调和诸药"],
    traditionalUse:
      "传统上用于脾胃虚弱、咳嗽痰多、疼痛等表现，也是多种复方成分之一。",
    safety: [
      "长期或大量使用可能导致水钠潴留、血压升高和低钾，高血压、水肿或肾病患者尤其要谨慎。",
      "复方药、保健品和草本茶可能重复含甘草，不要自行叠加。"
    ],
    identification: [
      "根呈圆柱形，表面红棕色或灰棕色。",
      "断面略显纤维性，味甜而特殊。"
    ],
    sourceTitle: "《中华人民共和国药典》2020年版一部（公开资料整理，待专业复核）",
    reviewStatus: "pending_review"
  },
  {
    id: "pueraria",
    name: "葛根",
    aliases: ["粉葛", "干葛", "甘葛"],
    nature: "凉",
    flavor: "甘、辛",
    meridians: ["脾", "胃", "肺"],
    functions: ["解肌退热", "生津止渴", "透疹", "升阳止泻", "通经活络"],
    traditionalUse:
      "传统上用于外感发热、项背强痛、口渴、泄泻以及眩晕头痛等表现，不能替代退热、降压或心脑血管疾病的规范治疗。",
    safety: [
      "正在使用降压药、降糖药或影响凝血的药物时，不要自行把葛根制品当作治疗手段叠加使用。",
      "发热伴呼吸困难、意识异常、胸痛或突然肢体无力时，应立即就医，不能只依赖药材泡饮。",
      "不同炮制品和提取物的成分、浓度不同，不能互相套用用量。"
    ],
    identification: [
      "常见为纵切的长方形厚片或小方块，外皮淡棕色。",
      "切面黄白色，可见纤维状纹理；不同产地和粉葛、野葛外观会有差异。"
    ],
    sourceTitle: "《中华人民共和国药典》2020年版一部（公开资料整理，待专业复核）",
    reviewStatus: "pending_review"
  },
  {
    id: "dodder",
    name: "菟丝子",
    aliases: ["吐丝子", "豆寄生", "无根藤"],
    nature: "平",
    flavor: "辛、甘",
    meridians: ["肝", "肾", "脾"],
    functions: ["补益肝肾", "固精缩尿", "安胎", "明目", "止泻"],
    traditionalUse:
      "传统上用于肝肾不足相关的腰膝酸软、目昏、尿频和脾肾虚弱泄泻等表现；是否适合必须结合体质和具体病情判断。",
    safety: [
      "孕期、备孕或出现阴道出血、腹痛时，不得自行用菟丝子或其他中药安胎。",
      "大便燥结、小便短赤等偏热表现者不宜自行长期服用。",
      "正在服用慢病处方药、保健品或激素类药物时，加入前应先咨询医生或药师。"
    ],
    identification: [
      "种子类球形，直径通常约 1 至 1.5 毫米，表面灰棕色或黄棕色。",
      "表面常有细密网状皱纹；水煮后可见黏性，容易与其他细小种子混淆。"
    ],
    sourceTitle: "《中华人民共和国药典》2020年版一部（公开资料整理，待专业复核）",
    reviewStatus: "pending_review"
  }
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/[\s，。,.、:：;；()（）]/g, "");
}

export function searchHerbs(query: string): HerbEntry[] {
  const keyword = normalize(query);
  if (!keyword) return herbs;
  return herbs.filter((herb) =>
    [herb.name, ...herb.aliases, herb.nature, herb.flavor, ...herb.functions]
      .join(" ")
      .toLocaleLowerCase()
      .replace(/[\s，。,.、:：;；()（）]/g, "")
      .includes(keyword)
  );
}

export function findHerbsInText(text: string): HerbEntry[] {
  const normalizedText = normalize(text);
  if (!normalizedText) return [];
  return herbs.filter((herb) =>
    [herb.name, ...herb.aliases]
      .map(normalize)
      .some(
        (term) =>
          term.length >= 2 &&
          normalizedText.includes(term)
      )
  );
}

export function getHerb(id: string): HerbEntry | undefined {
  return herbs.find((herb) => herb.id === id);
}

