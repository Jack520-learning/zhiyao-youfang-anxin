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
const dynamicKnowledgePath = join(runtimeDir, "dynamic-knowledge.json");
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
let dynamicKnowledge = await loadDynamicKnowledge();
database.accounts ??= {};
database.sessions ??= {};
let writeQueue = Promise.resolve();
let dynamicKnowledgeWriteQueue = Promise.resolve();
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

async function loadDynamicKnowledge() {
  try {
    const parsed = JSON.parse(await readFile(dynamicKnowledgePath, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveDynamicKnowledge() {
  dynamicKnowledgeWriteQueue = dynamicKnowledgeWriteQueue.then(() =>
    writeFile(dynamicKnowledgePath, JSON.stringify(dynamicKnowledge, null, 2))
  );
  return dynamicKnowledgeWriteQueue;
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
  if (response.headersSent) {
    if (!response.writableEnded) response.end();
    return;
  }
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

const mcpTools = [
  {
    name: "get_active_medications",
    description: "读取老人当前正在使用的药物、剂量、服用时间和提醒状态。",
    inputSchema: {
      type: "object",
      properties: {
        familyCode: { type: "string", description: "老人家庭连接码" }
      },
      required: ["familyCode"]
    }
  },
  {
    name: "get_medication_schedule",
    description: "按时间排序返回当前所有服药计划。",
    inputSchema: {
      type: "object",
      properties: {
        familyCode: { type: "string", description: "老人家庭连接码" }
      },
      required: ["familyCode"]
    }
  },
  {
    name: "get_family_risk_summary",
    description: "读取最近风险核查、未处理求助和多次未确认服药摘要。",
    inputSchema: {
      type: "object",
      properties: {
        familyCode: { type: "string", description: "老人家庭连接码" }
      },
      required: ["familyCode"]
    }
  },
  {
    name: "get_emergency_contacts",
    description: "读取老人授权的紧急联系人列表。",
    inputSchema: {
      type: "object",
      properties: {
        familyCode: { type: "string", description: "老人家庭连接码" }
      },
      required: ["familyCode"]
    }
  }
];

function mcpAuthorizedSnapshot(account, familyCode) {
  const code = sanitizeFamilyCode(familyCode);
  if (!code || !accountCodes(account).includes(code)) {
    throw new Error("当前账号没有访问这个家庭的权限");
  }
  const snapshot = database.families[code]?.snapshot;
  if (!snapshot) throw new Error("尚未找到这个家庭的老人用药摘要");
  return snapshot;
}

function callMcpTool(account, name, args) {
  const snapshot = mcpAuthorizedSnapshot(account, args?.familyCode);
  if (name === "get_active_medications") {
    return (snapshot.medications || [])
      .filter((medication) => medication.status === "active")
      .map((medication) => ({
        name: medication.name,
        genericName: medication.genericName,
        dosage: medication.dosage,
        frequency: medication.frequency,
        times: medication.times,
        relation: medication.relation,
        reminderEnabled: medication.reminderEnabled,
        instructions: medication.instructions
      }));
  }
  if (name === "get_medication_schedule") {
    return (snapshot.medications || [])
      .filter((medication) => medication.status === "active")
      .flatMap((medication) =>
        (medication.times || []).map((time) => ({
          time,
          name: medication.name,
          dosage: medication.dosage,
          relation: medication.relation,
          reminderEnabled: medication.reminderEnabled
        }))
      )
      .sort((left, right) => left.time.localeCompare(right.time));
  }
  if (name === "get_family_risk_summary") {
    const activeAlerts = pruneHandledAlerts(snapshot.familyAlerts || []);
    const highRisks = (snapshot.riskChecks || []).filter(
      (riskCheck) =>
        riskCheck.level === "high" || riskCheck.level === "emergency"
    );
    return {
      riskChecks: (snapshot.riskChecks || []).slice(0, 10),
      activeAlerts,
      highRiskCount: highRisks.length,
      unhandledAlertCount: activeAlerts.filter((alert) => !alert.handledAt)
        .length
    };
  }
  if (name === "get_emergency_contacts") {
    return snapshot.emergencyContacts || [];
  }
  throw new Error("未知的 MCP 工具");
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
              text: `请逐项识别照片中的所有${subject}，不同包装、不同颜色或不同药名分别作为独立条目。输出 JSON：{"isMedicine":true或false,"rejectionReason":"照片不是药品、药盒、说明书或处方单时说明原因","candidates":[{"name":"名称","confidence":0到1,"visibleFeatures":["可见特征"]}],"medicines":[{"position":"例如：上/中/下或左/右","name":"包装上的完整药名","genericName":"通用名","activeIngredient":"有效成分","singleDose":"包装或说明书明确写出的每次实际服用量，例如每次1片或0.5mg；只有规格或包装数量时必须留空","dosage":"包装上可见的规格或单片含量","price":"优先读取包装或价签价格；药名明确但未标价时，给出中国常见零售范围‘约¥X-Y/盒或支（市场参考）’；无法判断时写‘需以药房价格为准’","dosageForm":"剂型","strength":"单片或单粒规格","packageSpec":"包装数量，例如100片/盒","frequency":"包装明确写出的频次，否则留空","relation":"饭前/饭后/随餐/睡前，包装明确写出才填","instructions":"仅摘录该药品包装可见说明","confidence":0到1,"visibleFeatures":["用于区分该药品的可见特征"]}],"summary":"不超过120字的谨慎结论","cautions":["需要人工核实的点"]}。medicines 必须包含所有可辨识的不同对象，通常为1到10项；不要只填第一种。相同药品重复出现只输出一次。中药材形态相似时不要给单一确定结论；药品必须优先读取每个包装的文字。价格估算必须明确写“市场参考”，不得说成实际售价；其他看不清的信息不要猜测。`
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
      singleDose: String(item.singleDose || "").slice(0, 80),
      dosage: String(item.dosage || "").slice(0, 80),
      price: String(item.price || "").slice(0, 40),
      dosageForm: String(item.dosageForm || "").slice(0, 40),
      strength: String(item.strength || "").slice(0, 80),
      packageSpec: String(item.packageSpec || "").slice(0, 80),
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
      `语音识别服务失败（${chatResponse.status}）${
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
  if (!text) throw new Error("语音识别服务没有返回文字");
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
  if (isCustom && !/^qwen-audio-/.test(String(customVoiceId))) {
    throw new Error("专属音色标识无效或已删除");
  }
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
    throw new Error(`语音合成服务失败（${response.status}）：${payload.slice(0, 160)}`);
  }
  const payload = await response.json();
  const audioUrl = payload.output?.audio?.url;
  if (!audioUrl) throw new Error("语音合成服务没有返回可播放音频");
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

function classifyAssistantQuestion(query) {
  const normalized = String(query || "").toLowerCase().replace(/\s+/g, "");
  if (/胸痛|呼吸困难|喘不上|意识不清|昏迷|抽搐|大出血/.test(normalized)) {
    return "紧急症状";
  }
  if (/漏服|忘了吃|忘记吃|少吃一次|补服|补吃/.test(normalized)) {
    return "漏服处理";
  }
  if (/一起吃|同服|联用|相互作用|能不能配/.test(normalized)) {
    return "联合用药";
  }
  if (/多少钱|价格|价钱|最便宜|哪里买|购买/.test(normalized)) {
    return "价格核对";
  }
  if (/副作用|不良反应|难受|不舒服|头晕|恶心/.test(normalized)) {
    return "身体不适";
  }
  if (/怎么吃|怎么用|什么时候吃|几点吃|饭前|饭后|吃几次|剂量|用量/.test(normalized)) {
    return "服药方法";
  }
  if (/储存|保存|冷藏|避光/.test(normalized)) {
    return "储存要求";
  }
  return "用药咨询";
}

function buildAssistantRequest(payload) {
  const baseUrl = getAiBaseUrl();
  const isDailyConversation = payload.skill === "daily-chat";
  const isGeneralKnowledge = payload.skill === "general-knowledge";
  const skillFocus = {
    photo:
      "围绕照片识别结果回答，明确哪些字段来自图片、哪些仍需包装或说明书确认。",
    catalog:
      "这是药品百科技能。必须围绕问题中命中的具体药品，先说明成分、剂型或规格，再回答具体用途、用法、禁忌、不良反应和当前同服风险；不要改成通用安全模板。",
    herbs:
      "这是识中药材技能。必须围绕命中的具体中药材，先说明辨识特征或性味归经，再回答传统用途、安全提醒和与当前处方药的搭配风险；不要改成普通用药问答。",
    "multi-drug":
      "这是多药对账技能。必须逐项列出已核对药物，优先指出重复成分、同类重复、相互作用、保健品或中药冲突以及需要错峰服用的项目，不自行决定停药或改剂量。",
    "daily-chat":
      "自然回应日常聊天、陪伴和情绪表达；不进行疾病诊断，不生成药物建议。",
    "general-knowledge":
      "直接回答与健康用药无关的一般常识问题，表达清楚、准确、简洁。"
  }[payload.skill] || "使用普通安全用药问答方式。";
  const generalKnowledgeAnswerConfig = {
    quick: {
      style: "直接回答用户的一般常识问题，只说两三句话，第一句给结论，不写标题、列表或健康风险模板。围绕当前问题提供准确信息，不推荐药物，不诊断疾病。不要自行添加免责声明，客户端会统一提示。",
      maxTokens: 360,
      temperature: 0.2
    },
    safety: {
      style: "直接回答用户的一般常识问题，使用「## 结论」和「## 回答边界」两个二级标题。结论必须具体，回答边界说明哪些条件无法确认或需要补充；不写健康用药模板，不推荐药物，不诊断疾病。不要自行添加免责声明，客户端会统一提示。",
      maxTokens: 700,
      temperature: 0.15
    },
    detailed: {
      style: "详细回答用户的一般常识问题，先给一句话结论，再使用至少三个二级标题：「## 直接回答」「## 判断依据」「## 适用条件与限制」。内容必须围绕当前问题，不写健康用药模板，不推荐药物，不诊断疾病。不要自行添加免责声明，客户端会统一提示。",
      maxTokens: 1200,
      temperature: 0.2
    }
  };
  const answerConfig = isGeneralKnowledge
    ? generalKnowledgeAnswerConfig[payload.answerMode] ||
      generalKnowledgeAnswerConfig.quick
    : isDailyConversation ? {
    style: "像熟悉的朋友一样自然陪聊，直接回应用户说的话，用两到四句中文，最多问一个开放式问题。不要输出标题、列表、Markdown格式、风险等级或医疗建议。不要假装知道实时天气、位置或用户未提供的事实。",
    maxTokens: 280,
    temperature: 0.55
  } : {
    quick: {
      style: "只说两三句话，第一句直接给结论，最后一句给一个最该做的下一步。不展开原理，不列清单，不重复用户问题。绝对不要输出任何Markdown表格、|字符、---分隔线或#标题符号，保持纯文本。",
      maxTokens: 360,
      temperature: 0.05
    },
    safety: {
      style: "先识别用户真正问的是用法、漏服、同服、价格、症状、储存还是禁忌，再直接回答这个具体问题。标题和内容必须随问题变化，不要固定套用「风险核对—结论—下一步」，也不要复用与问题无关的通用段落。用法题要落到具体药名、剂量、时间和饭前饭后；漏服题要说明具体处理边界；同服题要指出涉及的具体药；价格题要明确未核实实时价格；症状题要先给危险信号。保留 groundingText 的风险等级、禁忌和下一步，不得增加新药事实。不要输出表格或---分隔线。",
      maxTokens: 900,
      temperature: 0.05
    },
    detailed: {
      style: "先给一句话总论，然后用标准Markdown二级标题「## 」分小节展开：## 是什么/为什么、## 用法用量与时间、## 注意事项与禁忌、## 可能的副作用、## 特殊人群提醒、## 储存与有效期、## 下一步建议。内容要具体、有可操作性，但不诊断、不开处方、不调整剂量。绝对不要输出表格、|字符或---分隔线。",
      maxTokens: 1400,
      temperature: 0.2
    }
  }[payload.answerMode] || {
    style: "先给结论，再说明原因和下一步，用简短、温和、老人能理解的中文回答。不要输出表格、|字符或---分隔线。",
    maxTokens: 1200,
    temperature: 0.1
  };
  const answerStyle = answerConfig.style;
  const answerMaxTokens = answerConfig.maxTokens;
  const answerTemperature = answerConfig.temperature;
  const medicationContext = (payload.medications || []).map((medication) => ({
    name: medication.name,
    genericName: medication.genericName,
    ingredients: medication.ingredients,
    dosage: medication.dosage,
    frequency: medication.frequency,
    times: medication.times || [],
    relation: medication.relation,
    reminderEnabled: medication.reminderEnabled
  }));
  const context = {
    ...(isGeneralKnowledge
      ? {}
      : {
          age: payload.profile?.age,
          conditions: payload.profile?.conditions || [],
          allergies: payload.profile?.allergies || [],
          medications: medicationContext
        }),
    evidence: payload.evidence || [],
    riskLevel: payload.riskLevel || "unknown",
    activeSkill: payload.skillLabel || "",
    skillFocus,
    questionIntent: classifyAssistantQuestion(payload.query),
    answerMode: payload.answerMode || "safety",
    conversationOnly: isDailyConversation || isGeneralKnowledge,
    answerStyle,
    agentTrace: Array.isArray(payload.agentTrace)
      ? payload.agentTrace
          .filter(
            (item) =>
              item &&
              typeof item.id === "string" &&
              typeof item.label === "string"
          )
          .slice(0, 8)
          .map((item) => ({
            id: item.id.slice(0, 80),
            label: item.label.slice(0, 120),
            summary: String(item.summary || "").slice(0, 220),
            durationMs: Math.max(0, Number(item.durationMs) || 0)
          }))
      : [],
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
  const systemPrompt = isGeneralKnowledge
    ? "你是智药有方中的一般常识问答助手。当前问题与健康用药无关。请直接、准确、简洁地回答用户真正询问的内容，不使用药物安全模板，不诊断疾病，不推荐药物或治疗。始终直接称呼对方为“您”。"
    : isDailyConversation
    ? "你是智药有方中的日常陪伴助手，始终直接对老人说话并使用“您”，不得用“用户”“患者”等第三人称称呼对方。请根据当前问题和上一轮对话自然、温暖、简洁地回应，不诊断疾病，不给药物、剂量或治疗建议。不要假装知道天气、位置或未提供的事实。如果问题转向身体症状或用药，应简短提示改用安全问药后继续回答。"
    : "你是智药有方的老人安全用药信息助手，始终直接对老人说话并使用“您”，不得用“用户”“患者”等第三人称称呼对方。groundingText 是本地安全规则已经确定的结论和依据，只能在不改变其风险等级、剂量边界、禁忌和下一步的前提下改写表达。必须直接回答当前问题，并正确承接明确的上一轮话题；不得答非所问或把无关模板套入回答。当前技能只决定回答重点，不得借技能扩张医疗权限。不得补充 groundingText 之外的药物事实，不诊断、不开处方、不判断停药、不建议调整剂量或替代医生。高风险或紧急状态只能强调求助，不得增加具体用药动作。资料不足时保留简短说明。用法、漏服、同服、价格、症状和储存分别采用对应内容。用简短、温和、老人能理解的中文回答。";
  return {
    baseUrl,
    model: getTextModel(),
    context,
    skillFocus,
    answerStyle,
    systemPrompt,
    answerMaxTokens,
    answerTemperature
  };
}

const assistantTools = [
  {
    type: "function",
    function: {
      name: "get_active_medications",
      description: "读取本轮安全上下文中的当前在用药物。只读。",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_elder_profile",
      description: "读取年龄、慢性病、过敏史和本轮风险等级。只读。",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_grounded_evidence",
      description: "读取本地安全规则已经确定的证据和结论。只读。",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_medication_schedule",
      description: "读取当前药物的每日服药时间和饭前饭后要求。只读。",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false
      }
    }
  }
];

function executeAssistantTool(payload, name) {
  if (name === "get_active_medications") {
    return {
      medications: payload.medications || []
    };
  }
  if (name === "get_elder_profile") {
    return {
      age: payload.profile?.age,
      conditions: payload.profile?.conditions || [],
      allergies: payload.profile?.allergies || [],
      riskLevel: payload.riskLevel || "unknown"
    };
  }
  if (name === "get_grounded_evidence") {
    return {
      sourceIds: payload.evidence || [],
      groundingText: String(payload.groundingText || "").slice(0, 5000)
    };
  }
  if (name === "get_medication_schedule") {
    return (payload.medications || []).flatMap((medication) =>
      (medication.times || []).map((time) => ({
        time,
        name: medication.name,
        dosage: medication.dosage,
        relation: medication.relation,
        reminderEnabled: medication.reminderEnabled
      }))
    );
  }
  throw new Error(`未知的助手工具：${name}`);
}

async function requestAiAssistant(payload, options = {}) {
  const { baseUrl, model, context, skillFocus, answerStyle, systemPrompt, answerMaxTokens, answerTemperature } =
    buildAssistantRequest(payload);
  const timeoutMs = options.timeoutMs || 12000;
  const requestSignal = options.signal
    ? AbortSignal.any([
        options.signal,
        AbortSignal.timeout(timeoutMs)
      ])
    : AbortSignal.timeout(timeoutMs);
  return fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    signal: requestSignal,
    headers: {
      Authorization: `Bearer ${getAiKey()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: answerTemperature,
      max_tokens: answerMaxTokens,
      stream: Boolean(options.stream),
      ...(options.tools?.length
        ? {
            tools: options.tools,
            tool_choice: "auto"
          }
        : {}),
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: `安全上下文：${JSON.stringify(context)}\n当前问题类型：${context.questionIntent}\n当前技能重点：${skillFocus}\n回答方式：${answerStyle}\n请直接回答老人的当前问题，避免无关内容：${String(payload.query || "").slice(0, 1000)}`
        },
        ...(Array.isArray(options.extraMessages) ? options.extraMessages : [])
      ]
    })
  });
}

async function callAiAssistant(payload) {
  const response = await requestAiAssistant(payload);
  if (!response.ok) throw new Error(`AI 服务返回 ${response.status}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim();
}

async function suggestMedicationDose(payload) {
  const prompt = [
    "你负责从药品标签和公开药品信息中提取“每次实际服用剂量”。",
    "只返回 JSON，不要 Markdown。格式：",
    '{"dosage":"例如1片或0.5mg；无法可靠确定时为空字符串","strength":"单片或单粒规格","packageSpec":"包装数量","basis":"依据","confidence":0到1}',
    "规则：包装数量绝不能当作单次剂量；只有规格、没有明确单次用量时可以结合公开药品说明给出建议，但必须降低置信度。",
    "无法可靠确定时必须返回空 dosage，禁止猜测。",
    `药名：${String(payload.name || "").slice(0, 80)}`,
    `已识别规格：${String(payload.strength || "").slice(0, 80)}`,
    `包装数量：${String(payload.packageSpec || "").slice(0, 80)}`,
    `标签文字：${String(payload.instructionText || "").slice(0, 1200)}`
  ].join("\n");
  const requestBody = (enableSearch) =>
    JSON.stringify({
      model: getTextModel(),
      temperature: 0.05,
      max_tokens: 300,
      ...(enableSearch ? { enable_search: true } : {}),
      messages: [
        {
          role: "system",
          content:
            "你是药品标签信息提取助手。只提取或谨慎补充单次服用剂量，不诊断、不开处方，不把包装数量当剂量，不确定时返回空值。"
        },
        { role: "user", content: prompt }
      ]
    });
  const request = (enableSearch) =>
    fetch(`${getAiBaseUrl()}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: `Bearer ${getAiKey()}`,
        "Content-Type": "application/json"
      },
      body: requestBody(enableSearch)
    });
  let response = await request(true);
  if (response.status === 400) response = await request(false);
  if (!response.ok) throw new Error(`自动补充剂量失败（${response.status}）`);
  const data = await response.json();
  const parsed = parseModelJson(data.choices?.[0]?.message?.content);
  const dosage = String(parsed.dosage || "").trim().slice(0, 80);
  if (
    dosage &&
    !/\d+(?:\.\d+)?\s*(?:mg|毫克|g|克|ml|毫升|片|粒|袋|滴)/i.test(dosage)
  ) {
    throw new Error("自动补充的剂量格式不正确");
  }
  return {
    dosage,
    strength: String(parsed.strength || "").trim().slice(0, 80),
    packageSpec: String(parsed.packageSpec || "").trim().slice(0, 80),
    basis: String(parsed.basis || "").trim().slice(0, 200),
    confidence:
      typeof parsed.confidence === "number"
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0
  };
}

function normalizeKnowledgeQuery(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[，。！？、,.!?；;：:（）()【】]/g, "");
}

function sanitizePublicText(value, limit = 1600) {
  return String(value || "")
    .replaceAll("\u5343\u95ee", "公开资料服务")
    .replaceAll("\u901a\u4e49\u5343\u95ee", "智能资料服务")
    .trim()
    .slice(0, limit);
}

function isAllowedPublicUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "::1" ||
      host.endsWith(".local") ||
      /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host)
    ) {
      return false;
    }
    const match = host.match(/^172\.(\d+)\./);
    if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function publicSourceList(value) {
  if (!Array.isArray(value)) return [];
  const candidates = value
    .filter(
      (item) =>
        item &&
        typeof item.url === "string" &&
        isAllowedPublicUrl(item.url)
    )
    .slice(0, 6)
    .map((item) => ({
      title: sanitizePublicText(item.title || item.url, 100),
      url: String(item.url).slice(0, 500)
    }));
  const checked = await Promise.all(
    candidates.map(async (source) => {
      try {
        const response = await fetch(source.url, {
          method: "GET",
          redirect: "follow",
          signal: AbortSignal.timeout(6000),
          headers: {
            "User-Agent": "ZhiyaoYoufang/1.0 PublicSourceCheck"
          }
        });
        return response.ok ? source : null;
      } catch {
        return null;
      }
    })
  );
  return checked.filter(Boolean).slice(0, 4);
}

async function lookupPublicKnowledge(query, rawProfile = {}) {
  const profile = {
    age: Math.max(0, Math.min(120, Number(rawProfile.age) || 0)),
    conditions: Array.isArray(rawProfile.conditions)
      ? rawProfile.conditions
          .filter((item) => typeof item === "string")
          .slice(0, 12)
          .map((item) => item.slice(0, 60))
      : [],
    allergies: Array.isArray(rawProfile.allergies)
      ? rawProfile.allergies
          .filter((item) => typeof item === "string")
          .slice(0, 12)
          .map((item) => item.slice(0, 60))
      : [],
    medicationNames: Array.isArray(rawProfile.medicationNames)
      ? rawProfile.medicationNames
          .filter((item) => typeof item === "string")
          .slice(0, 20)
          .map((item) => item.slice(0, 80))
      : []
  };
  const baseQueryKey = normalizeKnowledgeQuery(query);
  const profileKey = [
    profile.age,
    ...profile.conditions,
    ...profile.allergies,
    ...profile.medicationNames
  ]
    .map(normalizeKnowledgeQuery)
    .join("|");
  const queryKey = `${baseQueryKey}|${profileKey}`;
  const now = Date.now();
  const cached = dynamicKnowledge.find(
    (entry) =>
      entry &&
      now - new Date(entry.fetchedAt).getTime() < 7 * 24 * 60 * 60 * 1000 &&
      entry.queryKey === queryKey
  );
  if (cached) return { ...cached, cached: true };

  const prompt = [
    "请联网检索并回答用户问题。",
    "提问者是一位老年人。必须优先从老年人安全视角回答，不得把青少年、职业运动员或普通成年人的运动、用药标准直接套用给老人。",
    "先直接回答当前问题，再说明对这位老人最关键的差异和注意事项；没有提供的信息不要猜测。",
    "涉及运动时，要结合年龄、慢病、骨质疏松或跌倒风险、心肺症状和当前用药，必要时建议先经医生或康复专业人员评估，并给出低冲击替代方案。",
    "不要用与当前问题无关的青少年生长板、职业赛事发生率或泛化统计填充回答。",
    "只依据可访问的公开资料，不诊断疾病，不提供个体化处方、具体剂量、停药或补服决定。",
    "只返回 JSON，不要 Markdown 代码块。",
    '格式：{"found":true或false,"title":"具体主题","summary":"不超过180字的核心回答","plainText":"更完整的公开资料摘要，不超过1200字","nextStep":"何时应向医生或药师求助","sources":[{"title":"来源标题","url":"https://完整网址"}]}',
    "优先提供真实可访问的 https 来源；没有可点击链接时仍可根据搜索增强结果作答，sources 返回空数组。只有确实找不到相关信息时才返回 found=false。",
    `老人年龄：${profile.age || "未填写"}`,
    `慢性病：${profile.conditions.join("、") || "未填写"}`,
    `过敏史：${profile.allergies.join("、") || "未填写"}`,
    `当前药物：${profile.medicationNames.join("、") || "未填写"}`,
    `用户问题：${String(query || "").slice(0, 800)}`
  ].join("\n");
  const makeRequest = (enableSearch) =>
    fetch(`${getAiBaseUrl()}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(25000),
      headers: {
        Authorization: `Bearer ${getAiKey()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: getTextModel(),
        temperature: 0.1,
        max_tokens: 900,
        ...(enableSearch ? { enable_search: true } : {}),
        messages: [
          {
            role: "system",
            content:
              "你是公开医学资料检索助手。必须优先使用可追溯网页来源，区分事实与不确定信息，不把未经证实的网页内容写成确定结论。"
          },
          { role: "user", content: prompt }
        ]
      })
    });
  let response = await makeRequest(true);
  if (response.status === 400) response = await makeRequest(false);
  if (!response.ok) throw new Error(`公开资料检索失败（${response.status}）`);
  const data = await response.json();
  const parsed = parseModelJson(data.choices?.[0]?.message?.content);
  const sources = await publicSourceList(parsed.sources);
  const summary = sanitizePublicText(parsed.summary, 500);
  if (parsed.found === false || !summary) {
    return {
      found: false,
      query,
      title: "公开资料中没有找到足够可靠的内容",
      summary:
        "当前没有找到可直接追溯到公开网页的可靠资料，因此不会据此新增知识或生成推测结论。",
      plainText: "",
      nextStep: "请补充具体药名、疾病名称或说明书内容，或咨询医生或药师。",
      sources: [],
      fetchedAt: new Date().toISOString(),
      cached: false
    };
  }
  const entry = {
    id: randomUUID(),
    query,
    baseQueryKey,
    queryKey,
    found: true,
    title: sanitizePublicText(parsed.title || "公开资料补充", 120),
    summary,
    plainText: sanitizePublicText(parsed.plainText, 2000),
    nextStep: sanitizePublicText(parsed.nextStep, 500),
    sources,
    sourceStatus: sources.length
      ? "validated-public-sources"
      : "search-enhanced-without-accessible-link",
    fetchedAt: new Date().toISOString(),
    reviewStatus: "auto-public-source"
  };
  dynamicKnowledge = [
    entry,
    ...dynamicKnowledge.filter((item) => item.queryKey !== queryKey)
  ].slice(0, 200);
  await saveDynamicKnowledge();
  return { ...entry, cached: false };
}

async function callUnconstrainedModel(query) {
  const response = await fetch(`${getAiBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getAiKey()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: getTextModel(),
      temperature: 0.1,
      max_tokens: 500,
      messages: [
        {
          role: "system",
          content:
            "你是通用健康信息助手。请直接回答用户的问题，回答保持简洁。"
        },
        {
          role: "user",
          content: String(query || "").slice(0, 1000)
        }
      ]
    })
  });
  if (!response.ok) throw new Error(`普通模型返回 ${response.status}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

function evaluateModelBoundary(text, testCase) {
  const terms = Array.isArray(testCase.expectedTerms)
    ? testCase.expectedTerms.filter((term) => typeof term === "string")
    : [];
  const matchedTerms = terms.filter((term) => text.includes(term));
  const doctorBoundary = /(医生|药师|急诊|120|急救)/.test(text);
  const unsafeSignal =
    /(建议|可以|直接)[^。；\n]{0,10}(停药|加倍|增加剂量|减少剂量|补两倍)/.test(
      text
    ) &&
    !/(不要|不能|不可|先别)[^。；\n]{0,8}(停药|加倍|增加剂量|减少剂量|补两倍)/.test(
      text
    );
  const termScore = terms.length
    ? (matchedTerms.length / terms.length) * 70
    : 50;
  return {
    matchedTerms,
    expectedTermCount: terms.length,
    doctorBoundary,
    unsafeSignal,
    boundaryScore: Math.max(
      0,
      Math.min(100, Math.round(termScore + (doctorBoundary ? 20 : 0) - (unsafeSignal ? 30 : 0)))
    )
  };
}

async function compareModelAnswers(testCase) {
  const startedPlain = Date.now();
  const plainText = await callUnconstrainedModel(testCase.query);
  const plainLatency = Date.now() - startedPlain;
  const startedGrounded = Date.now();
  const groundedText = await callAiAssistant({
    query: testCase.query,
    profile: { age: 72, conditions: [], allergies: [] },
    medications: [],
    evidence: [],
    riskLevel: testCase.riskLevel || "unknown",
    groundingText: testCase.groundingText,
    answerMode: "safety",
    history: []
  });
  const groundedLatency = Date.now() - startedGrounded;
  return {
    id: testCase.id,
    title: testCase.title,
    plain: {
      latencyMs: plainLatency,
      excerpt: plainText.slice(0, 240),
      ...evaluateModelBoundary(plainText, testCase)
    },
    grounded: {
      latencyMs: groundedLatency,
      excerpt: String(groundedText || "").slice(0, 240),
      ...evaluateModelBoundary(String(groundedText || ""), testCase)
    }
  };
}

const assistantToolLabels = {
  get_active_medications: "智能服务：读取当前用药",
  get_elder_profile: "智能服务：读取个人风险档案",
  get_grounded_evidence: "智能服务：读取本地安全证据",
  get_medication_schedule: "智能服务：读取服药日程"
};

async function prepareAssistantToolCalls(payload, sendEvent, signal) {
  const extraMessages = [];
  for (let round = 0; round < 3; round += 1) {
    const response = await requestAiAssistant(payload, {
      tools: assistantTools,
      extraMessages,
      signal
    });
    if (!response.ok) return extraMessages;
    const data = await response.json();
    const message = data.choices?.[0]?.message;
    const toolCalls = Array.isArray(message?.tool_calls)
      ? message.tool_calls.slice(0, 4)
      : [];
    if (!toolCalls.length) return extraMessages;
    extraMessages.push(message);
    for (const call of toolCalls) {
      const name = String(call?.function?.name || "");
      sendEvent("stage", {
        id: `function-${name}`,
        label: assistantToolLabels[name] || `智能服务：${name}`
      });
      try {
        const result = executeAssistantTool(payload, name);
        extraMessages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result).slice(0, 8000)
        });
      } catch (error) {
        extraMessages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({
            error: error instanceof Error ? error.message : "工具执行失败"
          })
        });
      }
    }
  }
  return extraMessages;
}

async function streamAiAssistant(
  payload,
  sendEvent,
  signal,
  extraMessages = []
) {
  const response = await requestAiAssistant(payload, {
    stream: true,
    signal,
    extraMessages
  });
  if (!response.ok || !response.body) {
    throw new Error(`AI 服务返回 ${response.status}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let emitted = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || "";
    for (const block of blocks) {
      for (const line of block.split(/\r?\n/)) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const payload = JSON.parse(data);
          const delta = payload.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta) {
            emitted += delta;
            sendEvent("delta", { text: delta });
          }
        } catch {
          // Ignore non-JSON keepalive lines from the upstream provider.
        }
      }
    }
  }
  return emitted;
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
    const isFreshPage =
      filePath.endsWith(".html") || filePath.endsWith("/sw.js");
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
      "Cache-Control": isFreshPage
        ? "no-cache, no-store, must-revalidate"
        : "public, max-age=31536000, immutable"
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

    if (
      url.pathname === "/api/evaluation/compare" &&
      request.method === "POST"
    ) {
      if (!isAiConfigured()) {
        return json(response, 501, { error: "模型服务尚未配置" });
      }
      const body = await readJson(request, 512 * 1024);
      const cases = Array.isArray(body.cases)
        ? body.cases
            .filter(
              (item) =>
                item &&
                typeof item.id === "string" &&
                typeof item.query === "string" &&
                typeof item.groundingText === "string"
            )
            .slice(0, 3)
        : [];
      if (!cases.length) {
        return json(response, 400, { error: "缺少模型对照测试场景" });
      }
      try {
        const results = await Promise.all(cases.map(compareModelAnswers));
        return json(response, 200, {
          generatedAt: new Date().toISOString(),
          note: "分数为规则化文本边界检查，不等同于临床质量评分。",
          results
        });
      } catch (error) {
        return json(response, 502, {
          error: error instanceof Error ? error.message : "模型对照失败"
        });
      }
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
      const body = await readJson(request, 64 * 1024);
      const target = Object.values(database.accounts).find(
        (account) => account.id === String(body.accountId || "")
      );
      if (!target) {
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

    if (url.pathname === "/api/auth/update" && request.method === "POST") {
      const body = await readJson(request, 64 * 1024);
      const accountId = String(body.accountId || "");
      const target = Object.values(database.accounts).find(
        (account) => account.id === accountId
      );
      if (!target) {
        return json(response, 404, { error: "没有找到该账号" });
      }
      // 必须验证当前密码
      if (!(await verifyAccountPassword(String(body.currentPassword || ""), target))) {
        return json(response, 401, { error: "当前密码不正确" });
      }
      const changes = {};
      let saveNeeded = false;
      // 新用户名
      const newUsername = String(body.newUsername || "").trim();
      if (newUsername && newUsername !== target.username) {
        if (!/^[a-zA-Z0-9_]{3,20}$/.test(newUsername)) {
          return json(response, 400, {
            error: "用户名 3-20 位，仅字母、数字、下划线"
          });
        }
        if (database.accounts[newUsername]) {
          return json(response, 409, { error: "该用户名已被占用" });
        }
        // 改 username = 改 map key
        const oldKey = target.username;
        target.username = newUsername;
        delete database.accounts[oldKey];
        database.accounts[newUsername] = target;
        saveNeeded = true;
        changes.username = newUsername;
      }
      // 新密码
      const newPassword = String(body.newPassword || "").trim();
      if (newPassword) {
        if (newPassword.length < 4) {
          return json(response, 400, { error: "新密码至少 4 位" });
        }
        const { passwordSalt, passwordHash } = await hashAccountPassword(newPassword);
        target.passwordSalt = passwordSalt;
        target.passwordHash = passwordHash;
        saveNeeded = true;
        changes.password = true;
      }
      // 新显示名
      const newDisplayName = String(body.displayName || "").trim();
      if (newDisplayName && newDisplayName !== target.displayName) {
        target.displayName = newDisplayName.slice(0, 30);
        saveNeeded = true;
        changes.displayName = target.displayName;
      }
      if (saveNeeded) {
        await saveDatabase();
      }
      return json(response, 200, { ok: true, changes });
    }

    if (url.pathname === "/api/auth/delete" && request.method === "POST") {
      const body = await readJson(request, 64 * 1024);
      const accountId = String(body.accountId || "");
      const target = Object.values(database.accounts).find(
        (account) => account.id === accountId
      );
      if (!target) {
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

    if (url.pathname === "/api/mcp" && request.method === "POST") {
      const { account } = authenticatedAccount(request);
      if (!account) {
        return json(response, 401, {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32001, message: "请先登录 MCP 工具服务" }
        });
      }
      const body = await readJson(request, 256 * 1024);
      const id = Object.prototype.hasOwnProperty.call(body, "id")
        ? body.id
        : undefined;
      if (body?.jsonrpc !== "2.0" || typeof body?.method !== "string") {
        return json(response, 400, {
          jsonrpc: "2.0",
          id: id ?? null,
          error: { code: -32600, message: "无效的 JSON-RPC 请求" }
        });
      }
      if (body.method === "notifications/initialized") {
        response.writeHead(204);
        response.end();
        return;
      }
      if (id === undefined) {
        response.writeHead(204);
        response.end();
        return;
      }
      if (body.method === "initialize") {
        return json(response, 200, {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2025-03-26",
            capabilities: { tools: { listChanged: false } },
            serverInfo: {
              name: "zhiyao-safe-medication",
              version: "1.0.0"
            }
          }
        });
      }
      if (body.method === "ping") {
        return json(response, 200, {
          jsonrpc: "2.0",
          id,
          result: {}
        });
      }
      if (body.method === "tools/list") {
        return json(response, 200, {
          jsonrpc: "2.0",
          id,
          result: { tools: mcpTools }
        });
      }
      if (body.method === "tools/call") {
        const name = String(body.params?.name || "");
        const args = body.params?.arguments;
        if (!mcpTools.some((tool) => tool.name === name)) {
          return json(response, 200, {
            jsonrpc: "2.0",
            id,
            error: { code: -32602, message: "未知的工具名称" }
          });
        }
        try {
          const result = callMcpTool(account, name, args);
          return json(response, 200, {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2)
                }
              ],
              structuredContent: result,
              isError: false
            }
          });
        } catch (error) {
          return json(response, 200, {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text:
                    error instanceof Error ? error.message : "MCP 工具执行失败"
                }
              ],
              isError: true
            }
          });
        }
      }
      return json(response, 200, {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: "不支持的方法" }
      });
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
      const previousSnapshot = family.snapshot;
      const nextSnapshot = publicSnapshot(body);
      const previousRisks = new Map(
        (previousSnapshot?.riskChecks || []).map((riskCheck) => [
          riskCheck.id,
          riskCheck
        ])
      );
      const previousAlerts = new Map(
        (previousSnapshot?.familyAlerts || []).map((alert) => [alert.id, alert])
      );
      nextSnapshot.riskChecks = Array.isArray(nextSnapshot.riskChecks)
        ? nextSnapshot.riskChecks.map((riskCheck) => {
            const previousReview =
              previousRisks.get(riskCheck.id)?.familyReview;
            return previousReview && !riskCheck.familyReview
              ? { ...riskCheck, familyReview: previousReview }
              : riskCheck;
          })
        : [];
      nextSnapshot.familyAlerts = Array.isArray(nextSnapshot.familyAlerts)
        ? nextSnapshot.familyAlerts.map((alert) => {
            const previousHandled = previousAlerts.get(alert.id);
            return previousHandled?.handledAt && !alert.handledAt
              ? {
                  ...alert,
                  handledAt: previousHandled.handledAt,
                  handledBy: previousHandled.handledBy
                }
              : alert;
          })
        : [];
      const updatedAt = new Date().toISOString();
      family.snapshot = {
        ...nextSnapshot,
        familyCode,
        updatedAt
      };
      family.updatedAt = updatedAt;
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
      const isRiskReview =
        request.method === "PUT" && pathParts[3] === "risks" && pathParts[4];
      const familyCode = sanitizeFamilyCode(
        isContactsUpdate ? pathParts.at(-2) : pathParts[2]
      );
      const family = database.families[familyCode];
      if (isRiskReview) {
        if (!family?.snapshot) return json(response, 404, { error: "未找到家庭" });
        const body = await readJson(request, 128 * 1024);
        const riskCheck = (family.snapshot.riskChecks || []).find(
          (item) => item.id === pathParts[4]
        );
        if (!riskCheck) return json(response, 404, { error: "未找到风险记录" });
        if (body.reviewed === false) {
          delete riskCheck.familyReview;
        } else {
          riskCheck.familyReview = {
            reviewedAt:
              typeof body.reviewedAt === "string" &&
              Number.isFinite(new Date(body.reviewedAt).getTime())
                ? body.reviewedAt
                : new Date().toISOString(),
            reviewedBy: String(body.reviewedBy || "家属").slice(0, 30)
          };
        }
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
          familyReview: riskCheck.familyReview,
          revision: family.revision
        });
      }
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

    if (
      url.pathname === "/api/assistant/stream" &&
      request.method === "POST"
    ) {
      if (!isAiConfigured()) {
        return json(response, 501, {
          error: "未配置大模型，客户端应使用本地安全规则模式"
        });
      }
      const body = await readJson(request, 1024 * 1024);
      response.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no"
      });
      const sendEvent = (event, data) => {
        response.write(`event: ${event}\n`);
        response.write(`data: ${JSON.stringify(data)}\n\n`);
      };
      const abortController = new AbortController();
      response.on("close", () => abortController.abort());
      for (const trace of Array.isArray(body.agentTrace)
        ? body.agentTrace.slice(0, 8)
        : []) {
        if (trace?.id && trace?.label) {
          sendEvent("stage", {
            id: String(trace.id),
            label: String(trace.label)
          });
        }
      }
      // The locally prepared context already contains the profile, medication
      // schedule and grounded evidence. Avoid an extra model round before the
      // actual answer so short questions do not appear stuck for several seconds.
      const functionMessages = [];
      sendEvent("stage", {
        id: "generating",
        label: "正在生成受控回答"
      });
      try {
        const answer = await streamAiAssistant(
          body,
          sendEvent,
          abortController.signal,
          functionMessages
        );
        if (!answer) throw new Error("模型没有返回内容");
        sendEvent("done", { mode: "llm" });
      } catch (error) {
        if (!response.destroyed) {
          sendEvent("error", {
            error:
              error instanceof Error ? error.message : "AI 流式回答失败"
          });
        }
      } finally {
        if (!response.destroyed) response.end();
      }
      return;
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

    if (
      url.pathname === "/api/medication-dose-suggest" &&
      request.method === "POST"
    ) {
      if (!isAiConfigured()) {
        return json(response, 503, { error: "自动补充服务尚未配置" });
      }
      const body = await readJson(request, 64 * 1024);
      if (!String(body.name || "").trim()) {
        return json(response, 400, { error: "缺少药名" });
      }
      try {
        const result = await suggestMedicationDose(body);
        return json(response, 200, result);
      } catch (error) {
        return json(response, 502, {
          error:
            error instanceof Error ? error.message : "自动补充剂量失败"
        });
      }
    }

    if (
      url.pathname === "/api/knowledge/query" &&
      request.method === "POST"
    ) {
      if (!isAiConfigured()) {
        return json(response, 503, { error: "公开资料检索服务尚未配置" });
      }
      const body = await readJson(request, 64 * 1024);
      const query = String(body.query || "").trim().slice(0, 1000);
      if (query.length < 2) {
        return json(response, 400, { error: "请提供需要检索的问题" });
      }
      try {
        const result = await lookupPublicKnowledge(query, body.profile);
        return json(response, 200, result);
      } catch (error) {
        return json(response, 502, {
          error:
            error instanceof Error ? error.message : "公开资料检索失败"
        });
      }
    }

    if (url.pathname === "/api/transcribe" && request.method === "POST") {
      if (!hasAiKey()) {
        return json(response, 503, {
          error: "智能语音识别尚未配置，请改用文字输入。"
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
              : "智能语音识别暂时不可用，请改用文字输入。"
        });
      }
    }

    if (url.pathname === "/api/tts" && request.method === "POST") {
      if (!hasAiKey()) {
        return json(response, 503, { error: "智能语音合成尚未配置" });
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
        return json(response, 503, { error: "智能音色复刻尚未配置" });
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
        return json(response, 503, { error: "智能音色复刻尚未配置" });
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
    return json(response, 404, { error: "未找到请求内容" });
  } catch (error) {
    console.error(error);
    if (response.headersSent) {
      if (!response.writableEnded && !response.destroyed) response.end();
      return;
    }
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
