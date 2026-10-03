/** Chuẩn hoá chuỗi: Unicode NFC (Unikey "tổ hợp" → "dựng sẵn"), gộp khoảng trắng. */
export function cleanText(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[   ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Chuỗi chấm/gạch để chừa chỗ điền tay: "…………", "......", "____".
const FILLER_RUN = /(?:[.…_]{2,}|…)+/u;

/** Bỏ phần chấm chừa chỗ ở hai đầu; trả null nếu ô coi như chưa điền. */
export function valueOrNull(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = cleanText(s)
    .replace(new RegExp(`^(?:\\s|:|${FILLER_RUN.source})+`, "u"), "")
    .replace(new RegExp(`(?:\\s|${FILLER_RUN.source})+$`, "u"), "")
    .trim();
  return /^[\s.…_\-–—:]*$/u.test(t) ? null : t;
}

/** "20/9/2026", "20-09-2026", "20.9.2026" → "20/09/2026". Không đọc được → null. */
export function parseDateVi(s: string): string | null {
  const m = s.match(/^(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{4})$/);
  if (!m) return null;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

export function formatDateUtc(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
