import type { ReactNode } from "react";
import { CircleCheck } from "lucide-react";

import { BeltIcon } from "@/components/belt-icon";
import { FieldList } from "@/components/field-list";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { currentRank, isAchieved, type Rank } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Các cấp đai dạng xổ xuống; mặc định mở sẵn cấp cao nhất đã đạt. */
export function RankList({ ranks }: { ranks: Rank[] }) {
  const current = currentRank(ranks);
  const valueOf = (r: Rank) => `rank-${ranks.indexOf(r)}`;

  return (
    <Accordion
      type="multiple"
      defaultValue={current ? [valueOf(current)] : []}
      className="space-y-2"
    >
      {ranks.map((rank) => {
        const achieved = isAchieved(rank);
        return (
          <AccordionItem
            key={valueOf(rank)}
            value={valueOf(rank)}
            className={cn(
              "rounded-lg border px-3 last:border-b",
              achieved ? "bg-secondary/50" : "border-dashed",
            )}
          >
            <AccordionTrigger className="min-w-0 items-center py-3 hover:no-underline">
              {/* Bọc span: trigger xoay mọi svg con trực tiếp, chỉ mũi tên được xoay. */}
              {/* Màn hẹp: tên đai xuống dòng, nhãn trạng thái rơi xuống dưới, không cắt mất chữ. */}
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                <BeltIcon
                  color={rank.color}
                  stripes={rank.stripes}
                  muted={!achieved}
                  className="h-3.5 w-11 sm:h-4 sm:w-14"
                />
                <span
                  className={cn(
                    "min-w-0 text-[15px] break-words",
                    achieved ? "font-semibold" : "text-muted-foreground font-normal",
                  )}
                >
                  {rank.name}
                </span>
                {achieved ? (
                  <Badge className="bg-success text-success-foreground ml-auto border-transparent">
                    <CircleCheck />
                    Đã đạt
                  </Badge>
                ) : (
                  <span className="text-muted-foreground ml-auto text-xs font-normal">Chưa đạt</span>
                )}
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pt-1">
              <RankGroup title="Công nhận">
                <FieldList
                  layout="stacked"
                  fields={[
                    ["Ngày thi", rank.examDate],
                    ["Số QĐ CN", rank.decisionNo],
                    ["Giám khảo chấm thi", rank.examiners.join(", ")],
                  ]}
                />
              </RankGroup>
              <RankGroup title="Hồ sơ cấp đai">
                <FieldList
                  layout="stacked"
                  fields={[
                    ["Kế hoạch kiểm tra", rank.plan],
                    ["Thời gian kiểm tra", rank.testDate],
                    ["Địa điểm kiểm tra", rank.testPlace],
                    ["Quyết định giám khảo", rank.examinerDecision],
                    ["Quyết định công nhận", rank.recognitionDecision],
                    ["HLV trực tiếp giảng dạy", rank.coach],
                  ]}
                />
              </RankGroup>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}

function RankGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-belt-red-ink mb-2 text-xs font-bold tracking-wide uppercase">{title}</p>
      {children}
    </div>
  );
}
