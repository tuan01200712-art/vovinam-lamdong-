import type { BeltColor } from "@/lib/types";
import { cn } from "@/lib/utils";

const BELT_FILL: Record<BeltColor, string> = {
  blue: "var(--belt-blue)",
  yellow: "var(--belt-yellow)",
  red: "var(--belt-red)",
  white: "var(--belt-white)",
};

// Vạch cấp: Lam đai gạch vàng, Hoàng đai gạch đỏ, Hồng đai gạch trắng.
const STRIPE_FILL: Record<BeltColor, string> = {
  blue: "var(--belt-yellow)",
  yellow: "var(--belt-red)",
  red: "var(--belt-white)",
  white: "var(--belt-blue)",
};

export function BeltIcon({
  color,
  stripes,
  muted = false,
  className,
}: {
  color: BeltColor;
  stripes: number;
  muted?: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 56 16"
      aria-hidden
      className={cn("h-4 w-14 shrink-0", muted && "opacity-25 grayscale", className)}
    >
      <rect
        x="0.5"
        y="0.5"
        width="55"
        height="15"
        rx="3"
        fill={BELT_FILL[color]}
        stroke="rgb(0 0 0 / 0.15)"
      />
      {Array.from({ length: stripes }, (_, i) => (
        <rect key={i} x={44 - i * 7} y="0.5" width="4" height="15" fill={STRIPE_FILL[color]} />
      ))}
    </svg>
  );
}
