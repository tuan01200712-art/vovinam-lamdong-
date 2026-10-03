// Kiểu dữ liệu dùng chung giữa script import (Node) và trang web (Next.js).

export type BeltColor = "blue" | "yellow" | "red" | "white";

/** Một cấp đai: khung "Công nhận" trên mặt thẻ + mục "Cập ... Đai" trong phần "Tài liệu". */
export type Rank = {
  /** Tên cấp, giữ nguyên như trên thẻ, ví dụ "Lam đai I cấp". */
  name: string;
  color: BeltColor;
  /** Số vạch cấp trên đai (0 = đai trơn). */
  stripes: number;

  // --- Mặt thẻ, khung "Công nhận" ---
  /** "dd/mm/yyyy" nếu đọc được ngày, không thì giữ nguyên chữ trong Excel. */
  examDate: string | null;
  /** Số QĐ CN ghi trên thẻ. */
  decisionNo: string | null;
  examiners: string[];

  // --- Phần "Tài liệu", mục "Cập ... Đai" ---
  /** a. Kế hoạch kiểm tra */
  plan: string | null;
  testDate: string | null;
  testPlace: string | null;
  /** b. Quyết định giám khảo */
  examinerDecision: string | null;
  /** c. Quyết định công nhận */
  recognitionDecision: string | null;
  /** d. Huấn luyện viên trực tiếp giảng dạy */
  coach: string | null;
};

export type Signer = {
  /** "TM. BAN CHẤP HÀNH" */
  onBehalfOf: string | null;
  /** "CHỦ TỊCH" */
  role: string | null;
  name: string | null;
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

  // --- Phần "Tài liệu" ---
  trainingSince: string | null;
  /**
   * Các trường cá nhân dưới đây đã được che/ẩn lúc import theo `site.privacy`,
   * nên giá trị lưu ở đây chính là giá trị hiển thị công khai.
   */
  bloodType: string | null;
  address: string | null;
  idNumber: string | null;
  phone: string | null;
  achievements: string[];

  /**
   * Giá trị đầy đủ của các trường đang bị che, đã mã hoá bằng mã xem (VIEW_CODE).
   * Trang chỉ giải mã được trên trình duyệt khi người xem nhập đúng mã. null nếu không có gì để mở.
   */
  secret: SecretBlob | null;

  // --- Khối ký trên mặt thẻ ---
  /** "Lâm Đồng, ngày 12 tháng 9 năm 2026", hoặc "Lâm Đồng, năm 2026" nếu chưa điền ngày. */
  issuedAt: string | null;
  signer: Signer | null;
};

/** PBKDF2-SHA256 → AES-256-GCM. Các trường nhị phân mã hoá base64; `data` = bản mã + tag 16 byte. */
export type SecretBlob = {
  alg: "PBKDF2-SHA256/AES-256-GCM";
  iter: number;
  salt: string;
  iv: string;
  data: string;
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
  return Boolean(
    rank.examDate || rank.decisionNo || rank.examiners.length || rank.recognitionDecision,
  );
}

/** Cấp cao nhất đã đạt, theo thứ tự các ô trên thẻ. */
export function currentRank(ranks: Rank[]): Rank | null {
  return ranks.findLast(isAchieved) ?? null;
}
