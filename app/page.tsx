import Image from "next/image";
import { ScanLine } from "lucide-react";

import { site } from "@/lib/site";

// Cố ý không có danh sách hay ô tìm kiếm: chỉ người cầm thẻ (có mã QR) mới xem được.
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <div className="flex items-center gap-4">
        <Image src={site.logos.federation} alt="Logo Liên đoàn Vovinam" width={72} height={72} />
        <Image src={site.logos.vovinam} alt="Logo Vovinam" width={54} height={72} />
      </div>
      <p className="text-muted-foreground mt-6 text-xs font-medium tracking-wide">
        {site.authority} · {site.federation}
      </p>
      <h1 className="mt-2 text-2xl font-extrabold tracking-wider">{site.cardTitle}</h1>
      <p className="text-primary mt-1 text-sm font-semibold">{site.cardSubtitle}</p>
      <div className="bg-card mt-8 flex items-start gap-3 rounded-xl border p-4 text-left text-sm shadow-sm">
        <ScanLine className="text-primary mt-0.5 size-5 shrink-0" />
        <p>
          Dùng camera điện thoại quét <strong>mã QR in trên thẻ đẳng cấp</strong> để xem thông tin
          môn sinh.
        </p>
      </div>
    </main>
  );
}
