import type { ReactNode } from "react";

type TooltipProps = {
  label: string;
  tip: string;
  children: ReactNode;
  className?: string;
};

/** Hover bubble + native title for accessibility. */
export function Tooltip({ label, tip, children, className }: TooltipProps) {
  const id = `p2-tip-${label.replace(/\W+/g, "-").slice(0, 40)}`;
  return (
    <span className={`products2Tooltip ${className ?? ""}`.trim()} data-tip={tip}>
      <span className="products2Tooltip-wrap" aria-describedby={id}>
        {children}
      </span>
      <span id={id} role="tooltip" className="products2Tooltip-bubble">
        {tip}
      </span>
    </span>
  );
}
