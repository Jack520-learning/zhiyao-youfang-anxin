import { createServer } from "node:http";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
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
  version: 1,
  families: {},
  sentReminders: {}
};

let database = await loadDatabase();
let writeQueue = Promise.resolve();

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
  `mailto:${process.env.VAPID_CONTACT || "demo@example.com"}`,
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

function chinaTimeParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
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
  const current = chinaTimeParts();
  let changed = false;
  for (const [familyCode, family] of Object.entries(database.families)) {
    const snapshot = family.snapshot;
    if (!snapshot?.consent) continue;
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
            "你是谨慎的图文识别器。只根据照片中可见的形态或文字提出候选名称，不诊断、不推荐剂量、不提供处方。看不清时降低置信度并明确说明。必须输出 JSON。"
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `请识别照片中的${subject}。输出 JSON：{"candidates":[{"name":"名称","confidence":0到1,"visibleFeatures":["可见特征"]}],"summary":"不超过120字的谨慎结论","cautions":["需要人工核实的点"]}。中药材形态相似时不要给单一确定结论；药品必须优先读取包装文字。`
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
  return {
    candidates: Array.isArray(parsed.candidates)
      ? parsed.candidates
          .filter((item) => item && typeof item.name === "string")
          .slice(0, 5)
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
          }))
      : [],
    summary:
      typeof parsed.summary === "string" ? parsed.summary.slice(0, 300) : "",
    cautions: Array.isArray(parsed.cautions)
      ? parsed.cautions.filter((value) => typeof value === "string").slice(0, 5)
      : [],
    mode: "live"
  };
}

async function callAiAssistant(payload) {
  const baseUrl = getAiBaseUrl();
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
    evidence: payload.evidence || []
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
      messages: [
        {
          role: "system",
          content:
            "你是老人安全用药信息助手。只根据提供的当前药物和证据回答；不诊断、不开处方、不判断停药、不建议调整剂量或替代医生。先给结论，再给下一步。资料不足时明确说资料不足。高危问题时不要给具体用药动作，只建议联系医生或药师。不得忽略当前全部药物。用简短、温和、老人能理解的中文回答。"
        },
        {
          role: "user",
          content: `安全上下文：${JSON.stringify(context)}\n用户问题：${String(payload.query || "").slice(0, 1000)}`
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
      family.snapshot.familyAlerts = [
        alert,
        ...(family.snapshot.familyAlerts || [])
      ].slice(0, 20);
      family.snapshot.updatedAt = alert.createdAt;
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
        family.snapshot.familyAlerts = [
          alert,
          ...(family.snapshot.familyAlerts || [])
        ].slice(0, 20);
        family.snapshot.updatedAt = alert.createdAt;
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
      return json(response, 200, { revision: family.revision });
    }

    if (url.pathname.startsWith("/api/family/")) {
      const familyCode = sanitizeFamilyCode(url.pathname.split("/").pop());
      const family = database.families[familyCode];
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
            "AI 识图服务尚未配置。可以按名称搜索中药材，或使用页面中的示例。"
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
