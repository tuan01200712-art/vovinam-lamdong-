// Đọc một file Excel "Thẻ đẳng cấp" (mỗi file = 1 học viên).
//
// Giá trị được tìm theo NHÃN chứ không theo toạ độ cố định: "Họ và Tên:" ở D7
// thì lấy ô bên phải (F7). Nhờ vậy file nào lỡ chèn thêm dòng/cột vẫn đọc đúng.
import ExcelJS from "exceljs";

import type { BeltColor, Rank } from "../../lib/types";
import { cleanText, formatDateUtc, parseDateVi, valueOrNull } from "./text";

type Cell = { row: number; col: number; address: string; text: string };

/** Vùng ô, đánh số từ 1, gồm cả hai đầu. */
type Box = { top: number; left: number; bottom: number; right: number };

/**
 * Vị trí đặt ảnh QR trong file Excel. col/row đánh số từ 0, các giá trị khác tính bằng EMU.
 * marker là ô chứa chữ "MQR" (ví dụ "B13"), sẽ được xoá chữ khi chèn QR.
 */
export type QrPlacement = {
  marker: string;
  col: number;
  colOff: number;
  row: number;
  rowOff: number;
  size: number;
};

export type ParsedCard = {
  sheetName: string;
  fullName: string | null;
  birthYear: number | null;
  unit: string | null;
  club: string | null;
  cardNo: string | null;
  ranks: Rank[];
  photo: { buffer: Buffer; extension: string } | null;
  qr: QrPlacement | null;
  warnings: string[];
};

const FIELD = {
  fullName: /^họ\s*(?:và\s*)?tên\s*:?\s*(.*)$/iu,
  birth: /^(?:ngày\s*tháng\s*năm\s*sinh|ngày\s*sinh|năm\s*sinh)\s*:?\s*(.*)$/iu,
  unit: /^đơn\s*vị\s*:?\s*(.*)$/iu,
  club: /^sinh\s*hoạt\s*tại\s*:?\s*(.*)$/iu,
  cardNo: /^số\s*:\s*(.*)$/iu,
};
const PHOTO_MARK = /^ảnh(?:\s|$)/iu;
const QR_MARK = /^mqr$/iu;
const RANK_TITLE = /^(lam|hoàng|chuẩn\s*hồng|hồng|bạch)\s*đai(?:\s+(i{1,3}|iv|v|vi)\s*cấp)?$/iu;
const EXAM_DATE = /^ngày\s*thi\s*:?\s*(.*)$/iu;
const DECISION_NO = /^số\s*qđ(?:\s*cn)?\s*:?\s*(.*)$/iu;
const EXAMINERS = /^giám\s*khảo(?:\s*chấm\s*thi)?\s*:?\s*(.*)$/iu;
const RECOGNIZED = /^công\s*nhận$/iu;
/** Từ dòng có các nhãn này trở xuống là phần "Tài liệu" (CCCD, điện thoại...): không bao giờ đọc. */
const PRIVATE_SECTION =
  /^(?:tài\s*liệu|cccd|cmnd|điện\s*thoại|thường\s*trú|nhóm\s*máu)(?:\s|:|$)/iu;

const LABELS = [...Object.values(FIELD), PHOTO_MARK, QR_MARK, RANK_TITLE];
const isLabel = (text: string) => LABELS.some((re) => re.test(text));

const BELT_COLOR: Record<string, BeltColor> = {
  lam: "blue",
  hoàng: "yellow",
  "chuẩn hồng": "red",
  hồng: "red",
  bạch: "white",
};
const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6 };

export async function parseCard(data: Buffer): Promise<ParsedCard> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as unknown as ExcelJS.Buffer);
  const visible = wb.worksheets.filter((w) => w.state === "visible");
  const ws = visible[0] ?? wb.worksheets[0];
  if (!ws) throw new Error("File không có trang tính nào");

  const warnings: string[] = [];
  if (visible.length > 1) {
    warnings.push(`File có ${visible.length} trang tính, chỉ đọc trang đầu tiên "${ws.name}"`);
  }

  const all: Cell[] = [];
  ws.eachRow({ includeEmpty: false }, (row, r) => {
    row.eachCell({ includeEmpty: false }, (cell, c) => {
      if (cell.type === ExcelJS.ValueType.Merge) return; // ô phụ của vùng gộp: trùng giá trị ô chính
      const text = cellText(cell.value);
      if (text) all.push({ row: r, col: c, address: cell.address, text });
    });
  });

  const privateStart = Math.min(
    ...all.filter((c) => PRIVATE_SECTION.test(c.text)).map((c) => c.row),
    Infinity,
  );
  const cells = all.filter((c) => c.row < privateStart);
  const merges = (ws.model.merges ?? []).map(decodeRange);
  const boxOf = (c: Cell): Box =>
    merges.find((m) => c.row >= m.top && c.row <= m.bottom && c.col >= m.left && c.col <= m.right) ??
    { top: c.row, left: c.col, bottom: c.row, right: c.col };

  // Nửa phải của thẻ là các khung đẳng cấp; các trường thông tin nằm ở nửa trái.
  const titles = cells.filter((c) => RANK_TITLE.test(c.text));
  const rightPanel = Math.min(...titles.map((t) => t.col), Infinity);
  const left = cells.filter((c) => c.col < rightPanel);

  const rightOf = (cell: Cell): string | null => {
    const next = left
      .filter((c) => c.row === cell.row && c.col > cell.col && c.col <= cell.col + 6)
      .sort((a, b) => a.col - b.col)[0];
    return next && !isLabel(next.text) ? valueOrNull(next.text) : null;
  };

  const field = (re: RegExp, label: string) => {
    const hits = left.filter((c) => re.test(c.text));
    if (hits.length === 0) return { cell: null, value: null };
    if (hits.length > 1) {
      warnings.push(
        `Nhãn "${label}" xuất hiện ${hits.length} lần (${hits.map((h) => h.address).join(", ")}), lấy ô ${hits[0].address}`,
      );
    }
    const cell = hits[0];
    return { cell, value: valueOrNull(cell.text.match(re)![1]) ?? rightOf(cell) };
  };

  const fullName = field(FIELD.fullName, "Họ và Tên").value;
  const unit = field(FIELD.unit, "Đơn vị").value;
  const cardNo = field(FIELD.cardNo, "Số:").value;

  const birth = field(FIELD.birth, "Ngày tháng năm sinh").value;
  const birthYear = parseYear(birth);
  if (birth && birthYear === null) warnings.push(`Không đọc được năm sinh từ "${birth}"`);

  // "Sinh hoạt tại:" có thể viết tràn xuống dòng dưới (tên xã/phường ở dòng kế tiếp).
  const clubField = field(FIELD.club, "Sinh hoạt tại");
  let club = clubField.value;
  if (club && clubField.cell) {
    const below = left.filter((c) => c.row === clubField.cell.row + 1 && c.col >= clubField.cell.col);
    const extra = below.map((c) => valueOrNull(c.text)).filter(Boolean).join(" ");
    if (extra && !below.some((c) => isLabel(c.text)) && !/ngày.*tháng.*năm/iu.test(extra)) {
      club = `${club} ${extra}`;
    }
  }

  const ranks = titles.map((title) => {
    const sameCol = titles.filter((t) => t.col === title.col);
    const i = sameCol.indexOf(title);
    const next = sameCol[i + 1];
    const prev = sameCol[i - 1];
    // Khung kéo tới khung kế tiếp cùng cột; khung cuối cao bằng khung trước nó.
    const bottom = Math.min(
      next ? next.row - 1 : prev ? title.row + (title.row - prev.row) - 1 : Infinity,
      privateStart - 1,
    );
    const box = boxOf(title);
    const inside = cells.filter(
      (c) => c.row > title.row && c.row <= bottom && c.col >= box.left && c.col <= box.right,
    );
    return parseRank(title, inside, warnings);
  });
  if (ranks.length === 0) warnings.push("Không thấy khung đẳng cấp nào (Lam đai, Lam đai I cấp...)");

  const photo = findPhoto(wb, ws, left, boxOf, warnings);

  const qrMark = left.find((c) => QR_MARK.test(c.text));
  const qr = qrMark ? { marker: qrMark.address, ...placeQr(ws, boxOf(qrMark)) } : null;
  if (!qrMark) warnings.push('Không thấy ô "MQR": sẽ không chèn được QR vào file Excel');

  return { sheetName: ws.name, fullName, birthYear, unit, club, cardNo, ranks, photo, qr, warnings };
}

function parseRank(title: Cell, inside: Cell[], warnings: string[]): Rank {
  const name = cleanText(title.text);
  const m = name.match(RANK_TITLE)!;
  const rank: Rank = {
    name,
    color: BELT_COLOR[cleanText(m[1]).toLocaleLowerCase("vi")] ?? "blue",
    stripes: m[2] ? ROMAN[m[2].toLowerCase()] : 0,
    examDate: null,
    decisionNo: null,
    examiners: [],
  };

  let afterExaminerLabel = false;
  for (const c of inside) {
    let match: RegExpMatchArray | null;
    if (RECOGNIZED.test(c.text)) continue;
    if ((match = c.text.match(EXAM_DATE))) {
      const v = valueOrNull(match[1]);
      rank.examDate = v && (parseDateVi(v) ?? v);
      if (v && !parseDateVi(v)) warnings.push(`${name}: ngày thi "${v}" không đúng dạng ngày/tháng/năm`);
      afterExaminerLabel = false;
    } else if ((match = c.text.match(DECISION_NO))) {
      rank.decisionNo = valueOrNull(match[1]);
      afterExaminerLabel = false;
    } else if ((match = c.text.match(EXAMINERS))) {
      const v = valueOrNull(match[1]);
      if (v) rank.examiners.push(v);
      afterExaminerLabel = true;
    } else {
      const v = valueOrNull(c.text);
      if (!v) continue;
      // Tên giám khảo được ghi ở các dòng ngay dưới nhãn "Giám khảo chấm thi".
      if (afterExaminerLabel) rank.examiners.push(v);
      else warnings.push(`${name}: bỏ qua ô ${c.address} "${v}" vì không rõ là thông tin gì`);
    }
  }
  return rank;
}

function findPhoto(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  left: Cell[],
  boxOf: (c: Cell) => Box,
  warnings: string[],
): ParsedCard["photo"] {
  const mark = left.find((c) => PHOTO_MARK.test(c.text));
  if (!mark) {
    warnings.push('Không thấy ô "Ảnh 3x4" nên không xác định được ảnh học viên');
    return null;
  }
  // Ảnh thẻ là ảnh đặt đè lên ô "Ảnh 3x4". Logo ở chỗ khác nên không bị lấy nhầm.
  const markBox = boxOf(mark);
  const hits = ws
    .getImages()
    .map((img) => {
      const { tl, br } = img.range;
      const box: Box = {
        top: Math.floor(tl.nativeRow) + 1,
        left: Math.floor(tl.nativeCol) + 1,
        bottom: Math.floor(br?.nativeRow ?? tl.nativeRow) + 1,
        right: Math.floor(br?.nativeCol ?? tl.nativeCol) + 1,
      };
      return { box, image: wb.getImage(Number(img.imageId)) };
    })
    .filter(({ box }) => overlaps(box, markBox))
    .sort((a, b) => area(b.box) - area(a.box));

  if (hits.length === 0) {
    warnings.push(`Không có ảnh nào đặt lên ô ${mark.address} "${mark.text}": học viên sẽ không có ảnh`);
    return null;
  }
  if (hits.length > 1) warnings.push(`Có ${hits.length} ảnh chồng lên ô ${mark.address}, lấy ảnh lớn nhất`);
  const { image } = hits[0];
  if (!image.buffer) return null;
  return { buffer: Buffer.from(image.buffer as unknown as Uint8Array), extension: image.extension };
}

// ---- Kích thước ô (để đặt QR vừa khít vùng "MQR") ----

const EMU_PER_PX = 9525;
const EMU_PER_PT = 12700;

function placeQr(ws: ExcelJS.Worksheet, box: Box): Omit<QrPlacement, "marker"> {
  const cols = range(box.left, box.right).map((c) => {
    const w = ws.getColumn(c).width ?? ws.properties.defaultColWidth;
    // Công thức đổi "số ký tự" sang pixel của Excel (độ rộng ký tự chuẩn 7px).
    const px = w ? Math.trunc(((256 * w + Math.trunc(128 / 7)) / 256) * 7) : 64;
    return px * EMU_PER_PX;
  });
  const rows = range(box.top, box.bottom).map(
    (r) => (ws.getRow(r).height ?? ws.properties.defaultRowHeight ?? 15) * EMU_PER_PT,
  );
  const width = cols.reduce((a, b) => a + b, 0);
  const height = rows.reduce((a, b) => a + b, 0);
  const size = Math.round(Math.min(width, height) * 0.92);
  const [col, colOff] = locate(cols, (width - size) / 2);
  const [row, rowOff] = locate(rows, (height - size) / 2);
  return { col: box.left - 1 + col, colOff, row: box.top - 1 + row, rowOff, size };
}

/** Đổi khoảng cách tính từ đầu vùng thành (ô thứ mấy, lệch bao nhiêu trong ô đó). */
function locate(sizes: number[], offset: number): [number, number] {
  let i = 0;
  while (i < sizes.length - 1 && offset >= sizes[i]) {
    offset -= sizes[i];
    i++;
  }
  return [i, Math.round(offset)];
}

// ---- Tiện ích ----

function cellText(v: ExcelJS.CellValue): string {
  if (v == null || typeof v === "boolean") return "";
  if (typeof v === "string") return cleanText(v);
  if (typeof v === "number") return String(v);
  if (v instanceof Date) return formatDateUtc(v);
  if ("richText" in v) return cleanText(v.richText.map((r) => r.text).join(""));
  if ("formula" in v || "sharedFormula" in v) return cellText(v.result as ExcelJS.CellValue);
  if ("text" in v) return cleanText(String(v.text));
  return "";
}

function parseYear(s: string | null): number | null {
  const years = s?.match(/\d{4}/g);
  const year = years ? Number(years[years.length - 1]) : NaN;
  return year >= 1930 && year <= new Date().getFullYear() ? year : null;
}

function decodeRange(ref: string): Box {
  const [a, b = a] = ref.split(":").map(decodeAddress);
  return { top: a.row, left: a.col, bottom: b.row, right: b.col };
}

function decodeAddress(addr: string): { row: number; col: number } {
  const m = addr.replace(/\$/g, "").match(/^([A-Z]+)(\d+)$/i)!;
  const col = [...m[1].toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  return { row: Number(m[2]), col };
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const area = (b: Box) => (b.bottom - b.top + 1) * (b.right - b.left + 1);
const overlaps = (a: Box, b: Box) =>
  a.left <= b.right && b.left <= a.right && a.top <= b.bottom && b.top <= a.bottom;
