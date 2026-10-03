import { Fragment, type ReactNode } from "react";
import { Lock, type LucideIcon } from "lucide-react";

import { isMasked } from "@/lib/privacy";
import { cn } from "@/lib/utils";

export type Field = [label: string, value: string | null | undefined];

/**
 * Danh sách "nhãn — giá trị". Ô trống hiện "—" để người xem biết mục đó có trên thẻ nhưng chưa điền.
 * layout="stacked": nhãn nằm trên giá trị, xếp 2 cột, hợp với chỗ hẹp trên điện thoại.
 */
export function FieldList({
  fields,
  layout = "rows",
  className,
}: {
  fields: Field[];
  layout?: "rows" | "stacked";
  className?: string;
}) {
  if (layout === "stacked") {
    return (
      <dl className={cn("grid grid-cols-2 gap-x-4 gap-y-3 text-sm leading-snug lg:grid-cols-3", className)}>
        {fields.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="mt-0.5 font-medium break-words">
              <Value value={value} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <dl
      className={cn(
        "grid grid-cols-[minmax(6.5rem,38%)_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm leading-snug",
        className,
      )}
    >
      {fields.map(([label, value]) => (
        <Fragment key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 font-medium break-words">
            <Value value={value} />
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}

function Value({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-muted-foreground font-normal">—</span>;
  return (
    <>
      {value}
      {isMasked(value) && (
        <Lock
          aria-label="Đã che một phần"
          className="text-muted-foreground ml-1.5 inline size-3.5 align-[-2px]"
        />
      )}
    </>
  );
}

export function SectionHeading({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <h3 className="text-muted-foreground flex items-center gap-2 text-xs font-semibold tracking-wider uppercase">
      <Icon aria-hidden className="text-primary size-4" />
      {children}
    </h3>
  );
}
