// Chèn ảnh QR vào file .xlsx bằng cách sửa trực tiếp các phần XML bên trong.
// Không mở rồi lưu lại bằng thư viện Excel, vì làm vậy dễ mất định dạng, ô gộp,
// khung viền của mẫu thẻ. Ở đây chỉ THÊM một ảnh, mọi thứ khác giữ nguyên từng byte.
import path from "node:path/posix";

import JSZip from "jszip";

import {
  DRAWINGML_NS,
  REL_NS,
  SPREADSHEET_DRAWING_NS,
  attrs,
  drawingOf,
  findPart,
  listSheets,
  parseRels,
  readPart,
  relsOf,
  relsPathOf,
  resolveTarget,
} from "./ooxml";
import type { QrPlacement } from "./parse-card";

export async function insertQrImage(
  xlsx: Buffer,
  sheetName: string,
  png: Buffer,
  at: QrPlacement,
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(xlsx);

  // workbook.xml → trang tính → drawing (lớp chứa ảnh) của trang đó.
  const sheet = (await listSheets(zip)).find((s) => s.name === sheetName);
  const sheetPart = sheet && findPart(zip, sheet.path);
  if (!sheetPart) throw new Error(`Không thấy trang tính "${sheetName}"`);
  const sheetPath = sheetPart.name;
  const sheetXml = await sheetPart.async("string");
  const drawing = await drawingOf(zip, sheetPath, sheetXml);
  if (!drawing) {
    throw new Error("Trang tính chưa có ảnh nào (logo, ảnh thẻ), chưa hỗ trợ chèn QR vào mẫu này");
  }
  const drawingPath = drawing.path;
  // File lưu lỗi: trang tính trỏ tới lớp ảnh không còn tồn tại → tạo lại lớp ảnh rỗng ở đúng chỗ đó.
  let drawingXml =
    (await readPart(zip, drawingPath)) ??
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<xdr:wsDr xmlns:xdr="${SPREADSHEET_DRAWING_NS}" xmlns:a="${DRAWINGML_NS}"></xdr:wsDr>`;
  if (!drawing.exists) await ensureContentTypeOverride(zip, drawingPath);
  // Tên phần khác chữ hoa/thường so với đường dẫn khai báo: Excel vẫn mở được nhưng LibreOffice thì không.
  // Sửa đường dẫn cho khớp tên thật.
  if (drawing.exists && drawing.target !== drawingPath) {
    const sheetRels = findPart(zip, relsPathOf(sheetPath));
    if (sheetRels) {
      const relative = path.relative(path.dirname(sheetPath), drawingPath);
      const xml = await sheetRels.async("string");
      zip.file(
        sheetRels.name,
        xml.replace(/<(?:\w+:)?Relationship\b[^>]*>/g, (tag) =>
          attrs(tag).Id === drawing.rid ? tag.replace(/Target="[^"]*"/, `Target="${relative}"`) : tag,
        ),
      );
    }
  }

  // 0. Xoá chữ "MQR" để không lòi ra cạnh QR (mỗi phần mềm tính độ rộng cột hơi khác nhau).
  const markerCell = sheetXml.match(
    new RegExp(`<c\\b(?=[^>]*\\br="${at.marker}")([^>]*?)(?:/>|>[\\s\\S]*?</c>)`),
  );
  if (markerCell) {
    const keptAttrs = markerCell[1].replace(/\s+t="[^"]*"/, "");
    zip.file(sheetPath, sheetXml.replace(markerCell[0], `<c${keptAttrs}/>`));
    if (/\bt="s"/.test(markerCell[1])) await decrementSharedStringCount(zip);
  }

  // 1. Thêm file ảnh.
  let n = 1;
  while (zip.file(`xl/media/qrprofile${n}.png`)) n++;
  const mediaPath = `xl/media/qrprofile${n}.png`;
  zip.file(mediaPath, png);

  // 2. Khai báo quan hệ drawing → ảnh.
  const drawingRelsPath = findPart(zip, relsPathOf(drawingPath))?.name ?? relsPathOf(drawingPath);
  let drawingRels =
    (await readPart(zip, drawingRelsPath)) ??
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
  const usedIds = new Set(parseRels(drawingRels).map((r) => r.Id));
  let k = 1;
  while (usedIds.has(`rId${k}`)) k++;
  const imageRid = `rId${k}`;
  const target = path.relative(path.dirname(drawingPath), mediaPath);
  drawingRels = drawingRels.replace(
    "</Relationships>",
    `<Relationship Id="${imageRid}" Type="${REL_NS}/image" Target="${target}"/></Relationships>`,
  );
  zip.file(drawingRelsPath, drawingRels);

  // 3. Đăng ký kiểu file .png nếu file chưa có ảnh png nào.
  let contentTypes = (await readPart(zip, "[Content_Types].xml")) ?? "";
  if (!/Extension="png"/i.test(contentTypes)) {
    contentTypes = contentTypes.replace(
      "</Types>",
      `<Default Extension="png" ContentType="image/png"/></Types>`,
    );
    zip.file("[Content_Types].xml", contentTypes);
  }

  // 4. Thêm ảnh vào drawing, dùng đúng tiền tố namespace mà file đang dùng.
  const root = drawingXml.match(/<(\w+:)?wsDr\b[^>]*>/);
  if (!root) throw new Error(`${drawingPath} không đúng định dạng`);
  const xdr = root[1] ?? "";
  let a = Object.entries(attrs(root[0])).find(([, v]) => v === DRAWINGML_NS)?.[0].split(":")[1];
  if (!a) {
    a = "a";
    drawingXml = drawingXml.replace(root[0], root[0].replace(/>$/, ` xmlns:a="${DRAWINGML_NS}">`));
  }
  const ids = [...drawingXml.matchAll(/<(?:\w+:)?cNvPr\b[^>]*?\bid="(\d+)"/g)].map((m) => Number(m[1]));
  const shapeId = Math.max(0, ...ids) + 1;

  const anchor =
    `<${xdr}oneCellAnchor>` +
    `<${xdr}from><${xdr}col>${at.col}</${xdr}col><${xdr}colOff>${at.colOff}</${xdr}colOff>` +
    `<${xdr}row>${at.row}</${xdr}row><${xdr}rowOff>${at.rowOff}</${xdr}rowOff></${xdr}from>` +
    `<${xdr}ext cx="${at.size}" cy="${at.size}"/>` +
    `<${xdr}pic><${xdr}nvPicPr><${xdr}cNvPr id="${shapeId}" name="QR Code"/>` +
    `<${xdr}cNvPicPr><${a}:picLocks noChangeAspect="1"/></${xdr}cNvPicPr></${xdr}nvPicPr>` +
    `<${xdr}blipFill><${a}:blip xmlns:r="${REL_NS}" r:embed="${imageRid}"/>` +
    `<${a}:stretch><${a}:fillRect/></${a}:stretch></${xdr}blipFill>` +
    `<${xdr}spPr><${a}:xfrm><${a}:off x="0" y="0"/><${a}:ext cx="${at.size}" cy="${at.size}"/></${a}:xfrm>` +
    `<${a}:prstGeom prst="rect"><${a}:avLst/></${a}:prstGeom></${xdr}spPr></${xdr}pic>` +
    `<${xdr}clientData/></${xdr}oneCellAnchor>`;
  drawingXml = drawingXml.replace(`</${xdr}wsDr>`, `${anchor}</${xdr}wsDr>`);
  zip.file(drawingPath, drawingXml);

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

/** sharedStrings.xml ghi tổng số ô dùng chuỗi chung; bớt một ô thì giảm một cho khớp. */
async function decrementSharedStringCount(zip: JSZip) {
  const rel = (await relsOf(zip, "xl/workbook.xml")).find((r) => r.Type?.endsWith("/sharedStrings"));
  if (!rel?.Target) return;
  const sstPart = findPart(zip, resolveTarget("xl/workbook.xml", rel.Target));
  if (!sstPart) return;
  const sst = await sstPart.async("string");
  zip.file(
    sstPart.name,
    sst.replace(/(<(?:\w+:)?sst\b[^>]*?\bcount=")(\d+)"/, (_, head: string, n: string) => `${head}${Math.max(0, Number(n) - 1)}"`),
  );
}

/** Đăng ký kiểu nội dung cho một lớp ảnh vừa tạo lại. */
async function ensureContentTypeOverride(zip: JSZip, part: string) {
  const ct = (await readPart(zip, "[Content_Types].xml")) ?? "";
  if (ct.toLowerCase().includes(`partname="/${part.toLowerCase()}"`)) return;
  zip.file(
    "[Content_Types].xml",
    ct.replace(
      "</Types>",
      `<Override PartName="/${part}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`,
    ),
  );
}
