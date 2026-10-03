import { SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <SearchX className="text-muted-foreground size-12" />
      <h1 className="mt-4 text-xl font-bold">Không tìm thấy thẻ</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Mã QR không đúng hoặc thẻ chưa được cập nhật lên hệ thống. Vui lòng liên hệ câu lạc bộ nơi
        môn sinh sinh hoạt.
      </p>
    </main>
  );
}
