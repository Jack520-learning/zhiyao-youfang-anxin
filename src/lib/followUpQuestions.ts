import type { ChatMessage } from "../types";
import { findHerbsInText } from "../catalog/herbs";

function normalize(value: string): string {
  return value.toLowerCase().replace(/[\s，。！？、,.!?；;：:（）()]/g, "");
}

function uniqueQuestions(questions: string[], history: ChatMessage[]): string[] {
  const asked = new Set(
    history
      .filter((message) => message.role === "user")
      .map((message) => normalize(message.content))
  );
  const seen = new Set<string>();
  return questions
    .map((question) => question.trim())
    .filter((question) => {
      const key = normalize(question);
      if (!key || seen.has(key) || asked.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}

export function buildFollowUpQuestions(input: {
  query: string;
  answer: string;
  history?: ChatMessage[];
  medicineName?: string;
  hasCurrentMedications?: boolean;
}): string[] {
  const query = input.query.trim();
  const answer = input.answer.trim();
  const combined = `${query}\n${answer}`;
  const medicineName = input.medicineName?.trim() || "";
  const herb = medicineName ? findHerbsInText(medicineName)[0] : undefined;
  const questions: string[] = [];

  if (/你是谁|你叫什么|你能做什么|你能干什么|你会做什么|你有什么功能|你会哪些功能/.test(query)) {
    questions.push(
      "帮我识别药盒照片",
      "怎么核对我现在吃的药？",
      "怎么判断药物之间有没有冲突？"
    );
  } else if (/(药盒照片|拍了.*药|图片分析|图像识别|识别到.*药)/.test(combined)) {
    if (herb) {
      questions.push(
        `${herb.name}的传统功用和性味归经是什么？`,
        `${herb.name}怎么辨识？`,
        "这种中药材和我现在吃的西药有冲突吗？"
      );
    } else if (medicineName) {
      questions.push(
        `${medicineName}每天怎么吃？`,
        `${medicineName}漏服了怎么办？`,
        input.hasCurrentMedications
          ? `${medicineName}和我现在吃的药有冲突吗？`
          : `${medicineName}有哪些需要当心的副作用？`
      );
    } else {
      questions.push(
        "这张照片里每一种药分别怎么吃？",
        "照片里这些药会不会重复或冲突？",
        "怎样补拍说明书确认剂量？"
      );
    }
  } else if (/(心脏|心口|胸口|胸前|胸部).*(不舒服|难受|不适|疼|痛|闷|心慌|悸)/.test(query)) {
    questions.push(
      "出现哪些心脏不适需要马上拨打 120？",
      "这次心脏不适该怎么记录给医生看？",
      input.hasCurrentMedications
        ? "我现在的药里有没有可能引起心慌或心脏不适？"
        : "心脏不舒服时现在能活动吗？"
    );
  } else if (/头晕|头昏|眩晕/.test(query)) {
    questions.push(
      "头晕时哪些伴随症状需要马上就医？",
      "怎样记录头晕和最近一次服药？",
      input.hasCurrentMedications
        ? "我现在的药里哪些可能引起头晕？"
        : "头晕时先坐下还是躺下更安全？"
    );
  } else if (/漏服|忘了吃|忘记吃|补服/.test(combined)) {
    questions.push(
      "如果漏服时间比较久，应该联系谁？",
      "下一次服药提醒怎么设置？",
      input.hasCurrentMedications
        ? "我现在吃的药里有高危漏服药物吗？"
        : "查看漏服相关的安全规则"
    );
  } else if (/头孢|阿莫西林|抗生素/.test(combined) && /酒|饮酒|喝酒/.test(combined)) {
    questions.push(
      "停药后多久才能考虑饮酒？",
      "现在出现心慌、脸红或呼吸困难该怎么办？",
      "查看这几种药的相互作用"
    );
  } else if (herb) {
    questions.push(
      `${herb.name}的传统功用是什么？`,
      `${herb.name}使用前要注意哪些安全事项？`,
      "这种中药材和我现在吃的西药有冲突吗？"
    );
  } else if (medicineName) {
    questions.push(
      `${medicineName}每次应该吃多少？`,
      `${medicineName}漏服了怎么办？`,
      input.hasCurrentMedications
        ? `${medicineName}和我现在吃的药有冲突吗？`
        : `${medicineName}饭前还是饭后吃？`
    );
  } else if (input.hasCurrentMedications) {
    questions.push(
      "核对我现在吃的药有没有重复成分或相互作用",
      "今天这些药具体怎么安排？",
      "出现不舒服时，怎样判断是不是药物引起的？"
    );
  } else {
    questions.push(
      "帮我识别药盒照片",
      "我该怎么录入当前正在吃的药？",
      "哪些情况属于需要立即就医的用药危险信号？"
    );
  }

  if (/资料不足|无法判断|无法准确|说明书写|未写明|需人工核实/.test(answer)) {
    questions.unshift("怎样补拍说明书或药盒来补充缺失信息？");
  }

  return uniqueQuestions(questions, input.history || []);
}
