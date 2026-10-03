import { site, type PrivateField, type Visibility } from "./site";

const DOT = "•";
const HIDDEN = DOT.repeat(3);

/** Che mọi chữ số trừ `keep` số cuối, giữ nguyên dấu cách/dấu chấm: "0912 345 678" → "•••• ••• 678". */
export function maskDigits(value: string, keep: number): string {
  const total = value.match(/\d/g)?.length ?? 0;
  // Quá ít chữ số thì che hết, tránh trường hợp "che" mà vẫn lộ toàn bộ.
  if (total <= keep) return value.replace(/\d/g, DOT);
  let seen = 0;
  return value.replace(/\d/g, (d) => (++seen > total - keep ? d : DOT));
}

// Đơn vị hành chính cấp xã và cấp tỉnh (kể cả viết tắt "P.1", "TP. Đà Lạt").
const ADMIN_UNIT =
  /^(?:(?:xã|phường|thị\s*trấn|đặc\s*khu|thị\s*xã|huyện|quận|tỉnh|thành\s*phố)\s|(?:p|tt|tx|tp|q|h)\.\s*\S)/iu;
// Dưới cấp xã (thôn, tổ, số nhà, đường...): không bao giờ giữ lại.
const BELOW_COMMUNE =
  /\d|^(?:số|đường|phố|ngõ|ngách|hẻm|kiệt|tổ|thôn|ấp|bản|buôn|khu\s*phố|kp|xóm|khóm)(?:\s|\.|$)/iu;

/**
 * Chỉ giữ tối đa hai cấp hành chính cuối, và chỉ khi nhận ra chắc chắn:
 * "Thôn 5, xã Tân Hà, tỉnh Lâm Đồng" → "•••, xã Tân Hà, tỉnh Lâm Đồng".
 * Phần không nhận ra (đường, thôn, số điện thoại ghi kèm...) bị bỏ; không nhận ra gì thì che hết.
 */
export function maskAddress(value: string): string {
  const parts = value
    // Bỏ ghi chú kèm theo: "(SĐT nhà 0912...)", "- ĐT 0912..."
    .replace(/\([^)]*\)/gu, " ")
    .replace(/\s[-–]\s.*$/u, "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  const kept: string[] = [];
  for (let i = parts.length - 1; i >= 1 && kept.length < 2; i--) {
    const part = parts[i];
    // Phần cuối viết trần ("Lâm Đồng", "Đà Lạt") vẫn giữ nếu không giống địa chỉ chi tiết.
    const isBareProvince =
      i === parts.length - 1 && !BELOW_COMMUNE.test(part) && part.split(/\s+/).length <= 3;
    if (!ADMIN_UNIT.test(part) && !isBareProvince) break;
    if (/\d{5,}/.test(part)) break;
    kept.unshift(part);
  }
  return kept.length ? [HIDDEN, ...kept].join(", ") : HIDDEN;
}

const MASKERS: Record<PrivateField, (v: string) => string> = {
  bloodType: () => HIDDEN,
  phone: (v) => maskDigits(v, 3),
  // Không giữ số nào: 6 số đầu CCCD (mã tỉnh, giới tính, năm sinh) suy ra được từ chính trang này,
  // nên giữ 4 số cuối là chỉ còn 100 khả năng để đoán ra cả số.
  idNumber: (v) => maskDigits(v, 0),
  address: maskAddress,
};

export function publicValue(field: PrivateField, value: string | null): string | null {
  if (value == null) return null;
  const visibility: Visibility = site.privacy[field];
  if (visibility === "hide") return null;
  return visibility === "mask" ? MASKERS[field](value) : value;
}

export const isMasked = (value: string | null) => value?.includes(DOT) ?? false;
