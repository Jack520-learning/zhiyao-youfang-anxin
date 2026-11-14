import type { CloudSnapshot, EmergencyContact } from "../types";

export async function sendConcernAlert(input: {
  familyCode: string;
  elderName: string;
  message: string;
}): Promise<void> {
  const response = await fetch("/api/concern", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) throw new Error("家属提醒发送失败");
}

export async function syncCloudSnapshot(snapshot: CloudSnapshot): Promise<number> {
  const response = await fetch("/api/sync", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(snapshot)
  });
  if (!response.ok) {
    throw new Error(`同步失败：${response.status}`);
  }
  const payload = (await response.json()) as { revision: number };
  return payload.revision;
}

export async function fetchFamilySnapshot(
  familyCode: string
): Promise<CloudSnapshot | null> {
  const response = await fetch(
    `/api/family/${encodeURIComponent(familyCode.toUpperCase())}`
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`读取失败：${response.status}`);
  return (await response.json()) as CloudSnapshot;
}

export async function deleteCloudFamily(familyCode: string): Promise<void> {
  const response = await fetch(
    `/api/family/${encodeURIComponent(familyCode.toUpperCase())}`,
    { method: "DELETE" }
  );
  if (!response.ok && response.status !== 404) {
    throw new Error(`云端删除失败：${response.status}`);
  }
}

export async function updateFamilyEmergencyContacts(
  familyCode: string,
  contacts: EmergencyContact[]
): Promise<void> {
  const response = await fetch(
    `/api/family/${encodeURIComponent(familyCode.toUpperCase())}/contacts`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contacts })
    }
  );
  if (!response.ok) throw new Error(`联系人同步失败：${response.status}`);
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replaceAll("-", "+")
    .replaceAll("_", "/");
  const rawData = window.atob(base64);
  const bytes = new Uint8Array(rawData.length);
  for (let index = 0; index < rawData.length; index += 1) {
    bytes[index] = rawData.charCodeAt(index);
  }
  return bytes.buffer;
}

export async function subscribeToPush(
  familyCode: string,
  role: "elder" | "family"
): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;
  const registration = await navigator.serviceWorker.ready;
  const keyResponse = await fetch("/api/push/public-key");
  if (!keyResponse.ok) return false;
  const { publicKey } = (await keyResponse.json()) as { publicKey: string };
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    }));
  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      familyCode: familyCode.toUpperCase(),
      role,
      subscription: subscription.toJSON()
    })
  });
  return response.ok;
}
