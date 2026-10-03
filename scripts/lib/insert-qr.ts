// Chèn ảnh QR vào file .xlsx bằng cách sửa trực tiếp các phần XML bên trong.
// Không mở rồi lưu lại bằng thư viện Excel, vì làm vậy dễ mất định dạng, ô gộp,
// khung viền của mẫu thẻ. Ở đây chỉ THÊM một ảnh, mọi thứ khác giữ nguyên từng byte.
import path from "node:path/posix";

import JSZip from "jszip";

import type { QrPlacement } from "./parse-card";

const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const DRAWINGML_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";

export async function insertQrImage(
  xlsx: Buffer,
  sheetName: string,
  png: Buffer,
  at: QrPlacement,
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(xlsx);
  const read = async (part: string) => {
    const file = zip.file(part);
    if (!file) throw new Error(`File Excel thiếu phần ${part}`);
    return file.async("string");
  };

  // workbook.xml → trang tính → drawing (lớp chứa ảnh) của trang đó.
  const workbookXml = await read("xl/workbook.xml");
  const sheet = [...workbookXml.matchAll(/<(?:\w+:)?sheet\b[^>]*>/g)]
    .map((m) => attrs(m[0]))
    .find((a) => unescapeXml(a.name ?? "") === sheetName);
  const sheetRid = sheet && Object.entries(sheet).find(([k]) => /(^|:)id$/.test(k))?.[1];
  if (!sheetRid) throw new Error(`Không thấy trang tính "${sheetName}"`);

  const sheetPath = resolveRel("xl/workbook.xml", await read(relsPathOf("xl/workbook.xml")), sheetRid);
  const sheetXml = await read(sheetPath);
  const drawingRid = sheetXml.match(/<(?:\w+:)?drawing\b[^>]*?\b(?:\w+:)?id="([^"]+)"/)?.[1];
  if (!drawingRid) {
    throw new Error("Trang tính chưa có ảnh nào (logo, ảnh thẻ), chưa hỗ trợ chèn QR vào mẫu này");
  }
  const drawingPath = resolveRel(sheetPath, await read(relsPathOf(sheetPath)), drawingRid);
  let drawingXml = await read(drawingPath);

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
  const drawingRelsPath = relsPathOf(drawingPath);
  let drawingRels =
    (await zip.file(drawingRelsPath)?.async("string")) ??
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
  let contentTypes = await read("[Content_Types].xml");
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
  const relsXml = await zip.file(relsPathOf("xl/workbook.xml"))?.async("string");
  const rel = relsXml && parseRels(relsXml).find((r) => r.Type?.endsWith("/sharedStrings"));
  if (!rel) return;
  const sstPath = resolveRel("xl/workbook.xml", relsXml, rel.Id);
  const sst = await zip.file(sstPath)?.async("string");
  if (!sst) return;
  zip.file(
    sstPath,
    sst.replace(/(<(?:\w+:)?sst\b[^>]*?\bcount=")(\d+)"/, (_, head: string, n: string) => `${head}${Math.max(0, Number(n) - 1)}"`),
  );
}

function relsPathOf(part: string): string {
  return `${path.dirname(part)}/_rels/${path.basename(part)}.rels`;
}

function resolveRel(fromPart: string, relsXml: string, id: string): string {
  const rel = parseRels(relsXml).find((r) => r.Id === id);
  if (!rel?.Target) throw new Error(`Không thấy quan hệ ${id} của ${fromPart}`);
  return rel.Target.startsWith("/")
    ? rel.Target.slice(1)
    : path.normalize(path.join(path.dirname(fromPart), rel.Target));
}

function parseRels(xml: string): Record<string, string>[] {
  return [...xml.matchAll(/<(?:\w+:)?Relationship\b[^>]*>/g)].map((m) => attrs(m[0]));
}

function attrs(tag: string): Record<string, string> {
  return Object.fromEntries([...tag.matchAll(/([\w:]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
}

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
