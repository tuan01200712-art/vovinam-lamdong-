import { site, type PrivateField, type Visibility } from "./site";

const DOT = "•";

/** Che mọi chữ số trừ `keep` số cuối, giữ nguyên dấu cách/dấu chấm: "0912 345 678" → "•••• ••• 678". */
export function maskDigits(value: string, keep: number): string {
  const total = value.match(/\d/g)?.length ?? 0;
  // Quá ít chữ số thì che hết, tránh trường hợp "che" mà vẫn lộ toàn bộ.
  if (total <= keep) return value.replace(/\d/g, DOT);
  let seen = 0;
  return value.replace(/\d/g, (d) => (++seen > total - keep ? d : DOT));
}

/** Chỉ giữ hai cấp hành chính cuối: "Thôn 5, xã Tân Hà, tỉnh Lâm Đồng" → "•••, xã Tân Hà, tỉnh Lâm Đồng". */
export function maskAddress(value: string): string {
  const parts = value
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const keep = Math.min(2, parts.length - 1);
  return keep > 0 ? [DOT.repeat(3), ...parts.slice(-keep)].join(", ") : DOT.repeat(3);
}

const MASKERS: Record<PrivateField, (v: string) => string> = {
  bloodType: () => DOT.repeat(3),
  phone: (v) => maskDigits(v, 3),
  idNumber: (v) => maskDigits(v, 4),
  address: maskAddress,
};

export function publicValue(field: PrivateField, value: string | null): string | null {
  if (value == null) return null;
  const visibility: Visibility = site.privacy[field];
  if (visibility === "hide") return null;
  return visibility === "mask" ? MASKERS[field](value) : value;
}

export const isMasked = (value: string | null) => value?.includes(DOT) ?? false;
