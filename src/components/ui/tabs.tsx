"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface TabsProps {
  value: string;
  onValueChange: (value: string) => void;
  items: Array<{
    value: string;
    label: string;
    badge?: number;
    alertBadge?: string;
    icon?: React.ReactNode;
  }>;
  className?: string;
}

export function TabsBar({
  value,
  onValueChange,
  items,
  className,
}: TabsProps) {
  const tabRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});

  React.useEffect(() => {
    const activeEl = tabRefs.current[value];
    if (activeEl) {
      activeEl.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
    }
  }, [value]);

  return (
    <div
      role="tablist"
      className={cn(
        "flex w-full gap-1.5 overflow-x-auto scroll-smooth rounded-2xl border border-[var(--border)] bg-white/70 p-1.5 shadow-xs",
        className
      )}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            ref={(el) => {
              tabRefs.current[item.value] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onValueChange(item.value)}
            className={cn(
              "inline-flex min-h-11 flex-1 min-w-fit items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition-all cursor-pointer",
              active
                ? "bg-[var(--brand-primary)] text-[var(--brand-primary-foreground)] shadow-xs"
                : "text-[var(--muted-foreground)] hover:bg-white/70 hover:text-[var(--foreground)]"
            )}
          >
            {item.icon}
            <span>{item.label}</span>
            {typeof item.badge === "number" && item.badge > 0 && (
              <span
                className={cn(
                  "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-bold",
                  active
                    ? "bg-[var(--brand-primary-foreground)] text-white"
                    : "bg-[var(--brand-primary-soft)] text-[var(--brand-primary-foreground)]"
                )}
              >
                {item.badge}
              </span>
            )}
            {item.alertBadge && (
              <span className="inline-flex items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-black text-white">
                {item.alertBadge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
