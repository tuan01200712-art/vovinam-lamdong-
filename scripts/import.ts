// npm run import
// Đọc toàn bộ file thẻ trong input/ → data/students.json + public/photos/*.webp
// và tạo output/kiem-tra.html để soát lại bằng mắt trước khi deploy.
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { currentRank, type Student, type StudentsFile } from "../lib/types";
import { parseCard, type ParsedCard } from "./lib/parse-card";
import {
  INPUT_DIR,
  OUTPUT_DIR,
  PHOTOS_DIR,
  REGISTRY_JSON,
  ROOT,
  STUDENTS_JSON,
  listInputFiles,
  listLegacyXls,
  readRegistry,
  writeJson,
  type InputFile,
} from "./lib/paths";
import { escapeHtml } from "./lib/text";

// Bỏ 0/o, 1/i/l cho khỏi đọc nhầm. 31^10 tổ hợp: không thể dò ra link của người khác.
const SLUG_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
const SLUG_LENGTH = 10;

type Row = {
  file: InputFile;
  card: ParsedCard & { fullName: string };
  slug: string;
  photo: Buffer | null;
  warnings: string[];
};

async function main() {
  const legacy = await listLegacyXls();
  if (legacy.length) {
    console.warn(`⚠ Bỏ qua ${legacy.length} file .xls đời cũ (mở bằng Excel → Lưu thành .xlsx): ${legacy.join(", ")}`);
  }
  const files = await listInputFiles();
  if (files.length === 0) {
    console.error(`Chưa có file .xlsx nào trong ${rel(INPUT_DIR)}/. Copy các file thẻ vào đó rồi chạy lại.`);
    process.exit(1);
  }

  console.log(`Đọc ${files.length} file trong ${rel(INPUT_DIR)}/ ...`);
  const errors: string[] = [];
  const parsed: { file: InputFile; card: Row["card"] }[] = [];
  for (const file of files) {
    try {
      const card = await parseCard(await fs.readFile(file.path));
      if (card.fullName) parsed.push({ file, card: { ...card, fullName: card.fullName } });
      else errors.push(`${file.name}: không thấy "Họ và Tên"`);
    } catch (e) {
      errors.push(`${file.name}: không đọc được file (${(e as Error).message})`);
    }
  }
  // Ghi một phần sẽ làm trang của những học viên bị lỗi biến mất: hoặc ghi hết, hoặc không ghi gì.
  if (errors.length) {
    console.error(`\n✖ ${errors.length} lỗi, CHƯA ghi gì cả. Sửa rồi chạy lại:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  const registry = await readRegistry();
  const now = new Date().toISOString();
  const usedSlugs = new Set(Object.values(registry.entries).map((e) => e.slug));
  let added = 0;
  for (const { file } of parsed) {
    if (!registry.entries[file.key]) {
      registry.entries[file.key] = { slug: newSlug(usedSlugs), firstImportedAt: now };
      added++;
    }
  }

  const rows: Row[] = [];
  for (const { file, card } of parsed) {
    const warnings = [...card.warnings];
    let photo: Buffer | null = null;
    if (card.photo) {
      try {
        // 600x800 WebP; sharp bỏ toàn bộ metadata (EXIF có thể chứa toạ độ GPS nơi chụp).
        photo = await sharp(card.photo.buffer)
          .rotate()
          .resize(600, 800, { fit: "cover" })
          .webp({ quality: 82 })
          .toBuffer();
      } catch (e) {
        warnings.push(`Không xử lý được ảnh (${card.photo.extension}): ${(e as Error).message}`);
      }
    }
    rows.push({ file, card, slug: registry.entries[file.key].slug, photo, warnings });
  }

  flagDuplicates(rows, (r) => r.card.cardNo, (v, others) => `Số thẻ ${v} trùng với: ${others}`);
  flagDuplicates(
    rows,
    (r) => r.card.photo && sha256(r.card.photo.buffer),
    (_, others) => `Ảnh giống hệt ảnh trong: ${others}`,
  );
  flagDuplicates(
    rows,
    (r) => r.card.fullName.toLocaleLowerCase("vi"),
    (_, others) => `Trùng họ tên với: ${others} (bỏ qua nếu đúng là 2 người khác nhau)`,
  );

  const currentKeys = new Set(rows.map((r) => r.file.key));
  const missing = Object.keys(registry.entries).filter((k) => !currentKeys.has(k));

  // ---- Ghi kết quả ----
  await fs.mkdir(PHOTOS_DIR, { recursive: true });
  const keep = new Set<string>();
  for (const r of rows) {
    if (!r.photo) continue;
    keep.add(`${r.slug}.webp`);
    await fs.writeFile(path.join(PHOTOS_DIR, `${r.slug}.webp`), r.photo);
  }
  for (const name of await fs.readdir(PHOTOS_DIR)) {
    if (name.endsWith(".webp") && !keep.has(name)) await fs.rm(path.join(PHOTOS_DIR, name));
  }

  const students = rows.map(toStudent);
  await writeJson(STUDENTS_JSON, { generatedAt: now, students } satisfies StudentsFile);
  await writeJson(REGISTRY_JSON, registry);

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const reportPath = path.join(OUTPUT_DIR, "kiem-tra.html");
  await fs.writeFile(reportPath, renderReport(rows, missing, now), "utf8");

  // ---- Tóm tắt ----
  const withWarnings = rows.filter((r) => r.warnings.length);
  for (const r of withWarnings) {
    console.warn(`\n⚠ ${r.file.name}`);
    for (const w of r.warnings) console.warn(`  - ${w}`);
  }
  if (missing.length) {
    console.warn(
      `\n⚠ ${missing.length} học viên đã từng import nhưng giờ không còn file: ${missing.join(", ")}` +
        `\n  Trang của họ sẽ bị gỡ, QR đã in sẽ báo "Không tìm thấy thẻ".` +
        `\n  Nếu chỉ là đổi tên file, hãy đặt lại tên cũ để giữ nguyên link QR.`,
    );
  }
  console.log(
    `\n✔ Đã import ${rows.length} học viên (${added} mới) · có ảnh: ${rows.filter((r) => r.photo).length}/${rows.length}` +
      ` · file có cảnh báo: ${withWarnings.length}` +
      `\n  Đã ghi: ${rel(STUDENTS_JSON)}, ${rel(REGISTRY_JSON)}, ${rel(PHOTOS_DIR)}/` +
      `\n  → Mở ${rel(reportPath)} để soát lại ảnh và thông tin trước khi deploy.` +
      `\n  → Bước tiếp: npm run qr (tạo mã QR), rồi commit + push để cập nhật web.`,
  );
}

function toStudent(r: Row): Student {
  return {
    slug: r.slug,
    cardNo: r.card.cardNo,
    fullName: r.card.fullName,
    birthYear: r.card.birthYear,
    unit: r.card.unit,
    club: r.card.club,
    // ?v= đổi khi ảnh đổi, để trình duyệt không giữ ảnh cũ trong cache.
    photo: r.photo ? `/photos/${r.slug}.webp?v=${sha256(r.photo).slice(0, 8)}` : null,
    ranks: r.card.ranks,
  };
}

function newSlug(used: Set<string>): string {
  let slug: string;
  do {
    slug = Array.from({ length: SLUG_LENGTH }, () => SLUG_ALPHABET[crypto.randomInt(SLUG_ALPHABET.length)]).join("");
  } while (used.has(slug));
  used.add(slug);
  return slug;
}

function flagDuplicates(
  rows: Row[],
  keyOf: (r: Row) => string | null | undefined,
  message: (value: string, others: string) => string,
) {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = keyOf(r);
    if (k) groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  for (const [value, group] of groups) {
    if (group.length < 2) continue;
    for (const r of group) {
      const others = group.filter((o) => o !== r).map((o) => o.file.name).join(", ");
      r.warnings.push(message(value, others));
    }
  }
}

const sha256 = (buf: Buffer) => crypto.createHash("sha256").update(buf).digest("hex");
const rel = (p: string) => path.relative(ROOT, p) || ".";

function renderReport(rows: Row[], missing: string[], generatedAt: string): string {
  // File có cảnh báo lên đầu.
  const sorted = [...rows].sort(
    (a, b) => Number(b.warnings.length > 0) - Number(a.warnings.length > 0) || a.file.name.localeCompare(b.file.name, "vi"),
  );
  const cards = sorted
    .map((r) => {
      const rank = currentRank(r.card.ranks);
      const img = r.photo
        ? `<img src="data:image/webp;base64,${r.photo.toString("base64")}" alt="">`
        : `<div class="nophoto">Không có ảnh</div>`;
      const info = [
        ["Năm sinh", r.card.birthYear?.toString()],
        ["Đơn vị", r.card.unit],
        ["Sinh hoạt tại", r.card.club],
        ["Số thẻ", r.card.cardNo],
        ["Đẳng cấp", rank?.name ?? "Chưa có"],
      ]
        .map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(v ?? "—")}</dd>`)
        .join("");
      const warns = r.warnings.length
        ? `<ul class="warn">${r.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}</ul>`
        : "";
      return `<article class="${r.warnings.length ? "has-warn" : ""}">${img}<div>
        <h2>${escapeHtml(r.card.fullName)}</h2><dl>${info}</dl>
        <p class="file">${escapeHtml(r.file.name)} · /hv/${r.slug}/</p>${warns}</div></article>`;
    })
    .join("\n");

  const missingBlock = missing.length
    ? `<p class="missing">⚠ ${missing.length} học viên đã từng import nhưng giờ không còn file (trang sẽ bị gỡ): ${missing.map(escapeHtml).join(", ")}</p>`
    : "";

  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kiểm tra dữ liệu import</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; padding: 24px; background: #f4f6fb; color: #1b2235; }
  h1 { margin: 0 0 4px; font-size: 22px; }
  .meta { color: #5b6478; margin: 0 0 20px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 14px; }
  article { display: flex; gap: 14px; background: #fff; border: 1px solid #dde2ee; border-radius: 12px; padding: 12px; }
  article.has-warn { border-color: #e8a33d; box-shadow: 0 0 0 2px #fbe3bd; }
  img, .nophoto { width: 96px; height: 128px; object-fit: cover; border-radius: 8px; flex-shrink: 0; background: #e9ecf3; }
  .nophoto { display: grid; place-items: center; font-size: 12px; color: #8a92a6; text-align: center; }
  h2 { margin: 0 0 6px; font-size: 15px; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 0; font-size: 13px; }
  dt { color: #5b6478; } dd { margin: 0; }
  .file { font-size: 11px; color: #8a92a6; margin: 6px 0 0; word-break: break-all; }
  .warn { margin: 6px 0 0; padding-left: 18px; font-size: 12px; color: #a45a00; }
  .missing { background: #fff3e0; border: 1px solid #e8a33d; padding: 10px 14px; border-radius: 8px; }
</style></head>
<body>
<h1>Kiểm tra dữ liệu import: ${rows.length} học viên</h1>
<p class="meta">Tạo lúc ${new Date(generatedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })} ·
 có ảnh ${rows.filter((r) => r.photo).length}/${rows.length} · file có cảnh báo: ${rows.filter((r) => r.warnings.length).length}.
 Soát xem ảnh có đúng người không. Trang này chứa dữ liệu thật: chỉ xem trên máy, đừng gửi đi.</p>
${missingBlock}
<div class="grid">
${cards}
</div>
</body></html>
`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
