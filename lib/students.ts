// Chỉ chạy lúc build. "server-only" chặn việc lỡ import file này vào client
// component — nếu không, toàn bộ danh sách học viên sẽ lọt vào file JS công khai.
import "server-only";

import fs from "node:fs";
import path from "node:path";

import type { Student, StudentsFile } from "./types";

let cache: StudentsFile | null = null;

export function loadStudents(): StudentsFile {
  cache ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "data", "students.json"), "utf8"),
  ) as StudentsFile;
  return cache;
}

export function getStudent(slug: string): Student | undefined {
  return loadStudents().students.find((s) => s.slug === slug);
}
