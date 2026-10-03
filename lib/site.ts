export type Visibility = "show" | "mask" | "hide";
export type PrivateField = "bloodType" | "phone" | "idNumber" | "address";

/**
 * Thông tin cá nhân trong phần "Tài liệu" hiển thị thế nào trên trang công khai.
 * Ai cầm được thẻ (hoặc ảnh chụp thẻ) đều mở được trang, và phần lớn môn sinh là trẻ em.
 *   "show" hiện đầy đủ · "mask" che một phần · "hide" không đưa lên web
 * Áp dụng lúc chạy `npm run import`: giá trị gốc của trường "mask"/"hide"
 * không bao giờ được ghi vào data/students.json. Đổi xong phải chạy lại import.
 */
const privacy: Record<PrivateField, Visibility> = {
  bloodType: "show",
  /** "mask": giữ 3 số cuối, ví dụ "•••• ••• 678" */
  phone: "mask",
  /** "mask": giữ 4 số cuối, ví dụ "••••••••1234" */
  idNumber: "mask",
  /** "mask": chỉ giữ xã/phường và tỉnh, ví dụ "•••, xã Tân Hà, tỉnh Lâm Đồng" */
  address: "mask",
};

// Chữ cố định trên thẻ. Sửa ở đây nếu mẫu thẻ thay đổi.
export const site = {
  nationalTitle: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
  nationalMotto: "Độc lập - Tự do - Hạnh phúc",
  authority: "UBND TỈNH LÂM ĐỒNG",
  federation: "LIÊN ĐOÀN VOVINAM",
  cardTitle: "THẺ ĐẲNG CẤP",
  cardSubtitle: "VOVINAM - VIỆT VÕ ĐẠO",
  ranksTitle: "ĐẲNG CẤP MÔN SINH ĐẠT ĐƯỢC",
  footer: "Vovinam - Việt Võ Đạo tỉnh Lâm Đồng",
  logos: {
    federation: "/brand/logo-lien-doan.webp",
    vovinam: "/brand/logo-vovinam.webp",
  },

  privacy,
} as const;
