"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: DialogProps) {
  React.useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 backdrop-blur-xs sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={() => onOpenChange(false)}
    >
      <div
        className={cn(
          "glass-bar relative flex h-dvh max-h-dvh w-full flex-col overflow-hidden rounded-none sm:h-auto sm:max-h-[90dvh] sm:max-w-lg sm:rounded-[1.75rem]",
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-3 pt-[calc(1rem+env(safe-area-inset-top))] sm:px-6 sm:pt-6">
          <div className="min-w-0">
            {title && (
              <h2 className="break-words text-xl font-bold tracking-tight text-[var(--foreground)]">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-1 break-words text-sm text-[var(--muted-foreground)]">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Fechar"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/5 text-[var(--foreground)] hover:bg-black/10 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 sm:px-6">
          {children}
        </div>

        {footer && (
          <div className="shrink-0 border-t border-[var(--border)] bg-[var(--surface-glass-strong)] px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
