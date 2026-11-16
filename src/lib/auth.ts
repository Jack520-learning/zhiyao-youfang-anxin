export interface PasswordRecord {
  passwordHash: string;
  passwordSalt: string;
}

const APP_SALT = "zhiyao-youfang-password-viewer";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join(
    ""
  );
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(APP_SALT),
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptPassword(
  password: string,
  username: string
): Promise<string> {
  const key = await deriveKey(username);
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    enc.encode(password)
  );
  return `${bytesToHex(iv)}:${bytesToHex(new Uint8Array(encrypted))}`;
}

export async function decryptPassword(
  encrypted: string,
  username: string
): Promise<string> {
  const parts = encrypted.split(":");
  if (parts.length !== 2) throw new Error("密码加密数据格式错误");
  const [ivHex, cipherHex] = parts;
  const key = await deriveKey(username);
  const iv = hexToBytes(ivHex);
  const cipher = hexToBytes(cipherHex);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    cipher as BufferSource
  );
  return new TextDecoder().decode(decrypted);
}

export async function createPasswordRecord(
  password: string
): Promise<PasswordRecord> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const passwordSalt = bytesToHex(saltBytes);
  return {
    passwordSalt,
    passwordHash: await hashPassword(password, passwordSalt)
  };
}

export async function hashPassword(
  password: string,
  passwordSalt: string
): Promise<string> {
  const encoded = new TextEncoder().encode(`${passwordSalt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return bytesToHex(new Uint8Array(digest));
}

export async function verifyPassword(
  password: string,
  expectedHash: string,
  passwordSalt: string
): Promise<boolean> {
  return (await hashPassword(password, passwordSalt)) === expectedHash;
}
