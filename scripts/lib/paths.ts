import fs from "node:fs/promises";
import path from "node:path";

import type { Registry, StudentsFile } from "../../lib/types";

// npm run luôn chạy script ở thư mục gốc dự án.
export const ROOT = process.cwd();
/** Nơi để file Excel gốc. Không commit (đã có trong .gitignore). */
export const INPUT_DIR = path.resolve(ROOT, process.env.INPUT_DIR ?? "input");
/** Kết quả cho người quản lý: trang kiểm tra, QR, file Excel có QR. Không commit. */
export const OUTPUT_DIR = path.join(ROOT, "output");
export const STUDENTS_JSON = path.join(ROOT, "data", "students.json");
export const REGISTRY_JSON = path.join(ROOT, "data", "registry.json");
export const PHOTOS_DIR = path.join(ROOT, "public", "photos");

export type InputFile = { name: string; key: string; path: string };

/** Khoá cố định của một học viên = tên file Excel (không đuôi, chữ thường). */
export function keyOf(fileName: string): string {
  return path.parse(fileName).name.normalize("NFC").trim().toLocaleLowerCase("vi");
}

export async function listInputFiles(): Promise<InputFile[]> {
  const names = await fs.readdir(INPUT_DIR).catch(() => [] as string[]);
  return names
    .filter((n) => /\.xlsx$/i.test(n) && !n.startsWith("~$")) // ~$ = file khoá khi Excel đang mở
    .sort((a, b) => a.localeCompare(b, "vi"))
    .map((name) => ({ name, key: keyOf(name), path: path.join(INPUT_DIR, name) }));
}

/** Các file .xls đời cũ: ExcelJS không đọc được, cần "Lưu thành" .xlsx. */
export async function listLegacyXls(): Promise<string[]> {
  const names = await fs.readdir(INPUT_DIR).catch(() => [] as string[]);
  return names.filter((n) => /\.xls$/i.test(n));
}

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw e;
  }
}

export async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export const readRegistry = () => readJson<Registry>(REGISTRY_JSON, { entries: {} });
export const readStudents = () =>
  readJson<StudentsFile>(STUDENTS_JSON, { generatedAt: new Date(0).toISOString(), students: [] });
