import { createServer } from "node:http";
import {
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual
} from "node:crypto";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import * as webpush from "web-push";

const root = fileURLToPath(new URL("../", import.meta.url));
const runtimeDir = join(root, "data", "runtime");
const dataPath = join(runtimeDir, "store.json");
const vapidPath = join(root, "data", "vapid.json");
const distDir = join(root, "dist");
const port = Number(process.env.PORT || 8788);
const shouldServeStatic = process.argv.includes("--serve");

await mkdir(runtimeDir, { recursive: true });

const initialDatabase = {
  version: 2,
  families: {},
  accounts: {},
  sessions: {},
  sentReminders: {}
};

let database = await loadDatabase();
database.accounts ??= {};
database.sessions ??= {};
let writeQueue = Promise.resolve();
const familyEventClients = new Map();
const scrypt = promisify(scryptCallback);
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const usernamePattern = /^[a-zA-Z0-9_\u4e00-\u9fa5]{3,24}$/u;

function broadcastFamily(familyCode, payload) {
  const clients = familyEventClients.get(familyCode);
  if (!clients) return;
  const message = `data: ${JSON.stringify(payload)}\n\n`;
  for (const response of clients) {
    try {
      response.write(message);
    } catch {
      clients.delete(response);
    }
  }
}

function pruneHandledAlerts(alerts = []) {
  const cutoff = Date.now() - 15 * 24 * 60 * 60 * 1000;
  return alerts.filter(
    (alert) =>
      !alert?.handledAt || new Date(alert.handledAt).getTime() >= cutoff
  );
}

async function loadDatabase() {
  try {
    return JSON.parse(await readFile(dataPath, "utf8"));
  } catch {
    return structuredClone(initialDatabase);
  }
}

function saveDatabase() {
  writeQueue = writeQueue.then(() =>
    writeFile(dataPath, JSON.stringify(database, null, 2))
  );
  return writeQueue;
}

async function getVapidKeys() {
  try {
    return JSON.parse(await readFile(vapidPath, "utf8"));
  } catch {
    const keys = webpush.generateVAPIDKeys();
    await writeFile(vapidPath, JSON.stringify(keys, null, 2));
    return keys;
  }
}

const vapid = await getVapidKeys();
webpush.setVapidDetails(
  `mailto:${process.env.VAPID_CONTACT || "admin@localhost"}`,
  vapid.publicKey,
  vapid.privateKey
);

function json(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request, limit = 4 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new Error("请求内容过大");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sanitizeFamilyCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function sanitizeDisplayName(value, fallback) {
  return String(value || "").trim().slice(0, 30) || fallback;
}

async function hashAccountPassword(password, salt = randomBytes(16).toString("hex")) {
  const key = await scrypt(String(password), salt, 64);
  return {
    passwordSalt: salt,
    passwordHash: Buffer.from(key).toString("hex")
  };
}

async function verifyAccountPassword(password, account) {
  const candidate = await hashAccountPassword(password, account.passwordSalt);
  const expected = Buffer.from(account.passwordHash, "hex");
  const actual = Buffer.from(candidate.passwordHash, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function publicAccount(account) {
  return {
    id: account.id,
    username: account.username,
    displayName: account.displayName,
    role: account.role,
    familyCode: account.familyCode,
    linkedFamilyCodes: account.linkedFamilyCodes,
    createdAt: account.createdAt
  };
}

function issueSession(accountId) {
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  database.sessions[token] = {
    accountId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_MAX_AGE_MS).toISOString()
  };
  return token;
}

function bearerToken(request) {
  const authorization = String(request.headers.authorization || "");
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

function authenticatedAccount(request) {
  const token = bearerToken(request);
  if (!token) return { account: null, token: "" };
  const session = database.sessions[token];
  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
    delete database.sessions[token];
    return { account: null, token: "" };
  }
  const account = Object.values(database.accounts).find(
    (item) => item.id === session.accountId
  );
  return { account: account || null, token };
}

function accountCodes(account) {
  return Array.from(
    new Set(
      [account?.familyCode, ...(account?.linkedFamilyCodes || [])]
        .map(sanitizeFamilyCode)
        .filter(Boolean)
    )
  );
}

function accountsShareFamily(left, right) {
  const leftCodes = new Set(accountCodes(left));
  return accountCodes(right).some((code) => leftCodes.has(code));
}

function connectedAccounts(account) {
  return Object.values(database.accounts)
    .filter(
      (candidate) =>
        candidate.id === account.id || accountsShareFamily(account, candidate)
    )
    .sort((left, right) => {
      if (left.role !== right.role) return left.role === "elder" ? -1 : 1;
      return left.displayName.localeCompare(right.displayName, "zh-CN");
    })
    .map(publicAccount);
}

function accountSnapshot(account) {
  return database.families[account.familyCode]?.snapshot || null;
}

function publicSnapshot(snapshot) {
  return {
    ...snapshot,
    medications: Array.isArray(snapshot.medications)
      ? snapshot.medications.map((medication) => ({
          ...medication,
          source: {
            ...medication.source,
            imageDataUrl: undefined
          }
        }))
      : []
  };
}

async function sendPush(subscription, payload) {
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return true;
  } catch (error) {
    if (error?.statusCode === 404 || error?.statusCode === 410) return false;
    console.error("Push failed", error?.statusCode || error?.message || error);
    return true;
  }
}

function timeParts(date = new Date(), timeZone = "Asia/Shanghai") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const value = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  );
  return {
    dateKey: `${value.year}-${value.month}-${value.day}`,
    time: `${value.hour === "24" ? "00" : value.hour}:${value.minute}`
  };
}

function minutesSinceMidnight(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

async function checkReminders() {
  let changed = false;
  for (const [familyCode, family] of Object.entries(database.families)) {
    const snapshot = family.snapshot;
    if (!snapshot?.consent) continue;
    const activeAlerts = pruneHandledAlerts(snapshot.familyAlerts || []);
    if (activeAlerts.length !== (snapshot.familyAlerts || []).length) {
      snapshot.familyAlerts = activeAlerts;
      family.revision = (family.revision || 0) + 1;
      changed = true;
    }
    const current = timeParts(
      new Date(),
      snapshot.profile?.timeZone || "Asia/Shanghai"
    );
    for (const medication of snapshot.medications || []) {
      if (medication.status !== "active") continue;
      if (medication.reminderEnabled === false) continue;
      for (const time of medication.times || []) {
        const dueMinute = minutesSinceMidnight(time);
        const nowMinute = minutesSinceMidnight(current.time);
        const delta = nowMinute - dueMinute;
        if (delta !== 0 && delta !== 5) continue;
        const doseId = `${current.dateKey}-${medication.id}-${time}`;
        const dose = (snapshot.doseEvents || []).find((item) => item.id === doseId);
        if (["taken", "skipped", "unsure"].includes(dose?.status)) continue;
        const reminderKey = `${current.dateKey}:${familyCode}:${medication.id}:${time}:${delta}`;
        if (database.sentReminders[reminderKey]) continue;

        const elderSubscriptions = (family.subscriptions || []).filter(
          (item) => item.role === "elder"
        );
        const title = delta === 0 ? "到吃药时间啦" : "再提醒一次";
        const body = `${medication.name} · ${medication.dosage} · ${medication.relation || "按处方使用"}`;
        for (const record of elderSubscriptions) {
          const valid = await sendPush(record.subscription, {
            title,
            body,
            url: "/",
            tag: doseId
          });
          if (!valid) record.invalid = true;
        }
        database.sentReminders[reminderKey] = Date.now();
        changed = true;
      }
    }

    if (snapshot.consent.shareMissedDose) {
      for (const medication of snapshot.medications || []) {
        if (medication.status !== "active") continue;
        if (medication.reminderEnabled === false) continue;
        for (const time of medication.times || []) {
          const delta = minutesSinceMidnight(current.time) - minutesSinceMidnight(time);
          if (delta < 90 || delta > 92) continue;
          const doseId = `${current.dateKey}-${medication.id}-${time}`;
          const dose = (snapshot.doseEvents || []).find((item) => item.id === doseId);
          if (dose?.status === "taken" || dose?.status === "skipped") continue;
          const alertKey = `family-alert:${current.dateKey}:${familyCode}:${medication.id}:${time}`;
          if (database.sentReminders[alertKey]) continue;
          const familySubscriptions = (family.subscriptions || []).filter(
            (item) => item.role === "family"
          );
          for (const record of familySubscriptions) {
            const valid = await sendPush(record.subscription, {
              title: "老人有一次用药尚未确认",
              body: `${
                snapshot.consent.shareMedicationSummary
                  ? medication.name
                  : "一次用药"
              } 已超过提醒时间，请先查看摘要，不代替老人确认已服药。`,
              url: "/family",
              tag: alertKey
            });
            if (!valid) record.invalid = true;
          }
          database.sentReminders[alertKey] = Date.now();
          changed = true;
        }
      }
    }

    family.subscriptions = (family.subscriptions || []).filter(
      (subscription) => !subscription.invalid
    );
  }
  if (changed) await saveDatabase();
}

function getAiKey() {
  return process.env.AI_API_KEY || process.env.DASHSCOPE_API_KEY || "";
}

function getAiBaseUrl() {
  return (
    process.env.AI_BASE_URL ||
    (process.env.DASHSCOPE_API_KEY
      ? "https://dashscope.aliyuncs.com/compatible-mode/v1"
      : "https://api.openai.com/v1")
  ).replace(/\/$/, "");
}

function getTextModel() {
  return process.env.AI_MODEL || process.env.QWEN_TEXT_MODEL || "";
}

function getVisionModel() {
  return (
    process.env.AI_VISION_MODEL ||
    process.env.QWEN_VISION_MODEL ||
    getTextModel() ||
    "gpt-4.1-mini"
  );
}

function getAsrModel() {
  return (
    process.env.QWEN_ASR_MODEL ||
    process.env.AI_ASR_MODEL ||
    "qwen3-asr-flash"
  );
}

function isAiConfigured() {
  return Boolean(getAiKey() && getTextModel());
}

function hasAiKey() {
  return Boolean(getAiKey());
}

function parseModelJson(content) {
  const cleaned = String(content || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error("模型返回格式不正确");
  }
}

async function callVisionIdentification(imageDataUrl, mode) {
  const baseUrl = getAiBaseUrl();
  const model = getVisionModel();
  const subject = mode === "herb" ? "中药材、中草药或饮片" : "药品包装";
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getAiKey()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "你是谨慎的图文识别器。只根据照片中可见的形态或文字识别每一个独立对象，不诊断、不推荐剂量、不提供处方。一张照片有多盒或多瓶不同药物时，必须逐项输出，不能合并，也不能只返回最清楚的一种。看不清时降低置信度并明确说明。必须输出 JSON。"
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `请逐项识别照片中的所有${subject}，不同包装、不同颜色或不同药名分别作为独立条目。输出 JSON：{"isMedicine":true或false,"rejectionReason":"照片不是药品、药盒、说明书或处方单时说明原因","candidates":[{"name":"名称","confidence":0到1,"visibleFeatures":["可见特征"]}],"medicines":[{"position":"例如：上/中/下或左/右","name":"包装上的完整药名","genericName":"通用名","activeIngredient":"有效成分","dosage":"包装上可见的规格和单次用量","price":"优先读取包装或价签价格；药名明确但未标价时，给出中国常见零售范围‘约¥X-Y/盒或支（市场参考）’；无法判断时写‘需以药房价格为准’","dosageForm":"剂型","strength":"规格","frequency":"包装明确写出的频次，否则留空","relation":"饭前/饭后/随餐/睡前，包装明确写出才填","instructions":"仅摘录该药品包装可见说明","confidence":0到1,"visibleFeatures":["用于区分该药品的可见特征"]}],"summary":"不超过120字的谨慎结论","cautions":["需要人工核实的点"]}。medicines 必须包含所有可辨识的不同对象，通常为1到10项；不要只填第一种。相同药品重复出现只输出一次。中药材形态相似时不要给单一确定结论；药品必须优先读取每个包装的文字。价格估算必须明确写“市场参考”，不得说成实际售价；其他看不清的信息不要猜测。`
            },
            {
              type: "image_url",
              image_url: { url: imageDataUrl }
            }
          ]
        }
      ]
    })
  });
  if (!response.ok) {
    throw new Error(`视觉模型返回 ${response.status}`);
  }
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  const parsed = parseModelJson(content);
  const parsedMedicines = Array.isArray(parsed.medicines)
    ? parsed.medicines
    : parsed.medicine && typeof parsed.medicine === "object"
      ? [parsed.medicine]
      : [];
  const medicines = parsedMedicines
    .filter((item) => item && typeof item.name === "string" && item.name.trim())
    .slice(0, 10)
    .map((item) => ({
      position: String(item.position || "").slice(0, 30),
      name: String(item.name || "").slice(0, 50),
      genericName: String(item.genericName || "").slice(0, 50),
      activeIngredient: String(item.activeIngredient || "").slice(0, 80),
      dosage: String(item.dosage || "").slice(0, 80),
      price: String(item.price || "").slice(0, 40),
      dosageForm: String(item.dosageForm || "").slice(0, 40),
      strength: String(item.strength || "").slice(0, 80),
      frequency: String(item.frequency || "").slice(0, 40),
      relation: String(item.relation || "").slice(0, 30),
      instructions: String(item.instructions || "").slice(0, 500),
      confidence:
        typeof item.confidence === "number"
          ? Math.max(0, Math.min(1, item.confidence))
          : 0,
      visibleFeatures: Array.isArray(item.visibleFeatures)
        ? item.visibleFeatures
            .filter((value) => typeof value === "string")
            .slice(0, 6)
        : []
    }));
  const candidateMap = new Map();
  for (const candidate of Array.isArray(parsed.candidates)
    ? parsed.candidates
    : []) {
    if (!candidate || typeof candidate.name !== "string") continue;
    candidateMap.set(candidate.name.slice(0, 40), candidate);
  }
  for (const medicine of medicines) {
    if (!candidateMap.has(medicine.name)) {
      candidateMap.set(medicine.name, {
        name: medicine.name,
        confidence: medicine.confidence,
        visibleFeatures: medicine.visibleFeatures
      });
    }
  }
  return {
    isMedicine:
      typeof parsed.isMedicine === "boolean" ? parsed.isMedicine : null,
    rejectionReason:
      typeof parsed.rejectionReason === "string"
        ? parsed.rejectionReason.slice(0, 160)
        : "",
    candidates: Array.from(candidateMap.values())
      .filter((item) => item && typeof item.name === "string")
      .slice(0, 10)
      .map((item) => ({
        name: item.name.slice(0, 40),
        confidence:
          typeof item.confidence === "number"
            ? Math.max(0, Math.min(1, item.confidence))
            : 0,
        visibleFeatures: Array.isArray(item.visibleFeatures)
          ? item.visibleFeatures
              .filter((value) => typeof value === "string")
              .slice(0, 5)
          : []
      })),
    summary:
      typeof parsed.summary === "string" ? parsed.summary.slice(0, 300) : "",
    cautions: Array.isArray(parsed.cautions)
      ? parsed.cautions.filter((value) => typeof value === "string").slice(0, 5)
      : [],
    medicines,
    medicine: medicines[0],
    mode: "live"
  };
}

async function callQwenTranscription(audioBase64, mimeType) {
  const baseUrl = getAiBaseUrl();
  const model = getAsrModel();
  const audioDataUrl = `data:${mimeType};base64,${audioBase64}`;

  const chatResponse = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getAiKey()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "input_audio",
              input_audio: {
                data: audioDataUrl
              }
            }
          ]
        }
      ]
    })
  });
  if (!chatResponse.ok) {
    const errorPayload = await chatResponse.json().catch(() => null);
    const providerMessage =
      typeof errorPayload?.error?.message === "string"
        ? errorPayload.error.message.replace(/\s+/g, " ").slice(0, 160)
        : "";
    throw new Error(
      `千问语音识别失败（${chatResponse.status}）${
        providerMessage ? `：${providerMessage}` : ""
      }`
    );
  }
  const chatPayload = await chatResponse.json();
  const content = chatPayload.choices?.[0]?.message?.content;
  const text =
    typeof content === "string"
      ? content.trim()
      : typeof content?.text === "string"
        ? content.text.trim()
        : "";
  if (!text) throw new Error("千问没有返回语音文字");
  return { text, model };
}

const TTS_MODEL = process.env.QWEN_TTS_MODEL || "qwen-audio-3.1-tts-flash";
const CUSTOM_TTS_MODEL =
  process.env.QWEN_CUSTOM_TTS_MODEL || "qwen-audio-3.1-tts-plus";
const systemVoices = {
  warm: "longanhuan_v3.1",
  clear: "longxiaoxia_v3.1",
  male: "longanyang_v3.1",
  calm: "longcheng_v3.1"
};

function getTtsBaseUrl() {
  return (
    process.env.DASHSCOPE_TTS_BASE_URL ||
    "https://dashscope.aliyuncs.com/api/v1"
  ).replace(/\/$/, "");
}

async function callQwenTts(text, voiceMode, customVoiceId) {
  const isCustom = voiceMode === "custom" && customVoiceId;
  const voice = isCustom ? customVoiceId : systemVoices[voiceMode];
  if (!voice) throw new Error("没有找到对应的朗读音色");
  const response = await fetch(
    `${getTtsBaseUrl()}/services/audio/tts/SpeechSynthesizer`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getAiKey()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: isCustom ? CUSTOM_TTS_MODEL : TTS_MODEL,
        input: {
          text: String(text || "").slice(0, 2500),
          voice,
          format: "wav",
          sample_rate: 24000
        }
      })
    }
  );
  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`千问语音合成失败（${response.status}）：${payload.slice(0, 160)}`);
  }
  const payload = await response.json();
  const audioUrl = payload.output?.audio?.url;
  if (!audioUrl) throw new Error("千问没有返回可播放音频");
  return {
    audioUrl: String(audioUrl).replace(/^http:\/\//i, "https://"),
    voice
  };
}

async function createCustomVoice(audioDataUrl) {
  const prefix = `u${Date.now().toString(36).slice(-7)}${Math.random()
    .toString(36)
    .slice(2, 4)}`.slice(0, 10);
  const response = await fetch(
    `${getTtsBaseUrl()}/services/audio/tts/customization`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getAiKey()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "voice-enrollment",
        input: {
          action: "create_voice",
          target_model: CUSTOM_TTS_MODEL,
          prefix,
          audio: audioDataUrl
        }
      })
    }
  );
  if (!response.ok) {
    const payload = await response.text();
    throw new Error(
      `专属音色创建失败（${response.status}）：${payload.slice(0, 200)}`
    );
  }
  const payload = await response.json();
  const voiceId = payload.output?.voice_id;
  if (!voiceId) throw new Error("官方接口没有返回音色 ID");
  let status = payload.output?.status || "DEPLOYING";
  for (let attempt = 0; attempt < 30 && status === "DEPLOYING"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const query = await fetch(
      `${getTtsBaseUrl()}/services/audio/tts/customization`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getAiKey()}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "voice-enrollment",
          input: { action: "query_voice", voice_id: voiceId }
        })
      }
    );
    if (!query.ok) break;
    const queryPayload = await query.json();
    status = queryPayload.output?.status || status;
  }
  if (status !== "OK") {
    throw new Error(`专属音色仍在部署或创建失败：${status}`);
  }
  return { voiceId, status, model: CUSTOM_TTS_MODEL };
}

async function deleteCustomVoice(voiceId) {
  const response = await fetch(
    `${getTtsBaseUrl()}/services/audio/tts/customization`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getAiKey()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "voice-enrollment",
        input: { action: "delete_voice", voice_id: voiceId }
      })
    }
  );
  if (!response.ok) {
    const payload = await response.text();
    throw new Error(
      `专属音色删除失败（${response.status}）：${payload.slice(0, 180)}`
    );
  }
  return response.json();
}

async function callAiAssistant(payload) {
  const baseUrl = getAiBaseUrl();
  const skillFocus = {
    photo:
      "围绕照片识别结果回答，明确哪些字段来自图片、哪些仍需包装或说明书确认。",
    catalog:
      "围绕具体药品的用法、剂量边界、禁忌、不良反应、价格线索和当前同服风险回答。",
    herbs:
      "围绕中药材辨识、传统用途、安全提醒及与当前处方药的搭配风险回答。",
    "multi-drug":
      "逐项核对重复成分、同类重复、相互作用和错峰服用，不自行决定停药或改剂量。"
  }[payload.skill] || "使用普通安全用药问答方式。";
  const answerStyle = {
    quick: "用两三句话直接回答，先给结论和下一步。",
    safety: "先核对用药风险，再给结论、原因和下一步。",
    detailed: "先给结论，再分层解释原因、注意点和下一步，仍保持简洁。"
  }[payload.answerMode] || "先给结论，再说明原因和下一步。";
  const context = {
    age: payload.profile?.age,
    conditions: payload.profile?.conditions || [],
    allergies: payload.profile?.allergies || [],
    medications: (payload.medications || []).map((medication) => ({
      name: medication.name,
      genericName: medication.genericName,
      ingredients: medication.ingredients,
      dosage: medication.dosage,
      relation: medication.relation
    })),
    evidence: payload.evidence || [],
    riskLevel: payload.riskLevel || "unknown",
    activeSkill: payload.skillLabel || "",
    skillFocus,
    answerStyle,
    groundingText: String(payload.groundingText || "").slice(0, 5000),
    conversationHistory: Array.isArray(payload.history)
      ? payload.history
          .filter(
            (item) =>
              item &&
              (item.role === "user" || item.role === "assistant") &&
              typeof item.content === "string"
          )
          .slice(-10)
          .map((item) => ({
            role: item.role,
            content: item.content.slice(0, 1000)
          }))
      : []
  };
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getAiKey()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: getTextModel(),
      temperature: 0.1,
      max_tokens: 1200,
      messages: [
        {
          role: "system",
          content:
            "你是基于通义千问的老人安全用药信息助手。groundingText 是本地安全规则已经确定的结论和依据，只能在不改变其风险等级、剂量边界、禁忌和下一步的前提下改写表达。当前技能只决定回答重点，不得借技能扩张医疗权限。不得补充 groundingText 之外的药物事实，不诊断、不开处方、不判断停药、不建议调整剂量或替代医生。高风险或紧急状态只能强调求助，不得增加具体用药动作。资料不足时保留“资料不足”。先给结论，再说明原因和下一步，用简短、温和、老人能理解的中文回答。"
        },
        {
          role: "user",
          content: `安全上下文：${JSON.stringify(context)}\n当前技能重点：${skillFocus}\n回答方式：${answerStyle}\n用户问题：${String(payload.query || "").slice(0, 1000)}`
        }
      ]
    })
  });
  if (!response.ok) throw new Error(`AI 服务返回 ${response.status}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim();
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
  ".wasm": "application/wasm",
  ".gz": "application/gzip"
};

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const relativePath = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, "");
  let filePath = join(distDir, relativePath);
  try {
    await access(filePath);
  } catch {
    filePath = join(distDir, "index.html");
  }
  try {
    const file = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream"
    });
    response.end(file);
  } catch {
    json(response, 404, { error: "未找到页面，请先运行 npm run build" });
  }
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname === "/api/health" && request.method === "GET") {
      return json(response, 200, { ok: true, aiConfigured: isAiConfigured() });
    }

    if (url.pathname === "/api/auth/register" && request.method === "POST") {
      const body = await readJson(request, 128 * 1024);
      const username = normalizeUsername(body.username);
      const password = String(body.password || "");
      const role = body.role === "family" ? "family" : "elder";
      const familyCode = sanitizeFamilyCode(body.familyCode);
      if (!usernamePattern.test(username)) {
        return json(response, 400, {
          error: "账号需为 3 到 24 位中文、字母、数字或下划线"
        });
      }
      if (password.length < 6) {
        return json(response, 400, { error: "密码至少需要 6 位" });
      }
      if (familyCode.length < 6) {
        return json(response, 400, { error: "家庭连接码需要 6 到 8 位" });
      }
      if (database.accounts[username]) {
        return json(response, 409, { error: "这个账号已经注册，请直接登录" });
      }
      const codeExists = Object.values(database.accounts).some(
        (account) =>
          account.role === "elder" &&
          accountCodes(account).includes(familyCode)
      );
      if (role === "family" && !codeExists && !database.families[familyCode]?.snapshot) {
        return json(response, 404, {
          error: "没有找到这个家庭连接码对应的老人账号"
        });
      }
      if (
        role === "elder" &&
        (codeExists || Boolean(database.families[familyCode]?.snapshot))
      ) {
        return json(response, 409, {
          error: "这个连接码已经对应其他老人，请设置新的连接码"
        });
      }
      const passwordRecord = await hashAccountPassword(password);
      const account = {
        id: randomUUID(),
        username,
        displayName: sanitizeDisplayName(body.displayName, username),
        role,
        familyCode,
        linkedFamilyCodes: [familyCode],
        ...passwordRecord,
        createdAt: new Date().toISOString()
      };
      database.accounts[username] = account;
      const token = issueSession(account.id);
      await saveDatabase();
      return json(response, 201, {
        token,
        account: publicAccount(account),
        accounts: connectedAccounts(account),
        snapshot: accountSnapshot(account)
      });
    }

    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      const body = await readJson(request, 64 * 1024);
      const username = normalizeUsername(body.username);
      const account = database.accounts[username];
      const valid =
        account &&
        (await verifyAccountPassword(String(body.password || ""), account));
      if (!valid) {
        return json(response, 401, { error: "账号或密码不正确" });
      }
      const token = issueSession(account.id);
      await saveDatabase();
      return json(response, 200, {
        token,
        account: publicAccount(account),
        accounts: connectedAccounts(account),
        snapshot: accountSnapshot(account)
      });
    }

    if (url.pathname === "/api/auth/accounts" && request.method === "GET") {
      const { account } = authenticatedAccount(request);
      if (!account) return json(response, 401, { error: "请先登录" });
      return json(response, 200, {
        account: publicAccount(account),
        accounts: connectedAccounts(account),
        snapshot: accountSnapshot(account)
      });
    }

    if (
      url.pathname === "/api/auth/linked-account" &&
      request.method === "POST"
    ) {
      const { account: currentAccount } = authenticatedAccount(request);
      if (!currentAccount) return json(response, 401, { error: "请先登录" });
      const body = await readJson(request, 128 * 1024);
      const username = normalizeUsername(body.username);
      const password = String(body.password || "");
      const role = body.role === "elder" ? "elder" : "family";
      if (!usernamePattern.test(username)) {
        return json(response, 400, {
          error: "账号需为 3 到 24 位中文、字母、数字或下划线"
        });
      }
      if (password.length < 6) {
        return json(response, 400, { error: "密码至少需要 6 位" });
      }
      if (database.accounts[username]) {
        return json(response, 409, { error: "这个账号已经注册" });
      }
      if (role === "elder" && currentAccount.role !== "family") {
        return json(response, 403, {
          error: "只有家属账号可以新建老人档案"
        });
      }
      const originalCodes = accountCodes(currentAccount);
      const familyCode =
        role === "family"
          ? currentAccount.familyCode
          : sanitizeFamilyCode(body.familyCode);
      if (familyCode.length < 6) {
        return json(response, 400, { error: "新老人档案需要家庭连接码" });
      }
      if (
        role === "elder" &&
        Object.values(database.accounts).some(
          (account) =>
            account.role === "elder" &&
            accountCodes(account).includes(familyCode)
        )
      ) {
        return json(response, 409, {
          error: "这个连接码已经对应其他老人"
        });
      }
      const passwordRecord = await hashAccountPassword(password);
      const linkedCodes =
        role === "family"
          ? Array.from(new Set([...accountCodes(currentAccount), familyCode]))
          : [familyCode];
      const linkedAccount = {
        id: randomUUID(),
        username,
        displayName: sanitizeDisplayName(body.displayName, username),
        role,
        familyCode,
        linkedFamilyCodes: linkedCodes,
        ...passwordRecord,
        createdAt: new Date().toISOString()
      };
      database.accounts[username] = linkedAccount;
      const familyGroupAccounts = Object.values(database.accounts).filter(
        (account) =>
          account.id === currentAccount.id ||
          (account.role === "family" &&
            accountCodes(account).some((code) => originalCodes.includes(code)))
      );
      for (const account of familyGroupAccounts) {
        account.linkedFamilyCodes = Array.from(
          new Set([...accountCodes(account), ...accountCodes(currentAccount), familyCode])
        );
      }
      currentAccount.familyCode = currentAccount.familyCode || familyCode;
      await saveDatabase();
      return json(response, 201, {
        account: publicAccount(linkedAccount),
        accounts: connectedAccounts(currentAccount)
      });
    }

    if (url.pathname === "/api/auth/switch" && request.method === "POST") {
      const { account: currentAccount } = authenticatedAccount(request);
      if (!currentAccount) return json(response, 401, { error: "请先登录" });
      const body = await readJson(request, 64 * 1024);
      const username = normalizeUsername(body.username);
      const accountId = String(body.accountId || "");
      const target =
        database.accounts[username] ||
        Object.values(database.accounts).find(
          (account) => account.id === accountId
        );
      if (!target || !accountsShareFamily(currentAccount, target)) {
        return json(response, 403, { error: "没有权限切换到该账号" });
      }
      const token = issueSession(target.id);
      await saveDatabase();
      return json(response, 200, {
        token,
        account: publicAccount(target),
        accounts: connectedAccounts(target),
        snapshot: accountSnapshot(target)
      });
    }

    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      const { token } = authenticatedAccount(request);
      if (token) {
        delete database.sessions[token];
        await saveDatabase();
      }
      return json(response, 200, { ok: true });
    }

    if (
      url.pathname === "/api/auth/verify-password" &&
      request.method === "POST"
    ) {
      const { account: currentAccount } = authenticatedAccount(request);
      if (!currentAccount) return json(response, 401, { error: "请先登录" });
      const body = await readJson(request, 64 * 1024);
      const target = Object.values(database.accounts).find(
        (account) => account.id === String(body.accountId || "")
      );
      if (!target || !accountsShareFamily(currentAccount, target)) {
        return json(response, 404, { error: "没有找到该账号" });
      }
      const valid = await verifyAccountPassword(
        String(body.password || ""),
        target
      );
      if (!valid) {
        return json(response, 401, { error: "密码不正确" });
      }
      return json(response, 200, { ok: true });
    }

    if (url.pathname === "/api/auth/delete" && request.method === "POST") {
      const { account: currentAccount } = authenticatedAccount(request);
      if (!currentAccount) return json(response, 401, { error: "请先登录" });
      const body = await readJson(request, 64 * 1024);
      const accountId = String(body.accountId || "");
      const target = Object.values(database.accounts).find(
        (account) => account.id === accountId
      );
      if (!target || !accountsShareFamily(currentAccount, target)) {
        return json(response, 404, { error: "没有找到可删除的账号" });
      }
      if (!(await verifyAccountPassword(String(body.password || ""), target))) {
        return json(response, 401, { error: "密码不正确，账号尚未删除" });
      }
      if (target.role === "elder") {
        const deletedCode = target.familyCode;
        delete database.families[deletedCode];
        for (const account of Object.values(database.accounts)) {
          if (account.id === target.id || !accountCodes(account).includes(deletedCode)) {
            continue;
          }
          const remainingCodes = accountCodes(account).filter(
            (code) => code !== deletedCode
          );
          account.linkedFamilyCodes = remainingCodes;
          if (account.familyCode === deletedCode) {
            account.familyCode = remainingCodes[0] || "";
          }
        }
      }
      delete database.accounts[target.username];
      for (const [token, session] of Object.entries(database.sessions)) {
        if (session.accountId === target.id) delete database.sessions[token];
      }
      await saveDatabase();
      return json(response, 200, { ok: true });
    }

    if (url.pathname === "/api/push/public-key" && request.method === "GET") {
      return json(response, 200, { publicKey: vapid.publicKey });
    }

    if (url.pathname === "/api/push/subscribe" && request.method === "POST") {
      const body = await readJson(request);
      const familyCode = sanitizeFamilyCode(body.familyCode);
      if (!familyCode || !body.subscription?.endpoint) {
        return json(response, 400, { error: "缺少家庭码或推送订阅" });
      }
      const family = (database.families[familyCode] ??= {
        snapshot: null,
        subscriptions: []
      });
      family.subscriptions = family.subscriptions.filter(
        (item) => item.subscription?.endpoint !== body.subscription.endpoint
      );
      family.subscriptions.push({
        role: body.role === "family" ? "family" : "elder",
        subscription: body.subscription,
        createdAt: new Date().toISOString()
      });
      await saveDatabase();
      return json(response, 200, { ok: true });
    }

    if (url.pathname === "/api/push/subscribe" && request.method === "DELETE") {
      const body = await readJson(request);
      const endpoint = String(body.endpoint || "");
      if (!endpoint) return json(response, 400, { error: "缺少订阅地址" });
      for (const family of Object.values(database.families)) {
        family.subscriptions = (family.subscriptions || []).filter(
          (record) => record.subscription?.endpoint !== endpoint
        );
      }
      await saveDatabase();
      return json(response, 200, { ok: true });
    }

    if (url.pathname === "/api/concern" && request.method === "POST") {
      const body = await readJson(request);
      const familyCode = sanitizeFamilyCode(body.familyCode);
      if (!familyCode) return json(response, 400, { error: "缺少家庭码" });
      const family = database.families[familyCode];
      if (!family?.snapshot) {
        return json(response, 404, { error: "尚未找到老人同步摘要" });
      }
      if (family.snapshot.consent?.shareEmergency === false) {
        return json(response, 403, { error: "老人尚未授权共享求助信息" });
      }
      const alert = {
        id: `concern-${Date.now()}`,
        type: "concern",
        title: "老人说身体不舒服",
        message: String(
          body.message || "老人请求家人查看当前身体状态。"
        ).slice(0, 160),
        createdAt: new Date().toISOString()
      };
      family.snapshot.familyAlerts = pruneHandledAlerts([
        alert,
        ...(family.snapshot.familyAlerts || [])
      ]).slice(0, 100);
      family.snapshot.updatedAt = alert.createdAt;
      family.revision = (family.revision || 0) + 1;
      const subscriptions = family.subscriptions || [];
      for (const record of subscriptions.filter(
        (item) => item.role === "family"
      )) {
        const valid = await sendPush(record.subscription, {
          title: `${String(body.elderName || "老人").slice(0, 20)}说不舒服`,
          body: alert.message,
          url: "/family",
          tag: alert.id
        });
        if (!valid) record.invalid = true;
      }
      family.subscriptions = subscriptions.filter((record) => !record.invalid);
      await saveDatabase();
      broadcastFamily(familyCode, {
        type: "update",
        revision: family.revision || 0,
        familyCode
      });
      return json(response, 200, { ok: true, alert });
    }

    if (url.pathname === "/api/sos" && request.method === "POST") {
      const body = await readJson(request);
      const familyCode = sanitizeFamilyCode(body.familyCode);
      const family = database.families[familyCode];
      if (!familyCode) return json(response, 400, { error: "缺少家庭码" });
      if (family?.snapshot?.consent?.allowSosContact === false) {
        return json(response, 403, { error: "老人尚未授权 SOS 联系家人" });
      }
      const subscriptions = family?.subscriptions || [];
      const alert = {
        id: `sos-${Date.now()}`,
        type: "sos",
        title: "老人发起 SOS 求助",
        message: "请立即查看老人状态并联系紧急联系人。",
        createdAt: new Date().toISOString()
      };
      if (family?.snapshot) {
        family.snapshot.familyAlerts = pruneHandledAlerts([
          alert,
          ...(family.snapshot.familyAlerts || [])
        ]).slice(0, 100);
        family.snapshot.updatedAt = alert.createdAt;
        family.revision = (family.revision || 0) + 1;
      }
      const payload = {
        title: `紧急求助：${String(body.elderName || "老人").slice(0, 20)}`,
        body: `年龄 ${Number(body.age) || "未填写"}；过敏：${
          Array.isArray(body.allergies) && body.allergies.length
            ? body.allergies.join("、")
            : "未记录"
        }；当前药物：${
          Array.isArray(body.medications) && body.medications.length
            ? body.medications.slice(0, 8).join("、")
            : "未记录"
        }`,
        url: "/family",
        tag: `sos-${Date.now()}`
      };
      for (const record of subscriptions) {
        const valid = await sendPush(record.subscription, payload);
        if (!valid) record.invalid = true;
      }
      family.subscriptions = subscriptions.filter((record) => !record.invalid);
      await saveDatabase();
      broadcastFamily(familyCode, {
        type: "update",
        revision: family.revision || 0,
        familyCode
      });
      return json(response, 200, {
        ok: true,
        delivered: subscriptions.filter((record) => !record.invalid).length
      });
    }

    if (url.pathname === "/api/sync" && request.method === "PUT") {
      const body = await readJson(request);
      const familyCode = sanitizeFamilyCode(body.familyCode);
      if (!familyCode) return json(response, 400, { error: "缺少家庭码" });
      const family = (database.families[familyCode] ??= {
        snapshot: null,
        subscriptions: []
      });
      family.snapshot = publicSnapshot(body);
      family.snapshot.familyCode = familyCode;
      family.updatedAt = new Date().toISOString();
      family.revision = (family.revision || 0) + 1;
      await saveDatabase();
      broadcastFamily(familyCode, {
        type: "update",
        revision: family.revision,
        familyCode
      });
      return json(response, 200, { revision: family.revision });
    }

    const eventMatch = url.pathname.match(
      /^\/api\/family\/([A-Z0-9]+)\/events$/
    );
    if (eventMatch && request.method === "GET") {
      const familyCode = sanitizeFamilyCode(eventMatch[1]);
      response.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no"
      });
      response.write("retry: 2000\n\n");
      response.write(
        `data: ${JSON.stringify({
          type: "connected",
          familyCode,
          revision: database.families[familyCode]?.revision || 0
        })}\n\n`
      );
      const clients = familyEventClients.get(familyCode) ?? new Set();
      clients.add(response);
      familyEventClients.set(familyCode, clients);
      const heartbeat = setInterval(() => {
        response.write(`event: heartbeat\ndata: ${Date.now()}\n\n`);
      }, 20_000);
      request.on("close", () => {
        clearInterval(heartbeat);
        clients.delete(response);
        if (!clients.size) familyEventClients.delete(familyCode);
      });
      return;
    }

    if (url.pathname.startsWith("/api/family/")) {
      const pathParts = url.pathname.split("/").filter(Boolean);
      const isContactsUpdate =
        request.method === "PUT" && pathParts.at(-1) === "contacts";
      const isAlertUpdate =
        request.method === "PUT" && pathParts[3] === "alerts" && pathParts[4];
      const familyCode = sanitizeFamilyCode(
        isContactsUpdate ? pathParts.at(-2) : pathParts[2]
      );
      const family = database.families[familyCode];
      if (isAlertUpdate) {
        if (!family?.snapshot) return json(response, 404, { error: "未找到家庭" });
        const body = await readJson(request, 128 * 1024);
        const alert = (family.snapshot.familyAlerts || []).find(
          (item) => item.id === pathParts[4]
        );
        if (!alert) return json(response, 404, { error: "未找到记录" });
        alert.handledAt =
          body.handled === false ? undefined : new Date().toISOString();
        alert.handledBy = String(body.handledBy || "家属").slice(0, 30);
        family.snapshot.familyAlerts = pruneHandledAlerts(
          family.snapshot.familyAlerts || []
        );
        family.snapshot.updatedAt = new Date().toISOString();
        family.revision = (family.revision || 0) + 1;
        await saveDatabase();
        broadcastFamily(familyCode, {
          type: "update",
          revision: family.revision,
          familyCode
        });
        return json(response, 200, {
          ok: true,
          alert,
          revision: family.revision
        });
      }
      if (isContactsUpdate) {
        if (!family?.snapshot) return json(response, 404, { error: "未找到家庭" });
        const body = await readJson(request, 512 * 1024);
        if (!Array.isArray(body.contacts)) {
          return json(response, 400, { error: "联系人格式不正确" });
        }
        family.snapshot.emergencyContacts = body.contacts
          .filter((item) => item && typeof item === "object")
          .slice(0, 10)
          .map((item, index) => ({
            id: String(item.id || `contact-${Date.now()}-${index}`).slice(0, 80),
            name: String(item.name || "").slice(0, 30),
            relation: String(item.relation || "联系人").slice(0, 30),
            phone: String(item.phone || "").slice(0, 30),
            kind: ["family", "caregiver", "emergency"].includes(item.kind)
              ? item.kind
              : "family"
          }))
          .filter((item) => item.name && item.phone);
        family.snapshot.updatedAt = new Date().toISOString();
        family.revision = (family.revision || 0) + 1;
        await saveDatabase();
        broadcastFamily(familyCode, {
          type: "update",
          revision: family.revision,
          familyCode
        });
        return json(response, 200, {
          ok: true,
          revision: family.revision,
          contacts: family.snapshot.emergencyContacts
        });
      }
      if (request.method === "GET") {
        if (!family?.snapshot) return json(response, 404, { error: "未找到家庭" });
        return json(response, 200, family.snapshot);
      }
      if (request.method === "DELETE") {
        delete database.families[familyCode];
        await saveDatabase();
        return json(response, 200, { ok: true });
      }
    }

    if (url.pathname === "/api/assistant" && request.method === "POST") {
      if (!isAiConfigured()) {
        return json(response, 501, {
          error: "未配置大模型，客户端应使用本地安全规则模式"
        });
      }
      const body = await readJson(request, 1024 * 1024);
      const answer = await callAiAssistant(body);
      if (!answer) return json(response, 502, { error: "模型没有返回内容" });
      return json(response, 200, { message: answer, mode: "llm" });
    }

    if (url.pathname === "/api/transcribe" && request.method === "POST") {
      if (!hasAiKey()) {
        return json(response, 503, {
          error: "千问语音识别尚未配置，请改用文字输入。"
        });
      }
      const body = await readJson(request, 18 * 1024 * 1024);
      const match = String(body.audioDataUrl || "").match(
        /^data:(audio\/[^;,]+)[^,]*;base64,(.+)$/s
      );
      if (!match) {
        return json(response, 400, { error: "没有收到有效语音。" });
      }
      try {
        const result = await callQwenTranscription(match[2], match[1]);
        return json(response, 200, { ...result, mode: "llm" });
      } catch (error) {
        return json(response, 502, {
          error:
            error instanceof Error
              ? error.message
              : "千问语音识别暂时不可用，请改用文字输入。"
        });
      }
    }

    if (url.pathname === "/api/tts" && request.method === "POST") {
      if (!hasAiKey()) {
        return json(response, 503, { error: "千问语音合成尚未配置" });
      }
      const body = await readJson(request, 256 * 1024);
      if (!String(body.text || "").trim()) {
        return json(response, 400, { error: "没有需要朗读的文字" });
      }
      try {
        const result = await callQwenTts(
          body.text,
          body.voiceMode,
          body.customVoiceId
        );
        return json(response, 200, result);
      } catch (error) {
        return json(response, 502, {
          error:
            error instanceof Error ? error.message : "语音合成暂时不可用"
        });
      }
    }

    if (url.pathname === "/api/voice-clone" && request.method === "POST") {
      if (!hasAiKey()) {
        return json(response, 503, { error: "千问音色复刻尚未配置" });
      }
      const body = await readJson(request, 15 * 1024 * 1024);
      const audioDataUrl = String(body.audioDataUrl || "");
      if (
        !/^data:audio\/(wav|mpeg|mp3|mp4|m4a|x-m4a);base64,/i.test(
          audioDataUrl
        )
      ) {
        return json(response, 400, {
          error: "请提供 10 到 20 秒的 WAV、MP3 或 M4A 人声音频"
        });
      }
      try {
        const result = await createCustomVoice(audioDataUrl);
        return json(response, 200, result);
      } catch (error) {
        return json(response, 502, {
          error:
            error instanceof Error ? error.message : "专属音色创建失败"
        });
      }
    }

    if (
      url.pathname.startsWith("/api/voice-clone/") &&
      request.method === "DELETE"
    ) {
      if (!hasAiKey()) {
        return json(response, 503, { error: "千问音色复刻尚未配置" });
      }
      const voiceId = decodeURIComponent(
        url.pathname.slice("/api/voice-clone/".length)
      );
      if (!voiceId.startsWith("qwen-audio-")) {
        return json(response, 400, { error: "音色标识格式不正确" });
      }
      try {
        await deleteCustomVoice(voiceId);
        return json(response, 200, { ok: true });
      } catch (error) {
        return json(response, 502, {
          error:
            error instanceof Error ? error.message : "专属音色删除失败"
        });
      }
    }

    if (url.pathname === "/api/vision-identify" && request.method === "POST") {
      const body = await readJson(request, 10 * 1024 * 1024);
      if (
        typeof body.imageDataUrl !== "string" ||
        !/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(body.imageDataUrl)
      ) {
        return json(response, 400, {
          error: "请上传 JPG、PNG 或 WebP 图片。"
        });
      }
      if (!hasAiKey()) {
        return json(response, 503, {
          error:
            "AI 识图服务尚未配置。可以改用名称搜索或手动录入。"
        });
      }
      const result = await callVisionIdentification(
        body.imageDataUrl,
        body.mode === "herb" ? "herb" : "medicine"
      );
      return json(response, 200, result);
    }

    if (shouldServeStatic) return serveStatic(request, response);
    return json(response, 404, { error: "Not found" });
  } catch (error) {
    console.error(error);
    return json(response, 500, { error: error?.message || "服务异常" });
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Zhiyao Youfang API listening on http://127.0.0.1:${port}`);
});

setInterval(() => {
  checkReminders().catch((error) => console.error("Reminder scan failed", error));
}, 30_000);
checkReminders().catch((error) => console.error("Reminder scan failed", error));
