// Mở các trường bị che bằng mã xem, ngay trên trình duyệt (Web Crypto).
// Phía import (scripts/lib/seal.ts) mã hoá bằng đúng thuật toán và tham số này.
import type { PrivateField } from "./site";
import type { SecretBlob } from "./types";

export type SecretValues = Partial<Record<PrivateField, string>>;

/** Trình duyệt không có Web Crypto: thường do mở trang qua http thay vì https. */
export class CryptoUnavailableError extends Error {}

/** Chuẩn hoá mã xem giống hệt nhau lúc import và trên trình duyệt: bỏ khoảng trắng đầu/cuối, Unicode NFC. */
export const normalizeViewCode = (code: string) => code.trim().normalize("NFC");

const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Ném lỗi nếu mã sai (AES-GCM không xác thực được). `slug` là dữ liệu xác thực kèm theo. */
export async function openSecret(blob: SecretBlob, code: string, slug: string): Promise<SecretValues> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new CryptoUnavailableError();
  const encoder = new TextEncoder();
  const baseKey = await subtle.importKey("raw", encoder.encode(normalizeViewCode(code)), "PBKDF2", false, [
    "deriveKey",
  ]);
  const key = await subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: fromBase64(blob.salt), iterations: blob.iter },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  const plain = await subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(blob.iv), additionalData: encoder.encode(slug) },
    key,
    fromBase64(blob.data),
  );
  return JSON.parse(new TextDecoder().decode(plain)) as SecretValues;
}
