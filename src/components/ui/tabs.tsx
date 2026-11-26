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
  return (
    <div
      role="tablist"
      className={cn(
        "flex w-full gap-1.5 overflow-x-auto rounded-2xl bg-white/70 p-1.5 border border-[var(--border)] shadow-xs",
        className
      )}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onValueChange(item.value)}
            className={cn(
              "inline-flex flex-1 min-w-fit items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all cursor-pointer",
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
          </button>
        );
      })}
    </div>
  );
}
