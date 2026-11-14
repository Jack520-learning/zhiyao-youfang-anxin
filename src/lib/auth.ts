export interface PasswordRecord {
  passwordHash: string;
  passwordSalt: string;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join(
    ""
  );
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
