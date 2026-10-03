// npm run import
// Đọc toàn bộ file thẻ trong input/ → data/students.json + public/photos/*.webp
// và tạo output/kiem-tra.html để soát lại bằng mắt trước khi deploy.
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { publicValue } from "../lib/privacy";
import type { SecretValues } from "../lib/secret";
import { site, type PrivateField } from "../lib/site";
import { currentRank, isAchieved, type Rank, type Student, type StudentsFile } from "../lib/types";
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
import { MIN_CODE_LENGTH, deriveSealKey, seal, type SealKey } from "./lib/seal";
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
  const viewCode = readViewCode();
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

  // Dẫn xuất khoá một lần (PBKDF2 cố ý chậm), dùng chung cho mọi thẻ trong lượt import này.
  const sealKey = viewCode ? deriveSealKey(viewCode) : null;
  const students = rows.map((r) => toStudent(r, sealKey));
  await writeJson(STUDENTS_JSON, { generatedAt: now, students } satisfies StudentsFile);
  await writeJson(REGISTRY_JSON, registry);

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const reportPath = path.join(OUTPUT_DIR, "kiem-tra.html");
  await fs.writeFile(reportPath, renderReport(rows, students, missing, now), "utf8");

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
  const lockable = rows.filter(hasMaskedRaw).length;
  const sealed = students.filter((s) => s.secret).length;
  if (sealed) console.log(`\n🔒 ${sealed} thẻ có nút xem đầy đủ (cần mã xem VIEW_CODE).`);
  else if (lockable) {
    console.warn(
      `\n⚠ Chưa đặt VIEW_CODE trong .env: ${lockable} thẻ chỉ hiện bản đã che, chưa có nút con mắt để xem đầy đủ.`,
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

function toStudent(r: Row, sealKey: SealKey | null): Student {
  const address = publicValue("address", r.card.personal.address);
  if (site.privacy.address === "mask" && r.card.personal.address && address === "•••") {
    r.warnings.push("Thường trú: không nhận ra xã/phường, tỉnh nên đã che toàn bộ");
  }
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
    trainingSince: r.card.trainingSince,
    // Che/ẩn ngay tại đây theo site.privacy: giá trị gốc không bao giờ vào students.json.
    bloodType: publicValue("bloodType", r.card.personal.bloodType),
    address,
    idNumber: publicValue("idNumber", r.card.personal.idNumber),
    phone: publicValue("phone", r.card.personal.phone),
    achievements: r.card.achievements,
    secret: sealSecret(r, sealKey),
    issuedAt: r.card.issuedAt,
    signer: r.card.signer,
  };
}

/** Giá trị gốc của các trường đang "mask", mã hoá bằng mã xem để trang mở được khi nhập đúng mã. */
function sealSecret(r: Row, sealKey: SealKey | null) {
  const values: SecretValues = {};
  for (const field of Object.keys(site.privacy) as PrivateField[]) {
    const raw = r.card.personal[field];
    if (site.privacy[field] === "mask" && raw) values[field] = raw;
  }
  return sealKey && Object.keys(values).length ? seal(sealKey, r.slug, values) : null;
}

function readViewCode(): string | null {
  try {
    process.loadEnvFile(path.join(ROOT, ".env"));
  } catch {
    // Không có file .env: dùng biến môi trường sẵn có.
  }
  const code = process.env.VIEW_CODE?.trim();
  if (!code) return null;
  if ([...code].length < MIN_CODE_LENGTH) {
    console.error(
      `VIEW_CODE phải dài ít nhất ${MIN_CODE_LENGTH} ký tự. Bản mã nằm công khai trong trang, mã ngắn sẽ bị dò ra.`,
    );
    process.exit(1);
  }
  if (/^\d+$/.test(code)) console.warn("⚠ VIEW_CODE toàn chữ số, dễ bị dò. Nên trộn cả chữ và số.");
  return code;
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

const hasMaskedRaw = (r: Row) =>
  (Object.keys(site.privacy) as PrivateField[]).some(
    (f) => site.privacy[f] === "mask" && r.card.personal[f],
  );
const sha256 = (buf: Buffer) => crypto.createHash("sha256").update(buf).digest("hex");
const rel = (p: string) => path.relative(ROOT, p) || ".";

function renderReport(rows: Row[], students: Student[], missing: string[], generatedAt: string): string {
  const items = rows.map((row, i) => ({ row, student: students[i] }));
  // File có cảnh báo lên đầu.
  items.sort(
    (a, b) =>
      Number(b.row.warnings.length > 0) - Number(a.row.warnings.length > 0) ||
      a.row.file.name.localeCompare(b.row.file.name, "vi"),
  );
  const dl = (pairs: [string, string | null | undefined][]) =>
    `<dl>${pairs.map(([k, v]) => `<dt>${k}</dt><dd>${v ? escapeHtml(v) : '<span class="empty">—</span>'}</dd>`).join("")}</dl>`;
  const rankLine = (r: Rank) => {
    const details = [
      r.examDate && `thi ${r.examDate}`,
      r.decisionNo && `QĐ CN ${r.decisionNo}`,
      r.examiners.length > 0 && `GK ${r.examiners.join(", ")}`,
      r.plan && `KH ${r.plan}`,
      r.testDate && `kiểm tra ${r.testDate}`,
      r.testPlace && `tại ${r.testPlace}`,
      r.examinerDecision && `QĐ GK ${r.examinerDecision}`,
      r.recognitionDecision && `QĐ công nhận ${r.recognitionDecision}`,
      r.coach && `HLV ${r.coach}`,
    ].filter(Boolean);
    return `<li class="${isAchieved(r) ? "ok" : ""}"><b>${escapeHtml(r.name)}</b>${details.length ? `: ${escapeHtml(details.join(" · "))}` : ""}</li>`;
  };

  const cards = items
    .map(({ row, student: s }) => {
      const img = row.photo
        ? `<img src="data:image/webp;base64,${row.photo.toString("base64")}" alt="">`
        : `<div class="nophoto">Không có ảnh</div>`;
      const signer = s.signer && [s.signer.onBehalfOf, s.signer.role, s.signer.name].filter(Boolean).join(" · ");
      const warns = row.warnings.length
        ? `<ul class="warn">${row.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}</ul>`
        : "";
      return `<article class="${row.warnings.length ? "has-warn" : ""}">${img}<div class="body">
        <h2>${escapeHtml(s.fullName)}</h2>
        ${dl([
          ["Năm sinh", s.birthYear?.toString()],
          ["Đơn vị", s.unit],
          ["Sinh hoạt tại", s.club],
          ["Số thẻ", s.cardNo],
          ["Đẳng cấp", currentRank(s.ranks)?.name ?? "Chưa có"],
          ["Ký", signer],
          ["Ngày cấp", s.issuedAt],
        ])}
        <h3>Tài liệu (đúng như sẽ hiện trên web)</h3>
        ${dl([
          ["Tham gia tập", s.trainingSince],
          ["Nhóm máu", s.bloodType],
          ["Thường trú", s.address],
          ["CCCD", s.idNumber],
          ["Điện thoại", s.phone],
          ["Nút xem đầy đủ", s.secret ? "có (cần mã xem)" : "không"],
        ])}
        <ul class="ranks">${s.ranks.map(rankLine).join("")}</ul>
        <p class="ach">Thành tích: ${s.achievements.length ? escapeHtml(s.achievements.join(" | ")) : "chưa có"}</p>
        <p class="file">${escapeHtml(row.file.name)} · /hv/${s.slug}/</p>${warns}</div></article>`;
    })
    .join("\n");

  const missingBlock = missing.length
    ? `<p class="missing">⚠ ${missing.length} học viên đã từng import nhưng giờ không còn file (trang sẽ bị gỡ): ${missing.map(escapeHtml).join(", ")}</p>`
    : "";

  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kiểm tra dữ liệu import</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; padding: 16px; background: #f4f6fb; color: #1b2235; }
  h1 { margin: 0 0 4px; font-size: 20px; }
  .meta { color: #5b6478; margin: 0 0 16px; font-size: 14px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 1fr)); gap: 14px; }
  article { display: flex; gap: 12px; background: #fff; border: 1px solid #dde2ee; border-radius: 12px; padding: 12px; }
  article.has-warn { border-color: #e8a33d; box-shadow: 0 0 0 2px #fbe3bd; }
  .body { min-width: 0; flex: 1; }
  img, .nophoto { width: 90px; height: 120px; object-fit: cover; border-radius: 8px; flex-shrink: 0; background: #e9ecf3; }
  .nophoto { display: grid; place-items: center; font-size: 12px; color: #8a92a6; text-align: center; }
  h2 { margin: 0 0 6px; font-size: 15px; }
  h3 { margin: 10px 0 4px; font-size: 12px; color: #5b6478; text-transform: uppercase; letter-spacing: .04em; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 0; font-size: 13px; }
  dt { color: #5b6478; } dd { margin: 0; overflow-wrap: anywhere; }
  .empty { color: #b3b9c7; }
  .ranks { margin: 8px 0 0; padding-left: 18px; font-size: 12px; color: #5b6478; }
  .ranks li.ok { color: #1b2235; }
  .ach { margin: 6px 0 0; font-size: 12px; }
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
