export interface ConditionGuide {
  id: string;
  name: string;
  aliases: string[];
  summary: string;
  everyday: string[];
  medicineSafety: string[];
  emergencySigns: string[];
  followUp: string;
  reference: string;
  sourceIds: string[];
}

export interface ConditionMatch {
  condition: ConditionGuide;
  matchedTerms: string[];
  fromProfile: boolean;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[，。！？、,.!?；;：:（）()【】]/g, "");
}

export const conditionGuides: ConditionGuide[] = [
  {
    id: "heart-disease-general",
    name: "心脏病",
    aliases: ["心脏病", "心脏不好", "心脏疾病", "心脏问题"],
    summary:
      "“心脏病”是冠心病、心力衰竭、心律失常、瓣膜病等疾病的总称，具体注意事项取决于医生确认的诊断，不能把所有心脏病按同一种方案处理。",
    everyday: [
      "记录医生诊断的心脏病类型、近期症状和复查安排；按医嘱监测血压、脉搏，心衰患者还需按医生要求记录体重。",
      "运动、饮水量、盐摄入和活动强度应按具体病情和医生建议执行，不要仅凭病名自行加量或完全不动。"
    ],
    medicineSafety: [
      "不要因为感觉好转自行停用心血管药、抗凝药或降脂药；漏服时先查看处方或说明书并联系医生或药师。",
      "新增止痛药、感冒药、中药或保健品前先核对，因为部分药物可能影响血压、心率、出血或体液潴留。"
    ],
    emergencySigns: [
      "胸痛或胸闷持续不缓解，伴大汗、恶心、呼吸困难或疼痛放射到手臂、背部、颈部时拨打 120。",
      "突然晕厥、明显喘不上气、意识异常、嘴唇发紫，或心跳很快同时头晕时立即求助。"
    ],
    followUp:
      "为了给出更准确的建议，请补充医生写的心脏病类型，以及正在服用的药物。",
    reference:
      "WHO Cardiovascular diseases fact sheet；American Heart Association 心脏急症警示信息",
    sourceIds: ["src-condition-guidance", "src-emergency"]
  },
  {
    id: "coronary-heart-disease",
    name: "冠心病",
    aliases: ["冠心病", "冠状动脉粥样硬化", "心肌缺血", "心绞痛", "放支架"],
    summary:
      "冠心病管理的重点是按医嘱控制血压、血脂和血糖，规律使用医生开具的药物，并识别心肌缺血加重信号。",
    everyday: [
      "按复诊计划监测血压、血脂和体重；活动和运动量以医生允许范围为准，出现劳力性胸闷时停止活动并记录。",
      "戒烟并避免二手烟；饮食和运动方案由医生结合心功能、年龄和合并疾病确定。"
    ],
    medicineSafety: [
      "抗血小板药、降脂药、降压药等不要自行停药或换药，出血、肌肉疼痛等不适要及时反馈。",
      "不要自行服用硝酸甘油或借用心绞痛急救药；只有医生明确开具并教过用法时才按原方案使用。"
    ],
    emergencySigns: [
      "胸部不适持续数分钟仍不缓解，伴出汗、恶心、呼吸困难，或放射到下颌、肩背和手臂时拨打 120。",
      "休息时反复出现胸闷，或首次出现明显胸痛时不要自行开车去医院。"
    ],
    followUp:
      "请说明是稳定型心绞痛、心肌梗死后还是做过支架，并列出当前抗血小板和降脂药。",
    reference:
      "WHO Cardiovascular diseases fact sheet；American Heart Association Warning Signs of a Heart Attack",
    sourceIds: ["src-condition-guidance", "src-emergency"]
  },
  {
    id: "heart-failure",
    name: "心力衰竭",
    aliases: ["心力衰竭", "心衰", "心脏衰竭", "射血分数降低"],
    summary:
      "心衰需要按医生制定的长期方案管理容量、血压、体重和症状，感染、停药或高盐饮食都可能让症状加重。",
    everyday: [
      "按医生要求每天在相近条件下称体重并记录；短期体重明显增加、鞋子变紧或下肢水肿加重时联系医生。",
      "液体和盐的摄入限制因人而异，只执行医生给出的范围；不要自行大量喝水或完全禁盐。"
    ],
    medicineSafety: [
      "利尿剂、改善心功能的药物和降压药不要自行增减；出现头晕、脱水、尿量明显变化时联系医生。",
      "部分止痛药、感冒药、中药和保健品可能引起水钠潴留或影响心率和血压，新增前先核对。"
    ],
    emergencySigns: [
      "休息时也喘不上气、不能平躺、咳粉红色泡沫痰或嘴唇发紫时拨打 120。",
      "突然意识不清、晕厥、胸痛，或体重和水肿在短时间内快速加重时及时求助。"
    ],
    followUp:
      "请补充医生确认的心衰类型、最近体重和水肿变化，以及是否被要求限制饮水或盐。",
    reference:
      "NHS Heart failure overview；American Heart Association Heart Failure warning signs",
    sourceIds: ["src-condition-guidance", "src-emergency"]
  },
  {
    id: "arrhythmia",
    name: "心律失常",
    aliases: ["心律失常", "房颤", "心房颤动", "早搏", "心跳快", "心律不齐"],
    summary:
      "心律失常的处理取决于类型、频率、症状和是否合并血栓风险；房颤患者尤其需要关注医生安排的抗凝治疗。",
    everyday: [
      "按医生要求记录心慌发生时间、持续多久以及是否伴头晕、胸闷；不要仅凭智能手表结果自行诊断。",
      "减少已知诱因，如漏服药物、过量饮酒、发热和睡眠不足；咖啡因是否限制应结合个人情况。"
    ],
    medicineSafety: [
      "控制心率、维持心律和抗凝药物不要自行停止；抗凝药带来的异常出血要及时报告医生。",
      "购买感冒药、止咳药或保健品前先核对，部分成分可能升高心率或与抗凝药相互作用。"
    ],
    emergencySigns: [
      "心慌同时出现胸痛、呼吸困难、晕厥或接近晕倒时拨打 120。",
      "房颤患者出现一侧肢体无力、口角歪斜或言语不清时按卒中急症处理。"
    ],
    followUp:
      "请补充心律失常的具体名称、是否使用抗凝药，以及发作时的脉搏和持续时间。",
    reference:
      "NHS Atrial fibrillation overview；American Heart Association Arrhythmia warning signs",
    sourceIds: ["src-condition-guidance", "src-emergency"]
  },
  {
    id: "hypertension",
    name: "高血压",
    aliases: ["高血压", "血压高", "血压偏高"],
    summary:
      "高血压管理的核心是规范测量、按医嘱服药和长期随访，不能凭一次读数自行停药或改变剂量。",
    everyday: [
      "使用合适袖带的血压计，安静休息后测量并记录时间和读数；家庭血压目标以医生给出的范围为准。",
      "控制盐摄入和体重、保持适量活动，但具体目标需结合年龄、肾病和其他慢病。"
    ],
    medicineSafety: [
      "降压药需规律使用，不要因血压暂时正常就停药；头晕、乏力或站起发黑时先坐下并测量血压。",
      "止痛药、减充血感冒药、中药和保健品可能升高血压或干扰药效，新增前请核对。"
    ],
    emergencySigns: [
      "血压很高并伴胸痛、呼吸困难、意识异常、抽搐、剧烈头痛或神经症状时立即拨打 120。",
      "突然一侧肢体无力、口角歪斜、说话含糊或视物异常时按卒中急症处理。"
    ],
    followUp:
      "请补充最近几次家庭血压读数、医生给的目标范围和目前使用的降压药。",
    reference:
      "WHO Hypertension fact sheet；NHS High blood pressure overview",
    sourceIds: ["src-condition-guidance", "src-emergency"]
  },
  {
    id: "stroke-history",
    name: "脑卒中",
    aliases: ["脑卒中", "中风", "脑梗", "脑出血", "卒中"],
    summary:
      "卒中后的重点包括按医嘱控制血压、血脂和血糖，坚持康复训练、预防跌倒，并识别卒中再发信号。",
    everyday: [
      "按康复计划进行肢体、吞咽和语言训练；家属应关注误吸、跌倒和压疮风险。",
      "规律监测血压和慢病指标，复查和药物调整由医生决定。"
    ],
    medicineSafety: [
      "抗血小板药、抗凝药和慢病药不要自行停止或加量；出现黑便、血尿或无法止住的出血要及时就医。",
      "吞咽困难时不要自行碾碎或掰开药物，应由医生或药师评估合适剂型。"
    ],
    emergencySigns: [
      "再次出现脸歪、单侧手臂无力、言语含糊、突然看不清或行走不稳时立即拨打 120。",
      "突然剧烈头痛、意识异常或抽搐时立即求助。"
    ],
    followUp:
      "请补充卒中发生时间、当前血压、是否服用抗凝或抗血小板药，以及有无吞咽困难。",
    reference:
      "WHO Stroke fact sheet；CDC Signs and Symptoms of Stroke",
    sourceIds: ["src-condition-guidance", "src-emergency"]
  },
  {
    id: "type-2-diabetes",
    name: "糖尿病",
    aliases: ["糖尿病", "血糖高", "高血糖", "二型糖尿病", "2型糖尿病"],
    summary:
      "糖尿病管理需要结合血糖记录、饮食、活动和医生制定的药物方案；老人尤其要警惕低血糖。",
    everyday: [
      "按医生要求监测血糖并记录异常时间，定期检查足部皮肤、视力和肾功能。",
      "饮食量和活动量尽量稳定，避免在未进食时自行增加降糖药或过量运动。"
    ],
    medicineSafety: [
      "胰岛素和部分降糖药可能导致低血糖；出汗、心慌、手抖、饥饿或意识变化时按医生既定方案处理并尽快联系专业人员。",
      "不要自行购买降糖保健品替代处方药，也不要因一次血糖正常就停药。"
    ],
    emergencySigns: [
      "意识不清、抽搐或无法安全吞咽时拨打 120，不要强行喂食或灌糖水。",
      "持续呕吐、呼吸急促、明显嗜睡或脱水时及时就医。"
    ],
    followUp:
      "请补充糖尿病类型、最近空腹和餐后血糖、当前降糖药以及是否发生过低血糖。",
    reference:
      "WHO Diabetes fact sheet；NHS Type 2 diabetes overview",
    sourceIds: ["src-condition-guidance", "src-emergency"]
  },
  {
    id: "copd",
    name: "慢阻肺",
    aliases: ["慢阻肺", "慢性阻塞性肺疾病", "copd", "肺气肿"],
    summary:
      "慢阻肺需要长期戒烟、按医嘱使用吸入药并识别急性加重，吸入装置是否会用会直接影响效果。",
    everyday: [
      "按医生计划使用吸入药并定期核对装置手法；记录气短、咳嗽和痰量变化。",
      "避免烟雾和刺激气体，接种疫苗和肺康复计划按医生建议安排。"
    ],
    medicineSafety: [
      "不要自行停用长期吸入药；急救吸入药只在医生规定范围和用法下使用。",
      "口服激素、抗生素和氧气治疗需要医生评估，不能借用药或自行调整流量。"
    ],
    emergencySigns: [
      "休息时仍严重喘不上气、不能完整说话、嘴唇发紫或意识异常时拨打 120。",
      "痰量或脓性痰明显增加并伴发热、气短加重时尽快联系医生。"
    ],
    followUp:
      "请说明目前最喘的时间、吸入药名称、是否有家庭氧疗以及近期急性加重次数。",
    reference:
      "WHO Chronic obstructive pulmonary disease fact sheet；NHS COPD overview",
    sourceIds: ["src-condition-guidance", "src-emergency"]
  },
  {
    id: "asthma",
    name: "哮喘",
    aliases: ["哮喘", "支气管哮喘", "喘息"],
    summary:
      "哮喘的重点是避免诱因、掌握吸入装置、按医生方案使用控制药，并尽早识别急性发作。",
    everyday: [
      "记录夜间咳嗽、喘鸣和活动受限情况，按哮喘行动计划处理，不把控制药和急救药混用。",
      "避免已知过敏原和烟雾；运动前是否需要预防用药应遵循医生建议。"
    ],
    medicineSafety: [
      "不要等症状完全消失就停用控制药，也不要过量使用急救吸入药。",
      "若急救吸入药使用次数明显增加或效果变差，应尽快联系医生。"
    ],
    emergencySigns: [
      "严重喘鸣、无法完整说话、嘴唇发紫、胸廓凹陷或意识改变时拨打 120。",
      "急救吸入药按既定方案使用后仍无明显缓解时及时求助。"
    ],
    followUp:
      "请补充吸入药名称、每周急救吸入药使用次数，以及本次发作的诱因。",
    reference:
      "WHO Asthma fact sheet；NHS Asthma overview",
    sourceIds: ["src-condition-guidance", "src-emergency"]
  },
  {
    id: "chronic-kidney-disease",
    name: "慢性肾病",
    aliases: ["慢性肾病", "肾功能不全", "肾衰竭", "肌酐高", "蛋白尿"],
    summary:
      "慢性肾病患者的药物剂量、止痛药选择、造影检查和饮水要求常需随肾功能调整。",
    everyday: [
      "按医生要求复查肌酐、eGFR、尿蛋白和血压；记录尿量、水肿和体重变化。",
      "不要自行高蛋白进补或服用利尿、排毒类保健品，饮食计划听从肾内科或营养师建议。"
    ],
    medicineSafety: [
      "布洛芬等非甾体止痛药、部分抗生素、中药和保健品可能影响肾功能，使用前请核对。",
      "做造影检查、手术或新增药物时主动告诉医生当前肾功能和全部用药。"
    ],
    emergencySigns: [
      "尿量突然明显减少、严重水肿、呼吸困难、持续呕吐或意识异常时及时就医。",
      "胸痛、心悸并伴乏力或呼吸急促时不要等待，立即求助。"
    ],
    followUp:
      "请补充最近一次 eGFR、肌酐、尿蛋白，以及医生给出的饮水和蛋白限制要求。",
    reference:
      "NIDDK Chronic Kidney Disease overview；WHO Kidney health information",
    sourceIds: ["src-condition-guidance", "src-emergency"]
  },
  {
    id: "chronic-liver-disease",
    name: "肝病",
    aliases: ["肝病", "肝硬化", "脂肪肝", "肝功能不全", "转氨酶高"],
    summary:
      "肝病患者的药物代谢能力可能下降，新增药物、中药和保健品前要核对肝毒性及剂量。",
    everyday: [
      "按医生要求复查肝功能、凝血和影像；记录食欲、尿色、皮肤和腹部变化。",
      "不要饮酒，不自行服用保肝保健品或草药，饮食和体重目标由医生结合具体肝病制定。"
    ],
    medicineSafety: [
      "对乙酰氨基酚等常见成分、部分抗感染药、中药和保健品都需在肝病背景下核对。",
      "不要自行停用控制病毒、腹水或其他并发症的处方药。"
    ],
    emergencySigns: [
      "呕血、黑便、皮肤或眼白发黄加重、意识混乱、腹部快速增大时立即就医。",
      "大量饮水后仍头晕、呼吸困难或尿量明显减少时及时求助。"
    ],
    followUp:
      "请说明肝病具体诊断、最近肝功能结果、是否饮酒以及正在使用的所有药物和保健品。",
    reference:
      "NHS Liver disease overview；NIDDK Liver disease information",
    sourceIds: ["src-condition-guidance", "src-emergency"]
  },
  {
    id: "peptic-ulcer",
    name: "胃溃疡或消化道出血史",
    aliases: ["胃溃疡", "十二指肠溃疡", "消化道出血", "黑便", "胃出血"],
    summary:
      "有溃疡或消化道出血史时，止痛药、抗凝药和部分草本产品需要特别核对。",
    everyday: [
      "按医生要求复查溃疡是否愈合，避免空腹饮酒和自行长期服用刺激胃黏膜的药物。",
      "记录黑便、呕血、头晕和乏力等症状，必要时及时就医。"
    ],
    medicineSafety: [
      "布洛芬、阿司匹林等药物可能增加溃疡或出血风险，是否使用及如何保护胃需由医生决定。",
      "抗凝药、抗血小板药和中药不能自行叠加或停用。"
    ],
    emergencySigns: [
      "呕血、黑便、头晕站不稳或心跳明显加快时拨打 120。",
      "突发持续上腹痛、腹部僵硬或冷汗时及时就医。"
    ],
    followUp:
      "请补充是否有幽门螺杆菌治疗史、是否服用抗凝或止痛药，以及最近一次胃镜结果。",
    reference:
      "NHS Stomach ulcer overview；NIDDK Peptic Ulcer Disease information",
    sourceIds: ["src-condition-guidance", "src-emergency"]
  },
  {
    id: "gout",
    name: "痛风或高尿酸",
    aliases: ["痛风", "高尿酸", "尿酸高", "痛风性关节炎"],
    summary:
      "痛风需要区分急性发作与长期降尿酸管理，止痛药和降尿酸药的使用时机应由医生确认。",
    everyday: [
      "记录发作关节、持续时间和诱因，保持饮水和体重管理；具体嘌呤限制按医生或营养师建议执行。",
      "不要用保健品替代降尿酸处方药，也不要在急性发作时自行停用长期降尿酸药。"
    ],
    medicineSafety: [
      "非甾体止痛药可能增加胃肠、肾脏和心血管风险，尤其对老人和慢病患者。",
      "利尿剂、阿司匹林和部分中药可能影响尿酸，新增或调整前请核对。"
    ],
    emergencySigns: [
      "关节红肿热痛同时伴高热、寒战或明显全身不适时尽快就医，排除感染。",
      "剧烈疼痛伴尿量减少、胸痛或呼吸困难时及时求助。"
    ],
    followUp:
      "请补充最近尿酸值、急性发作药和长期降尿酸药名称，以及是否有肾病或胃溃疡。",
    reference:
      "NHS Gout overview；American College of Rheumatology gout patient information",
    sourceIds: ["src-condition-guidance"]
  },
  {
    id: "osteoporosis",
    name: "骨质疏松",
    aliases: ["骨质疏松", "骨密度低", "骨折风险", "容易骨折"],
    summary:
      "骨质疏松管理重点是防跌倒、按医嘱补足营养和规律使用治疗药，不能只靠补钙产品。",
    everyday: [
      "检查家中照明、地毯和电线，必要时使用助行器；起身和转身放慢，避免湿滑地面。",
      "钙、维生素 D 和蛋白质摄入按医生或营养师建议，日照和负重运动需结合跌倒风险。"
    ],
    medicineSafety: [
      "抗骨质疏松药的使用时间、姿势和复查安排各不相同，应按说明书或医生要求执行。",
      "长期自行大剂量补钙、维生素或中草药可能有害，新增前请核对。"
    ],
    emergencySigns: [
      "跌倒后髋部剧痛、不能负重、肢体变形或头部撞伤后意识变化时及时就医。",
      "突然严重背痛、身高快速变矮或无法解释的骨折时联系医生。"
    ],
    followUp:
      "请补充最近骨密度结果、是否发生过跌倒或骨折，以及当前使用的骨质疏松药。",
    reference:
      "NHS Osteoporosis overview；NIDDK Bone Health and Osteoporosis information",
    sourceIds: ["src-condition-guidance", "src-emergency"]
  },
  {
    id: "dementia",
    name: "痴呆或认知障碍",
    aliases: ["痴呆", "阿尔茨海默", "认知障碍", "记忆力下降", "健忘"],
    summary:
      "认知障碍患者需要家属协助核对药物、防走失、防跌倒，并注意突然变化可能不是单纯“病情加重”。",
    everyday: [
      "使用分药盒、闹钟或家属提醒核对服药；药品和危险物品应放在无法误取的位置。",
      "保持熟悉环境和规律作息，必要时准备身份信息、定位或走失防护措施。"
    ],
    medicineSafety: [
      "镇静药、抗过敏药和部分止痛药可能加重嗜睡或意识混乱，新增前请医生或药师评估。",
      "认知药和慢病药不要因短期变化自行停药或加量。"
    ],
    emergencySigns: [
      "意识突然模糊、嗜睡、无法唤醒、抽搐或新出现单侧无力/言语异常时立即就医。",
      "走失、跌倒受伤、误服药物或突然行为严重异常时及时求助。"
    ],
    followUp:
      "请补充认知障碍诊断、近期是否突然变差、是否吞咽困难，以及照护者最担心的风险。",
    reference:
      "WHO Dementia fact sheet；NHS Dementia overview",
    sourceIds: ["src-condition-guidance", "src-emergency"]
  },
  {
    id: "parkinson",
    name: "帕金森病",
    aliases: ["帕金森", "帕金森病", "手抖", "动作迟缓"],
    summary:
      "帕金森病的药物与进食时间、症状波动和跌倒风险密切相关，不能自行停用或突然改变服药时间。",
    everyday: [
      "记录开药后有效时间、冻结步态和跌倒情况；居家通道保持通畅，转身和起立放慢。",
      "药物服用时间应尽量规律，吞咽困难或剂型无法吞服时联系医生调整。"
    ],
    medicineSafety: [
      "帕金森相关药物不要自行减量或突然停止，否则可能引起严重症状；新增止吐、精神类或感冒药前请核对。",
      "家属应保留完整清单，并记录药物与餐食的实际时间。"
    ],
    emergencySigns: [
      "突然无法活动、严重僵硬、高热、意识变化或疑似停药反应时立即就医。",
      "跌倒撞头、髋部疼痛或无法站立时及时求助。"
    ],
    followUp:
      "请补充药名、每次时间和进食间隔、是否有“开关现象”以及近期跌倒史。",
    reference:
      "NHS Parkinson's disease overview；Parkinson's Foundation medication safety information",
    sourceIds: ["src-condition-guidance", "src-emergency"]
  },
  {
    id: "epilepsy",
    name: "癫痫",
    aliases: ["癫痫", "抽风", "惊厥", "抽搐史"],
    summary:
      "癫痫管理的核心是规律使用抗癫痫药、避免诱因和记录发作；抗癫痫药不能突然停止。",
    everyday: [
      "记录发作时间、持续多久、意识和肢体表现；避免漏服、睡眠不足和已知诱因。",
      "淋浴、游泳、驾驶和独处安排要结合医生建议，跌倒防护需由家属共同落实。"
    ],
    medicineSafety: [
      "抗癫痫药需按固定时间使用，不能自行停用或突然换药；部分感冒药和抗感染药可能影响药效。",
      "不要自行碾碎或掰开特殊剂型，必要时请医生或药师调整。"
    ],
    emergencySigns: [
      "抽搐持续超过 5 分钟、接连发作未恢复、呼吸困难或发作在水中时拨打 120。",
      "首次抽搐、伴高热或头部外伤、或意识迟迟不恢复时及时就医。"
    ],
    followUp:
      "请补充抗癫痫药名称、最近一次发作时间和持续时间，以及是否出现漏服。",
    reference:
      "NHS Epilepsy overview；Epilepsy Foundation seizure first aid guidance",
    sourceIds: ["src-condition-guidance", "src-emergency"]
  },
  {
    id: "thyroid-disease",
    name: "甲状腺疾病",
    aliases: ["甲状腺", "甲亢", "甲减", "甲状腺功能"],
    summary:
      "甲亢和甲减的药物、复查和症状关注重点不同，是否调整剂量应由甲状腺功能检查结果和医生判断。",
    everyday: [
      "按医生计划复查 TSH 等指标，记录体重、心率、怕冷怕热、排便和情绪变化。",
      "服用甲状腺激素的时间和与钙、铁、食物的间隔应固定遵循医嘱或说明书。"
    ],
    medicineSafety: [
      "不要在未复查前自行加量、减量或停用甲状腺药。",
      "心慌、胸痛、发热或其他新药开始后症状变化，要及时告诉医生。"
    ],
    emergencySigns: [
      "高热、严重心慌、呕吐、意识异常或明显虚弱时及时就医。",
      "胸痛、呼吸困难或晕厥时立即拨打 120。"
    ],
    followUp:
      "请补充甲亢或甲减类型、最近 TSH 结果、药名和每天服药时间。",
    reference:
      "NHS Thyroid disease overview；American Thyroid Association patient information",
    sourceIds: ["src-condition-guidance", "src-emergency"]
  },
  {
    id: "depression-anxiety",
    name: "抑郁或焦虑",
    aliases: ["抑郁", "抑郁症", "焦虑", "焦虑症", "情绪低落"],
    summary:
      "情绪症状需要持续评估，身体不适也可能是其他疾病或药物不良反应；抗抑郁药不能突然停止。",
    everyday: [
      "记录睡眠、食欲、兴趣和情绪变化，保留能联系到家人或医生的求助渠道。",
      "慢病和心理治疗、运动、作息安排应由专业人员共同制定。"
    ],
    medicineSafety: [
      "抗抑郁药和抗焦虑药不要因短期感觉好转突然停药，新增止痛药、中草药或保健品前请核对相互作用。",
      "出现明显嗜睡、意识混乱、激越或异常行为时尽快联系医生。"
    ],
    emergencySigns: [
      "如果出现立即伤害自己或他人的想法、计划或行为，请马上联系身边人和当地急救服务。",
      "意识异常、严重拒食、无法照顾自己或出现幻觉时尽快就医。"
    ],
    followUp:
      "请说明症状持续多久、是否影响睡眠和进食、正在使用的药物，以及目前是否有立即求助的人。",
    reference:
      "WHO Depression fact sheet；NIMH Depression and Anxiety information",
    sourceIds: ["src-condition-guidance", "src-emergency"]
  },
  {
    id: "benign-prostate-hyperplasia",
    name: "前列腺增生",
    aliases: ["前列腺增生", "前列腺肥大", "排尿困难", "尿频"],
    summary:
      "前列腺增生需要关注排尿变化、尿潴留和感染，部分感冒药或抗过敏药可能使排尿更困难。",
    everyday: [
      "记录夜尿、尿流变细、排不尽和饮水后的变化；避免一次大量饮水或长期憋尿。",
      "按医生要求复查肾功能和残余尿，出现尿痛、发热时不要拖延。"
    ],
    medicineSafety: [
      "部分减充血感冒药、抗过敏药和抗胆碱药可能加重排尿困难，使用前先核对。",
      "前列腺药物不要自行停用，手术或检查前主动告知正在使用的药物。"
    ],
    emergencySigns: [
      "完全尿不出来、下腹明显胀痛、发热寒战或腰背剧痛时及时就医。",
      "尿中大量鲜血或伴晕厥时立即求助。"
    ],
    followUp:
      "请补充夜尿次数、是否完全排不出尿、当前前列腺药以及是否在服用感冒药。",
    reference:
      "NHS Benign prostate enlargement overview；NIDDK Enlarged Prostate information",
    sourceIds: ["src-condition-guidance", "src-emergency"]
  },
  {
    id: "cancer-treatment",
    name: "癌症治疗期间",
    aliases: ["癌症", "肿瘤", "化疗", "放疗", "靶向药", "免疫治疗"],
    summary:
      "癌症治疗期间，用药安全取决于治疗方案、血细胞和肝肾功能；发热、感染和出血需要更积极地处理。",
    everyday: [
      "按肿瘤科团队要求复查血常规、肝肾功能和体重，记录体温、进食和感染症状。",
      "出现发热时先按治疗团队给出的紧急联系方案处理，不要仅在家观察。"
    ],
    medicineSafety: [
      "靶向药、化疗药和免疫治疗药不要自行减量或停药；抗感染药、止痛药、中药和保健品需由团队核对。",
      "同时使用抗凝药或抗血小板药时，任何异常出血都要及时报告。"
    ],
    emergencySigns: [
      "发热、寒战、呼吸困难、严重腹泻、持续呕吐或意识变化时及时联系肿瘤科或急诊。",
      "大量出血、胸痛、无法进水或严重过敏反应时立即拨打 120。"
    ],
    followUp:
      "请补充癌症类型、当前治疗方案、最近血常规结果和肿瘤科团队的紧急联系电话。",
    reference:
      "NHS Cancer treatment side effects；American Cancer Society infection and treatment safety information",
    sourceIds: ["src-condition-guidance", "src-emergency"]
  }
];

export function findConditionGuidance(
  query: string,
  knownConditions: string[] = []
): ConditionMatch | null {
  const normalizedQuery = normalize(query);
  const explicitMatches = conditionGuides
    .map((condition) => {
      const matchedTerms = condition.aliases.filter((alias) =>
        normalizedQuery.includes(normalize(alias))
      );
      const score = matchedTerms.reduce(
        (total, term) => total + normalize(term).length,
        0
      );
      return { condition, matchedTerms, score, fromProfile: false };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

  if (explicitMatches.length) return explicitMatches[0];

  const asksAboutOwnHealth =
    /注意|管理|保养|控制|日常|复查|饮食|运动|我该|有什么风险/.test(
      normalizedQuery
    );
  if (!asksAboutOwnHealth) return null;

  for (const knownCondition of knownConditions) {
    const normalizedCondition = normalize(knownCondition);
    const condition = conditionGuides.find((item) =>
      item.aliases.some((alias) => {
        const normalizedAlias = normalize(alias);
        return (
          normalizedCondition.includes(normalizedAlias) ||
          normalizedAlias.includes(normalizedCondition)
        );
      })
    );
    if (condition) {
      return {
        condition,
        matchedTerms: [knownCondition],
        fromProfile: true
      };
    }
  }
  return null;
}

export function formatConditionGuidance(
  match: ConditionMatch,
  currentMedicationNames: string[],
  mode: "quick" | "safety" | "detailed" = "safety"
): string {
  const medicationLine = currentMedicationNames.length
    ? `您当前档案中有 ${currentMedicationNames.length} 种在用药物：${currentMedicationNames.join("、")}。具体相互作用仍需药师结合剂量核对。`
    : "当前档案中没有已确认的在用药物；如果实际正在服药，请先补充药名和剂量。";

  if (mode === "quick") {
    const summary = match.condition.summary.split(/[。！？]/)[0];
    const medicine =
      match.condition.medicineSafety[0].split(/[。！？]/)[0];
    return `${match.condition.name}：${summary}。${medicine}。${match.condition.emergencySigns[0]}`;
  }

  if (mode === "safety") {
    return [
      `## ${match.condition.name}安全要点`,
      match.condition.summary,
      "",
      "### 现在优先做",
      `- ${match.condition.everyday[0]}`,
      `- ${match.condition.medicineSafety[0]}`,
      `- ${medicationLine}`,
      "",
      "### 必须立刻求助",
      `- ${match.condition.emergencySigns[0]}`,
      "",
      `需要进一步个体化判断：${match.condition.followUp}`
    ].join("\n");
  }

  return [
    `## ${match.condition.name}日常注意`,
    match.condition.summary,
    "",
    "### 日常可以重点关注",
    ...match.condition.everyday.map((item) => `- ${item}`),
    "",
    "### 用药安全",
    ...match.condition.medicineSafety.map((item) => `- ${item}`),
    medicationLine,
    "",
    "### 立即求助",
    ...match.condition.emergencySigns.map((item) => `- ${item}`),
    "",
    "### 为了回答更准确",
    match.condition.followUp,
    "",
    "### 资料说明",
    `资料依据：${match.condition.reference}。以上为一般健康信息，不替代医生诊断和个体化处方。`
  ].join("\n");
}
