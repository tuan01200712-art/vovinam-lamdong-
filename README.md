# QRProfile: Thẻ đẳng cấp Vovinam điện tử

Quét mã QR trên thẻ đẳng cấp → mở trang thông tin môn sinh trên điện thoại.

```
input/*.xlsx (mỗi học viên 1 file, chung mẫu thẻ)
   │  npm run import
   ├─► data/students.json      mặt thẻ + phần "Tài liệu" (thông tin cá nhân đã che theo cấu hình)
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
| `Lâm Đồng, ngày … tháng … năm 2026` · `TM. BAN CHẤP HÀNH` · `CHỦ TỊCH` | ngày cấp và người ký (tên ở ô đầu tiên bên dưới chức danh) |

**Phần "Tài liệu"** (từ dòng `Tài Liệu` trở xuống):

| Nhãn | Lấy giá trị |
|---|---|
| `Thời gian tham gia tập luyện…` · `Thường trú` · `CCCD` · `Điện thoại` · `Nhóm máu` | ô bên phải cùng dòng |
| `1. Cập Lam Đai` … `n. Cập Lam Đai III` | gắn với khung đai cùng tên trên mặt thẻ |
| `a. Kế hoạch kiểm tra` · `Thời gian kiểm tra` · `Địa điểm kiểm tra` · `b. Quyết định giám khảo` · `c. Quyết định Công nhận` · `d. Huấn luyện viên trực tiếp giảng dạy` | ô bên phải cùng dòng, thuộc cấp đai ngay phía trên |
| `4. Thành tích của VĐV` | mỗi dòng bên dưới là một thành tích |

Chuỗi chấm chừa chỗ (`…………`) được coi là chưa điền. Ô có chữ mà script không hiểu sẽ được báo trong cảnh báo.

Nếu mẫu thẻ đổi chữ ở phần đầu thẻ, sửa trong [`lib/site.ts`](lib/site.ts).

## Thông tin cá nhân: hiện, che hay ẩn

Ai cầm thẻ (hoặc ảnh chụp thẻ) đều mở được trang, và phần lớn môn sinh là trẻ em. Vì vậy các trường cá nhân
được xử lý **ngay lúc `npm run import`** theo `privacy` trong [`lib/site.ts`](lib/site.ts):

| Trường | Mặc định | Hiển thị khi "mask" |
|---|---|---|
| Nhóm máu | `show` | |
| Điện thoại | `mask` | `•••• ••• 678` (3 số cuối) |
| CCCD | `mask` | `••••••••••••` (che hết: 6 số đầu CCCD suy ra được từ tỉnh, giới tính, năm sinh) |
| Thường trú | `mask` | `•••, xã Tân Hà, tỉnh Lâm Đồng` (chỉ giữ xã và tỉnh khi nhận ra chắc chắn; thôn, đường, số nhà, số điện thoại ghi kèm đều bị bỏ) |

Đổi thành `"show"` để hiện đầy đủ, hoặc `"hide"` để không đưa lên web. Với `mask`/`hide`, giá trị gốc
**không bao giờ** được ghi vào `data/students.json`. Đổi cấu hình xong phải chạy lại `npm run import`.

## Deploy

- **Vercel**: import repo, giữ cấu hình mặc định, rồi gắn tên miền riêng (Settings → Domains).
- **Nơi khác** (IIS, nginx, Netlify, Cloudflare Pages…): chạy `npm run build` rồi upload thư mục `out/`.

Trang có `noindex` để Google không lập chỉ mục. Không có trang danh sách, và mã trong link là chuỗi ngẫu
nhiên 10 ký tự nên không dò được thẻ của người khác.

## Cấu trúc

```
app/hv/[slug]/page.tsx     trang thẻ điện tử (tạo sẵn lúc build cho từng học viên)
components/student-card.tsx  bố cục thẻ (mobile một cột, máy tính hai cột)
components/rank-list.tsx     các cấp đai dạng xổ xuống
lib/site.ts                  chữ cố định trên thẻ + cấu hình che thông tin cá nhân
scripts/import.ts          Excel → JSON + ảnh
scripts/qr.ts              tạo QR, chèn vào bản sao file Excel
scripts/lib/parse-card.ts  đọc một file thẻ
scripts/lib/insert-qr.ts   chèn ảnh vào .xlsx mà không làm hỏng định dạng mẫu
```
