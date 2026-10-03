import Image from "next/image";
import { Stamp, Trophy, UserRound } from "lucide-react";

import { BeltIcon } from "@/components/belt-icon";
import { FieldList, SectionHeading } from "@/components/field-list";
import { RankList } from "@/components/rank-list";
import { RecordSection, type RecordRow } from "@/components/record-section";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDateVi } from "@/lib/format";
import { site } from "@/lib/site";
import { currentRank, type Student } from "@/lib/types";
import { cn } from "@/lib/utils";

// Mobile: mọi phần xếp một cột theo thứ tự đọc.
// Từ md: cột trái (hồ sơ + xác nhận), cột phải (đẳng cấp, hồ sơ môn sinh, thành tích).
export function StudentCard({ student, updatedAt }: { student: Student; updatedAt: string }) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <NationalHeader />
      <CardBanner />

      {/* minmax(0,1fr): cột không được nở rộng hơn thẻ theo nội dung dài (thẻ có overflow-hidden). */}
      <div className="grid grid-cols-[minmax(0,1fr)] md:grid-cols-[18rem_minmax(0,1fr)] md:grid-rows-[auto_1fr]">
        <Profile student={student} className="md:col-start-1 md:row-start-1 md:border-r" />

        <div className="divide-y border-t md:col-start-2 md:row-span-2 md:row-start-1 md:border-t-0">
          <RanksSection student={student} />
          <RecordSection rows={recordRows(student)} secret={student.secret} slug={student.slug} />
          <AchievementsSection achievements={student.achievements} />
        </div>

        <SignatureSection
          student={student}
          className="border-t md:col-start-1 md:row-start-2 md:border-r"
        />
      </div>

      <footer className="bg-belt-yellow px-5 py-3 text-center">
        <p className="text-belt-red-ink text-sm font-bold">{site.footer}</p>
        <p className="text-foreground/70 mt-0.5 text-xs">Cập nhật ngày {formatDateVi(updatedAt)}</p>
      </footer>
    </Card>
  );
}

function NationalHeader() {
  return (
    <div className="bg-card px-4 py-2 text-center leading-tight">
      <p className="text-[10px] font-bold tracking-wide sm:text-xs">{site.nationalTitle}</p>
      <p className="mt-0.5 text-[10px] font-semibold underline underline-offset-2 sm:text-xs">
        {site.nationalMotto}
      </p>
    </div>
  );
}

function CardBanner() {
  return (
    <header className="bg-primary text-primary-foreground relative px-4 pt-4 pb-14">
      <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
        <Image
          src={site.logos.federation}
          alt="Logo Liên đoàn Vovinam"
          width={48}
          height={48}
          className="size-12 rounded-full bg-white sm:size-14"
        />
        <div className="min-w-0 text-center">
          <p className="text-[10px] leading-snug font-medium tracking-wide opacity-80 sm:text-xs">
            {site.authority}
            <br />
            {site.federation}
          </p>
          <h1 className="mt-1.5 text-lg leading-none font-extrabold tracking-[0.15em] sm:text-2xl">
            {site.cardTitle}
          </h1>
          <p className="text-belt-yellow mt-1 text-[11px] font-semibold tracking-wide sm:text-sm">
            {site.cardSubtitle}
          </p>
        </div>
        <Image
          src={site.logos.vovinam}
          alt="Logo Vovinam"
          width={36}
          height={48}
          className="h-12 w-9 object-contain sm:h-14 sm:w-11"
        />
      </div>
    </header>
  );
}

function Profile({ student, className }: { student: Student; className?: string }) {
  const rank = currentRank(student.ranks);
  return (
    <section className={cn("flex flex-col items-center px-5 pb-6 text-center", className)}>
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

      <FieldList
        className="mt-5 w-full text-left"
        fields={[
          ["Năm sinh", student.birthYear?.toString()],
          ["Đơn vị", student.unit],
          ["Sinh hoạt tại", student.club],
          ["Số thẻ", student.cardNo],
        ]}
      />
    </section>
  );
}

function Photo({ src, name }: { src: string | null; name: string }) {
  const frame =
    "bg-muted relative -mt-11 block aspect-[3/4] w-32 overflow-hidden rounded-lg shadow-md ring-4 ring-white sm:w-36";
  if (!src) {
    return (
      <div className={frame}>
        <UserRound className="text-muted-foreground/50 absolute inset-0 m-auto size-14" />
      </div>
    );
  }
  // Chạm vào ảnh để xem ảnh lớn.
  return (
    <a href={src} target="_blank" rel="noopener" className={frame} aria-label={`Xem ảnh lớn của ${name}`}>
      <Image
        src={src}
        alt={`Ảnh ${name}`}
        width={300}
        height={400}
        priority
        className="size-full object-cover"
      />
    </a>
  );
}

function RanksSection({ student }: { student: Student }) {
  return (
    <section>
      <div className="bg-belt-yellow flex items-center gap-2.5 px-4 py-2.5 sm:px-5">
        <Image src={site.logos.vovinam} alt="" width={21} height={28} className="h-7 w-auto" />
        <h3 className="text-belt-red-ink text-sm font-extrabold tracking-wide">{site.ranksTitle}</h3>
      </div>
      <div className="p-4 sm:p-5">
        <RankList ranks={student.ranks} />
      </div>
    </section>
  );
}

/** Dựng các dòng "Hồ sơ môn sinh"; trường đặt "hide" bị bỏ hẳn, không hiện "—" gây hiểu nhầm là chưa khai. */
function recordRows(student: Student): RecordRow[] {
  const rows: RecordRow[] = [
    { label: "Thời gian tham gia tập luyện", value: student.trainingSince },
    { label: "Nhóm máu", value: student.bloodType, field: "bloodType" },
    { label: "Thường trú", value: student.address, field: "address" },
    { label: "CCCD", value: student.idNumber, field: "idNumber" },
    { label: "Điện thoại", value: student.phone, field: "phone" },
  ];
  return rows.filter(({ field }) => !field || site.privacy[field] !== "hide");
}

function AchievementsSection({ achievements }: { achievements: string[] }) {
  return (
    <section className="space-y-3 px-4 py-5 sm:px-5">
      <SectionHeading icon={Trophy}>Thành tích của VĐV</SectionHeading>
      {achievements.length > 0 ? (
        <ul className="space-y-2 text-sm">
          {achievements.map((a, i) => (
            <li key={i} className="flex gap-2.5">
              <Trophy aria-hidden className="text-belt-yellow mt-0.5 size-4 shrink-0 fill-current" />
              <span>{a}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">Chưa có thành tích được ghi nhận.</p>
      )}
    </section>
  );
}

function SignatureSection({ student, className }: { student: Student; className?: string }) {
  const { signer, issuedAt } = student;
  if (!signer && !issuedAt) return null;
  return (
    <section className={cn("space-y-3 px-5 py-5", className)}>
      <SectionHeading icon={Stamp}>Xác nhận</SectionHeading>
      <div className="text-center">
        {issuedAt && <p className="text-muted-foreground text-sm italic">{issuedAt}</p>}
        {signer?.onBehalfOf && <p className="mt-2 text-sm font-bold uppercase">{signer.onBehalfOf}</p>}
        {signer?.role && <p className="text-sm font-bold uppercase">{signer.role}</p>}
        {signer?.name && <p className="mt-3 text-base font-bold">{signer.name}</p>}
      </div>
    </section>
  );
}
