export function buildUnavailableAnswer(query: string): string {
  const normalized = query.replace(/\s+/g, "");
  if (
    /(药|胶囊|片|颗粒|剂量|服用|同服|副作用|漏服|停药|mg|毫升)/i.test(
      normalized
    )
  ) {
    return "这个问题目前无法准确回答。请补充具体药名、规格、实际服用剂量和正在同服的药物。";
  }
  if (
    /(痛|晕|咳|喘|恶心|呕吐|腹泻|发热|发烧|不舒服|心慌|胸闷|麻|肿)/.test(
      normalized
    )
  ) {
    return "这个问题目前无法准确判断。请补充症状开始时间、严重程度和正在使用的药物；出现胸痛、呼吸困难、意识异常或明显出血时请立即拨打 120。";
  }
  if (
    /(病|高血压|糖尿病|心衰|房颤|肾病|肝病|哮喘|慢阻肺|痴呆|帕金森|癫痫|甲状腺|癌症)/.test(
      normalized
    )
  ) {
    return "这个问题目前无法准确回答。请补充医生确认的疾病名称、当前用药和您最想了解的具体方面。";
  }
  return "这个问题目前无法准确回答。请再说明具体场景、已经发生的情况和您希望我重点回答的内容。";
}
