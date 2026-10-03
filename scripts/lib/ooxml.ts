// Đọc trực tiếp cấu trúc bên trong file .xlsx (một file zip chứa các phần XML).
// Dùng cho những việc ExcelJS làm không tới hoặc làm hỏng: đọc ảnh kèm vị trí, chèn ảnh QR.
// Viết "chịu lỗi": file do WPS, Google Sheets, macro... lưu ra thường lệch chuẩn đôi chút
// (tên phần khác chữ hoa/thường, quan hệ trỏ tới phần không còn tồn tại).
import path from "node:path/posix";

import JSZip from "jszip";

export const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
export const DRAWINGML_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
export const SPREADSHEET_DRAWING_NS =
  "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";

export function attrs(tag: string): Record<string, string> {
  return Object.fromEntries([...tag.matchAll(/([\w:]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
}

export function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export function relsPathOf(part: string): string {
  return `${path.dirname(part)}/_rels/${path.basename(part)}.rels`;
}

export function parseRels(xml: string): Record<string, string>[] {
  return [...xml.matchAll(/<(?:\w+:)?Relationship\b[^>]*>/g)].map((m) => attrs(m[0]));
}

/** Đường dẫn đích của một quan hệ, tính từ phần chứa nó. */
export function resolveTarget(fromPart: string, target: string): string {
  const t = unescapeXml(target).replace(/\\/g, "/");
  return t.startsWith("/") ? t.slice(1) : path.normalize(path.join(path.dirname(fromPart), t));
}

/** Tìm một phần trong zip; nếu không thấy đúng tên thì thử không phân biệt hoa/thường. */
export function findPart(zip: JSZip, part: string): JSZip.JSZipObject | null {
  const exact = zip.file(part);
  if (exact) return exact;
  const lower = part.toLowerCase();
  return zip.file(/.*/).find((f) => f.name.toLowerCase() === lower) ?? null;
}

export async function readPart(zip: JSZip, part: string): Promise<string | null> {
  return (await findPart(zip, part)?.async("string")) ?? null;
}

/** Các quan hệ của một phần; [] nếu phần đó không có file .rels. */
export async function relsOf(zip: JSZip, part: string): Promise<Record<string, string>[]> {
  const xml = await readPart(zip, relsPathOf(part));
  return xml ? parseRels(xml) : [];
}

export type SheetInfo = { name: string; path: string; hidden: boolean };

export async function listSheets(zip: JSZip): Promise<SheetInfo[]> {
  const workbookXml = await readPart(zip, "xl/workbook.xml");
  if (!workbookXml) throw new Error("File Excel thiếu phần xl/workbook.xml");
  const rels = await relsOf(zip, "xl/workbook.xml");
  return [...workbookXml.matchAll(/<(?:\w+:)?sheet\b[^>]*>/g)].flatMap((m) => {
    const a = attrs(m[0]);
    const rid = Object.entries(a).find(([k]) => /(^|:)id$/.test(k))?.[1];
    const rel = rels.find((r) => r.Id === rid);
    if (!rel?.Target) return [];
    return [
      {
        name: unescapeXml(a.name ?? ""),
        path: resolveTarget("xl/workbook.xml", rel.Target),
        hidden: a.state === "hidden" || a.state === "veryHidden",
      },
    ];
  });
}

/** Phần drawing (lớp chứa ảnh) của một trang tính, kể cả khi file .rels trỏ tới phần không tồn tại. */
export async function drawingOf(
  zip: JSZip,
  sheetPath: string,
  sheetXml: string,
): Promise<{ path: string; exists: boolean; rid: string; target: string } | null> {
  const rid = sheetXml.match(/<(?:\w+:)?drawing\b[^>]*?\b(?:\w+:)?id="([^"]+)"/)?.[1];
  if (!rid) return null;
  const rel = (await relsOf(zip, sheetPath)).find((r) => r.Id === rid);
  if (!rel?.Target) return null;
  const target = resolveTarget(sheetPath, rel.Target);
  const actual = findPart(zip, target);
  return { path: actual?.name ?? target, exists: Boolean(actual), rid, target };
}

// ---- Ảnh neo trên trang tính ----

export type CellPoint = { col: number; colOff: number; row: number; rowOff: number }; // col/row từ 0, offset EMU

export type SheetImage = {
  from: CellPoint | null;
  to: CellPoint | null;
  /** Kích thước (EMU) với neo một ô hoặc neo tuyệt đối. */
  ext: { cx: number; cy: number } | null;
  /** Vị trí tuyệt đối (EMU) với neo tuyệt đối. */
  pos: { x: number; y: number } | null;
  buffer: Buffer;
  extension: string;
};

export type SheetImages = { images: SheetImage[]; problems: string[] };

/** Mọi ảnh trên trang tính kèm điểm neo, đọc thẳng từ drawing XML. */
export async function readSheetImages(zip: JSZip, sheetPath: string): Promise<SheetImages> {
  const problems: string[] = [];
  const sheetXml = await readPart(zip, sheetPath);
  if (!sheetXml) return { images: [], problems: [`thiếu phần ${sheetPath}`] };
  const drawing = await drawingOf(zip, sheetPath, sheetXml);
  if (!drawing) return { images: [], problems };
  const drawingXml = drawing.exists ? await readPart(zip, drawing.path) : null;
  if (!drawingXml) {
    problems.push(
      `trang tính trỏ tới lớp ảnh "${drawing.path}" nhưng trong file không có (file bị lưu lỗi, ảnh đã mất)`,
    );
    return { images: [], problems };
  }
  const drawingRels = await relsOf(zip, drawing.path);
  // Excel đôi khi lưu một hình hai lần: bản chính (mc:Choice) và bản dự phòng (mc:Fallback). Chỉ lấy bản chính.
  const xml = drawingXml.replace(/<((?:\w+:)?)Fallback\b[\s\S]*?<\/\1Fallback>/g, "");

  const images: SheetImage[] = [];
  const anchorRe = /<((?:\w+:)?)(twoCellAnchor|oneCellAnchor|absoluteAnchor)\b[^>]*>([\s\S]*?)<\/\1\2>/g;
  for (const [, prefix, , body] of xml.matchAll(anchorRe)) {
    const point = (tag: string): CellPoint | null => {
      const m = body.match(new RegExp(`<${prefix}${tag}>([\\s\\S]*?)</${prefix}${tag}>`));
      if (!m) return null;
      const num = (name: string) =>
        Number(m[1].match(new RegExp(`<(?:\\w+:)?${name}>\\s*(-?\\d+)\\s*<`))?.[1] ?? 0);
      return { col: num("col"), colOff: num("colOff"), row: num("row"), rowOff: num("rowOff") };
    };
    // Kích thước/vị trí của chính neo (tiền tố xdr:), không nhầm với <a:ext> bên trong hình.
    const extTag = body.match(new RegExp(`<${prefix}ext\\b[^>]*>`))?.[0];
    const posTag = body.match(new RegExp(`<${prefix}pos\\b[^>]*>`))?.[0];
    const ext = extTag ? { cx: Number(attrs(extTag).cx ?? 0), cy: Number(attrs(extTag).cy ?? 0) } : null;
    const pos = posTag ? { x: Number(attrs(posTag).x ?? 0), y: Number(attrs(posTag).y ?? 0) } : null;
    const from = point("from");
    const to = point("to");

    // Một neo có thể chứa nhiều ảnh (nhóm hình): lấy hết.
    for (const [, rid] of body.matchAll(/<(?:\w+:)?blip\b[^>]*?\b(?:\w+:)?embed="([^"]+)"/g)) {
      const rel = drawingRels.find((r) => r.Id === rid);
      if (!rel?.Target) {
        problems.push(`ảnh ${rid} trong lớp ảnh không có quan hệ tới file ảnh`);
        continue;
      }
      const mediaPath = resolveTarget(drawing.path, rel.Target);
      const media = findPart(zip, mediaPath);
      if (!media) {
        problems.push(`thiếu file ảnh ${mediaPath}`);
        continue;
      }
      const extension = path.extname(media.name).slice(1).toLowerCase().replace(/^jpg$/, "jpeg");
      images.push({ from, to, ext, pos, buffer: await media.async("nodebuffer"), extension });
    }
  }
  return { images, problems };
}

/**
 * Bản sao file chỉ để ExcelJS đọc chữ: bỏ thẻ <drawing> khỏi mọi trang tính.
 * ExcelJS bị crash ("reading 'anchors'") khi lớp ảnh lệch chuẩn; ảnh đã được đọc riêng ở trên.
 */
export async function withoutDrawings(zip: JSZip): Promise<Buffer> {
  const copy = await JSZip.loadAsync(await zip.generateAsync({ type: "uint8array" }));
  for (const f of copy.file(/^xl\/drawings\/[^/]+\.xml(\.rels)?$/i)) copy.remove(f.name);
  for (const f of copy.file(/^xl\/drawings\/_rels\/[^/]+$/i)) copy.remove(f.name);
  for (const sheet of await listSheets(copy)) {
    const part = findPart(copy, sheet.path);
    if (!part) continue;
    const xml = await part.async("string");
    copy.file(
      part.name,
      xml.replace(/<(?:\w+:)?drawing\b[^>]*\/>|<((?:\w+:)?)drawing\b[^>]*>[\s\S]*?<\/\1drawing>/g, ""),
    );
  }
  return copy.generateAsync({ type: "nodebuffer" });
}
