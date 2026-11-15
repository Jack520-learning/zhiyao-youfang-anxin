export interface DosageFormSafety {
  formLabel: string;
  headline: string;
  split: string;
  crush: string;
  chew: string;
  detail: string;
}

function normalize(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

export function getDosageFormSafety(
  medicationName: string,
  instructions = ""
): DosageFormSafety {
  const text = normalize(`${medicationName} ${instructions}`);

  if (/缓释|控释|控释片|长效制剂/.test(text)) {
    return {
      formLabel: /胶囊/.test(text) ? "缓释/控释胶囊" : "缓释/控释剂型",
      headline: "通常必须整片或整粒吞服",
      split: "不可自行掰开",
      crush: "不可碾碎",
      chew: "不可嚼碎",
      detail:
        "缓释、控释剂型被掰开或碾碎后可能一次释放过多药物。即使药片有刻痕，也只有说明书明确允许时才可分开。"
    };
  }

  if (/肠溶/.test(text)) {
    return {
      formLabel: /胶囊/.test(text) ? "肠溶胶囊" : "肠溶片",
      headline: "通常必须完整吞服",
      split: "不可自行掰开",
      crush: "不可碾碎",
      chew: "不可嚼碎",
      detail:
        "肠溶包衣用于保护胃部或让药物在肠道释放，破坏包衣可能影响药效并增加胃部刺激。"
    };
  }

  if (/舌下片|舌下含服/.test(text)) {
    return {
      formLabel: "舌下片",
      headline: "按说明放在舌下溶解",
      split: "不可自行掰开",
      crush: "不可碾碎",
      chew: "不可嚼碎",
      detail:
        "舌下片通常应含在舌下自然溶解，不要吞下、嚼碎或提前碾碎；具体以手中说明书和医嘱为准。"
    };
  }

  if (/泡腾片|泡腾颗粒/.test(text)) {
    return {
      formLabel: "泡腾剂型",
      headline: "先用足量温水完全溶解",
      split: "不适用",
      crush: "不可碾碎",
      chew: "不可嚼碎",
      detail:
        "泡腾剂必须按说明书用足量温水完全溶解后服用，不能直接吞服、含服或嚼碎，也不要放入密闭容器中溶解。"
    };
  }

  if (/口崩片|口腔崩解片/.test(text)) {
    return {
      formLabel: "口崩片",
      headline: "按说明在口腔内崩解",
      split: "不可自行掰开",
      crush: "不可碾碎",
      chew: "通常不需要嚼",
      detail:
        "口崩片通常放在口腔内待其崩解，是否需要用水送服以及能否分半，应以具体说明书为准。"
    };
  }

  if (/分散片/.test(text)) {
    return {
      formLabel: "分散片",
      headline: "按说明分散后服用",
      split: "按说明书",
      crush: "不可自行碾碎",
      chew: "不可自行嚼碎",
      detail:
        "分散片通常可按说明书放入适量温水中分散后服用，也可整片吞服；不要仅凭经验干吞、碾碎或嚼碎。"
    };
  }

  if (/咀嚼片/.test(text)) {
    return {
      formLabel: "咀嚼片",
      headline: "按说明充分咀嚼后服用",
      split: "通常不适用",
      crush: "通常不适用",
      chew: "按说明书嚼服",
      detail:
        "咀嚼片通常需要充分咀嚼后咽下，不要直接整片吞服；是否需要饮水以及服用时间以说明书为准。"
    };
  }

  if (/胶囊/.test(text)) {
    return {
      formLabel: "胶囊",
      headline: "通常整粒吞服",
      split: "不可自行打开",
      crush: "不可碾碎",
      chew: "不可嚼碎",
      detail:
        "不要自行打开胶囊倒出药粉，除非说明书或医生、药师明确允许。特殊吞咽困难应先咨询医务人员，不要自行改变服法。"
    };
  }

  if (/颗粒|冲剂|干混悬剂/.test(text)) {
    return {
      formLabel: "颗粒/冲剂",
      headline: "按包装要求冲服",
      split: "不需要掰开",
      crush: "通常不需要",
      chew: "通常不建议干嚼",
      detail:
        "通常按说明书加入适量温水冲服。不要自行改变水量、用饮料送服或直接干吞；具体冲调方法以药盒说明书为准。"
    };
  }

  if (/口服液|糖浆|混悬液|滴剂/.test(text)) {
    return {
      formLabel: "口服液体制剂",
      headline: "使用量具准确量取",
      split: "不需要掰开",
      crush: "不需要碾碎",
      chew: "不需要嚼碎",
      detail:
        "液体药物应按说明使用随药量杯或滴管量取。是否需要摇匀、稀释或冷藏，以具体说明书为准。"
    };
  }

  if (/注射|滴眼|滴耳|滴鼻|喷雾|吸入|贴剂|软膏|乳膏|栓剂/.test(text)) {
    return {
      formLabel: "非口服剂型",
      headline: "按指定途径使用",
      split: "不适用",
      crush: "不适用",
      chew: "不适用",
      detail:
        "这类药物有固定使用途径，不能按口服片剂的方式掰开、碾碎或嚼碎。请按说明书或医务人员指导使用。"
    };
  }

  if (/片/.test(text)) {
    return {
      formLabel: "普通片剂",
      headline: "无明确依据时不要自行改变",
      split: "仅按刻痕和说明书",
      crush: "通常不建议",
      chew: "通常不建议",
      detail:
        "普通片能否掰开、碾碎或嚼碎，要看药片刻痕、剂型和说明书。没有明确说明时，请整片吞服并咨询医生或药师。"
    };
  }

  return {
    formLabel: "剂型待确认",
    headline: "先看药盒说明，不要自行改变",
    split: "先核对说明书",
    crush: "先核对说明书",
    chew: "先核对说明书",
    detail:
      "目前没有识别到明确剂型。请查看药盒或说明书上的剂型名称，不确定时整片/整粒吞服并咨询医生或药师。"
  };
}
