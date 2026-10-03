// Mã hoá giá trị đầy đủ của các trường bị che bằng mã xem (VIEW_CODE).
// Trình duyệt mở lại bằng lib/secret.ts với đúng thuật toán và tham số này.
import crypto from "node:crypto";

import type { SecretValues } from "../../lib/secret";
import type { SecretBlob } from "../../lib/types";

/** Đủ chậm để dò mã trên máy tính tốn kém, vẫn mở trong ~1 giây trên điện thoại. */
export const PBKDF2_ITERATIONS = 600_000;
export const MIN_CODE_LENGTH = 8;

export type SealKey = { key: Buffer; salt: Buffer };

/** Chỉ dẫn xuất khoá một lần cho cả lượt import (cùng một mã xem cho mọi thẻ). */
export function deriveSealKey(code: string): SealKey {
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(code.normalize("NFC"), salt, PBKDF2_ITERATIONS, 32, "sha256");
  return { key, salt };
}

export function seal({ key, salt }: SealKey, slug: string, values: SecretValues): SecretBlob {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  // Gắn bản mã với đúng trang của học viên này.
  cipher.setAAD(Buffer.from(slug, "utf8"));
  const data = Buffer.concat([
    cipher.update(JSON.stringify(values), "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return {
    alg: "PBKDF2-SHA256/AES-256-GCM",
    iter: PBKDF2_ITERATIONS,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    data: data.toString("base64"),
  };
}
