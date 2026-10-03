import Image from "next/image";
import { CircleCheck, UserRound } from "lucide-react";

import { BeltIcon } from "@/components/belt-icon";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatDateVi } from "@/lib/format";
import { site } from "@/lib/site";
import { currentRank, isAchieved, type Rank, type Student } from "@/lib/types";

export function StudentCard({ student, updatedAt }: { student: Student; updatedAt: string }) {
  const rank = currentRank(student.ranks);

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardBanner />

      <section className="flex flex-col items-center px-5 pb-6 text-center">
        <Photo src={student.photo} name={student.fullName} />

        <h2 className="mt-4 text-xl leading-tight font-bold tracking-wide text-balance uppercase">
          {student.fullName}
        </h2>

        {rank ? (
          <Badge variant="secondary" className="mt-2 gap-2 px-2.5 py-1 text-sm">
            {/* Bọc span để luật [&>svg]:size-3 của Badge không ép nhỏ icon đai. */}
            <span className="flex">
              <BeltIcon color={rank.color} stripes={rank.stripes} className="h-3 w-10" />
            </span>
            {rank.name}
          </Badge>
        ) : (
          <Badge variant="outline" className="mt-2">
            Chưa có đẳng cấp
          </Badge>
        )}

        <dl className="mt-5 grid w-full grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-left text-sm">
          <InfoRow label="Năm sinh" value={student.birthYear?.toString()} />
          <InfoRow label="Đơn vị" value={student.unit} />
          <InfoRow label="Sinh hoạt tại" value={student.club} />
          <InfoRow label="Số thẻ" value={student.cardNo} />
        </dl>
      </section>

      <Separator />

      <section className="px-5 py-5">
        <h3 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          Đẳng cấp môn sinh đạt được
        </h3>
        <ol className="mt-3 space-y-2">
          {student.ranks.map((r) => (
            <RankItem key={r.name} rank={r} />
          ))}
        </ol>
      </section>

      <footer className="bg-muted text-muted-foreground px-5 py-3 text-center text-xs">
        <p className="font-medium">{site.footer}</p>
        <p className="mt-0.5">Cập nhật ngày {formatDateVi(updatedAt)}</p>
      </footer>
    </Card>
  );
}

function CardBanner() {
  return (
    <header className="bg-primary text-primary-foreground relative px-4 pt-4 pb-14">
      <div className="flex items-center justify-between gap-3">
        <Image
          src={site.logos.federation}
          alt="Logo Liên đoàn Vovinam"
          width={48}
          height={48}
          className="size-12 rounded-full bg-white"
        />
        <div className="min-w-0 text-center">
          <p className="text-[10px] leading-snug font-medium tracking-wide opacity-80">
            {site.authority}
            <br />
            {site.federation}
          </p>
          <h1 className="mt-1.5 text-lg leading-none font-extrabold tracking-[0.15em]">
            {site.cardTitle}
          </h1>
          <p className="text-belt-yellow mt-1 text-[11px] font-semibold tracking-wide">
            {site.cardSubtitle}
          </p>
        </div>
        <Image
          src={site.logos.vovinam}
          alt="Logo Vovinam"
          width={36}
          height={48}
          className="h-12 w-9 object-contain"
        />
      </div>
    </header>
  );
}

function Photo({ src, name }: { src: string | null; name: string }) {
  return (
    <div className="bg-muted relative -mt-11 aspect-[3/4] w-32 overflow-hidden rounded-lg shadow-md ring-4 ring-white">
      {src ? (
        <Image
          src={src}
          alt={`Ảnh ${name}`}
          width={300}
          height={400}
          priority
          className="size-full object-cover"
        />
      ) : (
        <UserRound className="text-muted-foreground/50 absolute inset-0 m-auto size-14" />
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value || "—"}</dd>
    </>
  );
}

function RankItem({ rank }: { rank: Rank }) {
  const achieved = isAchieved(rank);
  const details = [
    rank.examDate && `Ngày thi: ${rank.examDate}`,
    rank.decisionNo && `Số QĐ CN: ${rank.decisionNo}`,
    rank.examiners.length > 0 && `Giám khảo: ${rank.examiners.join(", ")}`,
  ].filter(Boolean);

  return (
    <li
      className={
        achieved
          ? "bg-secondary/60 rounded-lg border px-3 py-2.5"
          : "rounded-lg border border-dashed px-3 py-2.5"
      }
    >
      <div className="flex items-center gap-3">
        <BeltIcon color={rank.color} stripes={rank.stripes} muted={!achieved} />
        <span className={achieved ? "font-semibold" : "text-muted-foreground"}>{rank.name}</span>
        {achieved ? (
          <Badge className="bg-success text-success-foreground ml-auto border-transparent">
            <CircleCheck />
            Đã đạt
          </Badge>
        ) : (
          <span className="text-muted-foreground ml-auto text-xs">Chưa đạt</span>
        )}
      </div>
      {details.length > 0 && (
        <ul className="text-muted-foreground mt-1.5 space-y-0.5 pl-[4.25rem] text-xs">
          {details.map((d) => (
            <li key={d as string}>{d}</li>
          ))}
        </ul>
      )}
    </li>
  );
}
