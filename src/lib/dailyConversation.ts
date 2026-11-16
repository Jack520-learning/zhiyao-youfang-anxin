import type { AssistantResponse, ElderProfile } from "../types";
import { nowIso } from "./time";

type AnswerMode = "quick" | "safety" | "detailed";

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "");
}

export function isEmotionalDiscomfortQuery(query: string): boolean {
  const normalized = normalize(query);
  const physicalEmergency =
    /胸痛|胸口痛|喘不上气|呼吸困难|胸闷出汗|冷汗|晕倒|快晕倒|意识不清/.test(
      normalized
    );
  return (
    !physicalEmergency &&
    /(心里|心情|情绪).*(不舒服|难受|堵|烦|闷|压抑|低落)|想哭|委屈|孤独|烦躁/.test(
      normalized
    )
  );
}

export function isDailyConversationQuery(query: string): boolean {
  const normalized = normalize(query);
  return (
    isEmotionalDiscomfortQuery(query) ||
    /你好|您好|嗨|在吗|早上好|上午好|中午好|下午好|晚上好|谢谢|感谢|再见|晚安|心情|开心|难过|不高兴|烦|累|无聊|陪我|聊聊天|说说话|笑话|故事|唱歌|天气|下雨|今天.*太阳|太阳.*(大|晒|出来)|新闻|吃饭了吗|吃了吗|散步|电视|音乐|孩子|孙子|孙女|老伴|家人|睡得好|昨晚|今天过得|今天怎么样|你喜欢|你喜欢什么/.test(
      normalized
    )
  );
}

export function isContextualDailyReply(
  query: string,
  previousAssistantText = ""
): boolean {
  const normalized = normalize(query);
  if (
    !previousAssistantText ||
    !/[？?]|吗|呢|怎么样|顺心|还好吗/.test(previousAssistantText) ||
    !/^(还行|还好|还可以|可以|挺好|很好|不错|一般|不太好|不好|有一点|有一点儿|有点)[。！!]?$/.test(
      normalized
    )
  ) {
    return false;
  }
  return !/不舒服|头晕|胸闷|胸痛|呼吸困难|恶心|心慌|疼/.test(normalized);
}

export function resolveAdaptiveAnswerMode(
  query: string,
  requestedMode: AnswerMode
): AnswerMode {
  if (isDailyConversationQuery(query)) return "quick";
  return requestedMode;
}

function dailyReply(
  query: string,
  profile: ElderProfile,
  previousAssistantText = ""
): string {
  const normalized = normalize(query);
  const previous = normalize(previousAssistantText);
  const name = profile.name.trim();
  const greeting = name ? `${name}，` : "";

  if (isEmotionalDiscomfortQuery(query)) {
    return "听起来您现在心里有些难受，我愿意陪您慢慢说。是某件事让您烦心，还是一种说不清的压抑？如果这种痛苦已经难以承受，或出现伤害自己的念头，请马上联系家人并拨打 120。";
  }
  if (/你好|您好|嗨|早上好|上午好|中午好|下午好|晚上好/.test(normalized)) {
    return `${greeting}您好，我在呢。今天想随便聊聊，还是想让我帮您看看用药问题？`;
  }
  if (/谢谢|感谢/.test(normalized)) {
    return "不客气，能帮到您就好。还有想聊的或想核对的，都可以继续说。";
  }
  if (isContextualDailyReply(query, previousAssistantText)) {
    const negative = /不太好|不好|有一点|有点/.test(normalized);
    if (previous.includes("吃饭") || previous.includes("胃口") || previous.includes("睡觉")) {
      return negative
        ? "听您说还是有些不太顺心。主要是胃口、睡眠，还是身体哪里觉得不舒服？可以只说最明显的一项。"
        : "那就好。吃饭和睡觉方面，最近有没有哪一样想让您特别留意？";
    }
    return negative
      ? "听您说不太理想，我愿意继续听。现在最让您不舒服或担心的是哪一件事？"
      : "那就好。您想接着聊家里人、今天发生的事，还是最近的身体感受？";
  }
  if (/再见|晚安/.test(normalized)) {
    return normalized.includes("晚安")
      ? "晚安，早点休息。需要我时再叫我。"
      : "好，回头见。有事随时来找我。";
  }
  if (/难过|不高兴|心情不太好|心情不好|心情很差|心情低落|烦|委屈|孤单|无聊/.test(normalized)) {
    return "听起来您今天心里不太舒服，我愿意陪您说一会儿。发生什么事了？如果不方便说，也可以只聊聊现在最想让哪件事轻松一点。";
  }
  if (/开心|高兴|不错|很好/.test(normalized)) {
    return "听到您今天心情不错，我也很高兴。是什么事情让您觉得开心？";
  }
  if (/累|困|没精神/.test(normalized)) {
    return "您今天辛苦了。先坐下来歇一会儿，喝点温水，再和我说说是身体累，还是心里也有些累？";
  }
  if (/天气|下雨|今天.*太阳|太阳.*(大|晒|出来)/.test(normalized)) {
    return "我目前看不到实时天气，不能替您猜外面的情况。您可以看看手机天气，再告诉我温度和是否下雨，我可以陪您安排今天。";
  }
  if (/笑话/.test(normalized)) {
    return "给您讲个轻松的：小药盒问水杯，“你为什么总是陪着我？”水杯说，“因为你要是不按说明来，我可就真着急了。”您笑一笑，今天也别忘了按医嘱吃药。";
  }
  if (/故事|唱歌/.test(normalized)) {
    return normalized.includes("唱")
      ? "我不太会唱歌，不过可以陪您听听喜欢的音乐。您平时爱听戏曲、老歌，还是广播？"
      : "我可以陪您讲一小段生活故事，也可以听您讲过去的事。您更想听轻松的，还是想说说自己年轻时的经历？";
  }
  if (/新闻|今天怎么样/.test(normalized)) {
    return "我这边看不到实时新闻，也不能替您猜今天外面发生了什么。您可以把刚看到或听到的事告诉我，我们一起聊聊。";
  }
  if (/吃饭了吗|吃了吗/.test(normalized)) {
    return "我不用吃饭，但我很关心您吃过没有。今天胃口怎么样？";
  }
  if (/陪我|聊聊天|说说话/.test(normalized)) {
    return "当然可以。我们可以聊今天过得怎么样、家里的事、以前开心的事，或者您最近在担心什么。您想从哪件事说起？";
  }
  if (/孩子|孙子|孙女|老伴|家人/.test(normalized)) {
    return "家里人确实很容易牵动心情。您愿意说说最近和他们相处得怎么样吗？";
  }
  if (/散步|电视|音乐|喜欢/.test(normalized)) {
    return "听起来这是您平时比较喜欢的事。您最近还会经常散步、看看电视或听听音乐吗？";
  }
  return "我在认真听。您可以再多说一点，比如今天发生了什么、您现在心里是什么感觉，或者最想让我帮您想哪件事。";
}

export function buildDailyConversationResponse(
  query: string,
  profile: ElderProfile,
  previousAssistantText = ""
): AssistantResponse {
  const message = dailyReply(query, profile, previousAssistantText);
  return {
    message,
    riskCheck: {
      id: `daily-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      level: "low",
      title: "日常聊天",
      summary: message,
      nextStep: "继续自然聊天即可。",
      reasons: ["识别为日常交流，不进行疾病或药物推断"],
      sourceIds: ["src-chat"],
      involvedMedicationIds: [],
      medicationSnapshot: [],
      createdAt: nowIso(),
      trackInRiskSummary: false
    },
    stages: [
      { id: "daily-intent", label: "理解日常话题", status: "done" },
      { id: "daily-reply", label: "组织简短自然的回复", status: "done" }
    ],
    mode: "rules",
    conversationOnly: true
  };
}
