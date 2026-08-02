import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const SALT_LENGTH = 16;

function getKey(): Buffer {
  const keyHex = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error(
      "SETTINGS_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)"
    );
  }
  return Buffer.from(keyHex, "hex");
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decrypt(ciphertext: string): string {
  const key = getKey();
  const data = Buffer.from(ciphertext, "base64");
  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf8"
  );
}

export function encryptJson(obj: Record<string, unknown>): string {
  return encrypt(JSON.stringify(obj));
}

export function decryptJson<T = Record<string, unknown>>(ciphertext: string): T {
  return JSON.parse(decrypt(ciphertext)) as T;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}
