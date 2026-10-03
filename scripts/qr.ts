// npm run qr
// Tạo mã QR cho từng học viên đã import:
//   output/qr/<tên file>.png          ảnh QR rời
//   output/the-co-qr/<tên file>.xlsx  bản sao file thẻ, QR đã đặt vào ô "MQR", mở ra in luôn
//   output/qr/danh-sach.csv           tên file, họ tên, số thẻ, link
import fs from "node:fs/promises";
import path from "node:path";

import QRCode from "qrcode";

import { insertQrImage } from "./lib/insert-qr";
import { parseCard } from "./lib/parse-card";
import { OUTPUT_DIR, ROOT, listInputFiles, readRegistry, readStudents } from "./lib/paths";

async function main() {
  try {
    process.loadEnvFile(path.join(ROOT, ".env"));
  } catch {
    // Không có file .env: dùng biến môi trường sẵn có.
  }
  const siteUrl = (process.env.SITE_URL ?? "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^/\s]+/.test(siteUrl)) {
    console.error(
      "Chưa đặt SITE_URL (tên miền web sau khi deploy), ví dụ trong file .env:\n" +
        "  SITE_URL=https://the.vovinamlamdong.vn\n" +
        "QR đã in thì không sửa được, nên phải chốt tên miền trước khi chạy lệnh này.",
    );
    process.exit(1);
  }
  if (siteUrl.startsWith("http://") && !/\/\/(localhost|127\.0\.0\.1)/.test(siteUrl)) {
    console.warn("⚠ SITE_URL đang là http://, nên dùng https://");
  }

  const { students } = await readStudents();
  const bySlug = new Map(students.map((s) => [s.slug, s]));
  const registry = await readRegistry();
  const files = await listInputFiles();

  const qrDir = path.join(OUTPUT_DIR, "qr");
  const cardsDir = path.join(OUTPUT_DIR, "the-co-qr");
  await fs.rm(qrDir, { recursive: true, force: true });
  await fs.rm(cardsDir, { recursive: true, force: true });
  await fs.mkdir(qrDir, { recursive: true });
  await fs.mkdir(cardsDir, { recursive: true });

  const csv = [["file", "ho_ten", "so_the", "link"]];
  const problems: string[] = [];
  let inserted = 0;

  for (const file of files) {
    const slug = registry.entries[file.key]?.slug;
    const student = slug ? bySlug.get(slug) : undefined;
    if (!student) {
      problems.push(`${file.name}: chưa import (chạy npm run import trước)`);
      continue;
    }

    const url = `${siteUrl}/hv/${student.slug}/`;
    const png = await QRCode.toBuffer(url, { errorCorrectionLevel: "M", margin: 2, width: 600 });
    await fs.writeFile(path.join(qrDir, `${path.parse(file.name).name}.png`), png);
    csv.push([file.name, student.fullName, student.cardNo ?? "", url]);

    try {
      const xlsx = await fs.readFile(file.path);
      const card = await parseCard(xlsx);
      if (!card.qr) {
        problems.push(`${file.name}: không thấy ô "MQR", chỉ xuất ảnh QR rời`);
        continue;
      }
      await fs.writeFile(
        path.join(cardsDir, file.name),
        await insertQrImage(xlsx, card.sheetName, png, card.qr),
      );
      inserted++;
    } catch (e) {
      problems.push(`${file.name}: không chèn được QR vào Excel (${(e as Error).message})`);
    }
  }

  // BOM để Excel mở CSV tiếng Việt không bị lỗi font.
  const csvText = csv.map((row) => row.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\r\n");
  await fs.writeFile(path.join(qrDir, "danh-sach.csv"), "﻿" + csvText, "utf8");

  for (const p of problems) console.warn(`⚠ ${p}`);
  console.log(
    `\n✔ ${csv.length - 1} mã QR → ${path.relative(ROOT, qrDir)}/` +
      `\n✔ ${inserted} file thẻ đã chèn QR → ${path.relative(ROOT, cardsDir)}/` +
      `\n  Link dạng: ${siteUrl}/hv/<mã>/` +
      `\n  → Deploy web xong, quét thử vài mã bằng điện thoại rồi hẵng in hàng loạt.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
