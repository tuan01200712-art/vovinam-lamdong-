export function formatDateVi(iso: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

/** "NGUYỄN THỊ ÁNH" → "Nguyễn Thị Ánh" */
export function toTitleCaseVi(name: string): string {
  return name
    .toLocaleLowerCase("vi")
    .replace(/(^|\s)(\S)/gu, (_, space: string, ch: string) => space + ch.toLocaleUpperCase("vi"));
}
