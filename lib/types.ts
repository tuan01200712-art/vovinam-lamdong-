// Kiểu dữ liệu dùng chung giữa script import (Node) và trang web (Next.js).

export type BeltColor = "blue" | "yellow" | "red" | "white";

/** Một ô đẳng cấp trên thẻ: Lam đai, Lam đai I cấp, ... */
export type Rank = {
  /** Tên cấp, giữ nguyên như trên thẻ, ví dụ "Lam đai I cấp". */
  name: string;
  color: BeltColor;
  /** Số vạch cấp trên đai (0 = đai trơn). */
  stripes: number;
  /** "dd/mm/yyyy" nếu đọc được ngày, không thì giữ nguyên chữ trong Excel. */
  examDate: string | null;
  /** Số quyết định công nhận. */
  decisionNo: string | null;
  examiners: string[];
};

export type Student = {
  /** Mã ngẫu nhiên trong link QR: /hv/<slug>/. Không bao giờ đổi sau khi đã in QR. */
  slug: string;
  /** Số thẻ, ví dụ "123.26/TĐC". */
  cardNo: string | null;
  fullName: string;
  birthYear: number | null;
  unit: string | null;
  club: string | null;
  /** Đường dẫn ảnh trong /public, ví dụ "/photos/<slug>.webp". */
  photo: string | null;
  ranks: Rank[];
};

export type StudentsFile = {
  /** Thời điểm chạy import (ISO 8601). */
  generatedAt: string;
  students: Student[];
};

/**
 * Sổ đăng ký slug: tên file Excel → slug.
 * Chỉ thêm, không xoá, để QR đã in luôn trỏ đúng người kể cả khi file tạm vắng mặt.
 */
export type Registry = {
  entries: Record<string, { slug: string; firstImportedAt: string }>;
};

export function isAchieved(rank: Rank): boolean {
  return Boolean(rank.examDate || rank.decisionNo || rank.examiners.length);
}

/** Cấp cao nhất đã đạt, theo thứ tự các ô trên thẻ. */
export function currentRank(ranks: Rank[]): Rank | null {
  return ranks.findLast(isAchieved) ?? null;
}
