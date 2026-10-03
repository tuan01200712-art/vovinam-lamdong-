# QRProfile: Thẻ đẳng cấp Vovinam điện tử

Quét mã QR trên thẻ đẳng cấp → mở trang thông tin môn sinh trên điện thoại.

```
input/*.xlsx (mỗi học viên 1 file, chung mẫu thẻ)
   │  npm run import
   ├─► data/students.json      thông tin trên thẻ (không có phần "Tài liệu")
   ├─► data/registry.json      tên file → mã QR cố định
   ├─► public/photos/*.webp    ảnh 3x4 đã nén (~50 KB), đã xoá EXIF/GPS
   └─► output/kiem-tra.html    trang soát lỗi, chỉ xem trên máy
   │  npm run qr
   ├─► output/the-co-qr/*.xlsx bản sao file thẻ, QR đã nằm ở ô "MQR" → in luôn
   └─► output/qr/*.png + danh-sach.csv
   │  git push
   └─► Vercel build → https://<tên-miền>/hv/<mã>/
```

Công nghệ: Next.js (App Router, xuất web tĩnh), Tailwind CSS, shadcn/ui. Không cần database.

## ⚠ Trước khi import dữ liệu thật

- **Chuyển repo sang Private** (GitHub → Settings → General → Danger Zone → Change visibility).
  `data/` và `public/photos/` chứa họ tên và ảnh học viên (phần lớn là trẻ em) và **sẽ được commit**.
- `input/` (file Excel gốc) và `output/` (QR, trang kiểm tra) nằm trong `.gitignore`, không bao giờ được commit.

## Cài đặt

```bash
npm install
npm run dev        # xem thử: http://localhost:3000/hv/demo/
```

## Quy trình mỗi lần cập nhật

1. Copy các file thẻ `.xlsx` vào thư mục `input/`.
2. `npm run import`, rồi mở `output/kiem-tra.html` để soát xem **ảnh có đúng người không**.
   File nào có cảnh báo sẽ được viền cam và xếp lên đầu.
3. Lần đầu tiên, hoặc khi có học viên mới, tạo QR:
   ```bash
   cp .env.example .env      # sửa SITE_URL thành tên miền thật
   npm run qr
   ```
   In các file trong `output/the-co-qr/` như mọi khi.
4. `git add data public/photos && git commit -m "Cập nhật dữ liệu" && git push`. Vercel sẽ tự build lại.

Học viên thi lên đai: sửa file Excel của họ, rồi chạy lại bước 2 và 4. **Không cần in lại QR.**

## Quy tắc quan trọng

| Quy tắc | Lý do |
|---|---|
| **Không đổi tên file Excel** sau khi đã in QR | Tên file là khoá để giữ mã QR. Đổi tên thì script coi là học viên mới và cấp mã mới |
| **Không xoá `data/registry.json`** | Mất file này thì toàn bộ QR đã in sẽ hỏng |
| **Chốt `SITE_URL` trước khi in** | QR chứa tên miền, đã in rồi thì không sửa được |
| Import là "được hết hoặc không gì cả" | Chỉ cần một file lỗi là script dừng và không ghi gì, tránh trường hợp trang của học viên khác bị mất |

## Script đọc file Excel thế nào

Giá trị được tìm **theo nhãn**, không theo toạ độ ô, nên file lỡ chèn thêm dòng vẫn đọc đúng:

| Nhãn trên thẻ | Lấy giá trị |
|---|---|
| `Họ và Tên:` · `Ngày tháng năm sinh` · `Đơn vị :` · `Sinh hoạt tại:` | ô bên phải cùng dòng (`Sinh hoạt tại` lấy cả dòng dưới) |
| `Số: 123.26/TĐC` | phần sau dấu `:` |
| Khung `Lam đai` … `Lam đai III cấp` | `Ngày thi:`, `Số QĐ CN:`, tên dưới `Giám khảo chấm thi` |
| Ô `Ảnh 3x4` | ảnh đặt đè lên ô này (logo ở chỗ khác nên không bị lấy nhầm) |
| Ô `MQR` | chỗ đặt mã QR |

Chuỗi chấm chừa chỗ (`…………`) được coi là chưa điền. Phần **"Tài liệu"** (thường trú, CCCD, điện thoại,
nhóm máu…) **không bao giờ được đọc**.

Nếu mẫu thẻ đổi chữ ở phần đầu thẻ, sửa trong [`lib/site.ts`](lib/site.ts).

## Deploy

- **Vercel**: import repo, giữ cấu hình mặc định, rồi gắn tên miền riêng (Settings → Domains).
- **Nơi khác** (IIS, nginx, Netlify, Cloudflare Pages…): chạy `npm run build` rồi upload thư mục `out/`.

Trang có `noindex` để Google không lập chỉ mục. Không có trang danh sách, và mã trong link là chuỗi ngẫu
nhiên 10 ký tự nên không dò được thẻ của người khác.

## Cấu trúc

```
app/hv/[slug]/page.tsx     trang thẻ điện tử (tạo sẵn lúc build cho từng học viên)
components/student-card.tsx
scripts/import.ts          Excel → JSON + ảnh
scripts/qr.ts              tạo QR, chèn vào bản sao file Excel
scripts/lib/parse-card.ts  đọc một file thẻ
scripts/lib/insert-qr.ts   chèn ảnh vào .xlsx mà không làm hỏng định dạng mẫu
```
