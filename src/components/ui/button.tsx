import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-semibold transition-all active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--brand-primary)] text-[var(--brand-primary-foreground)] hover:bg-[var(--brand-primary-strong)] hover:text-white shadow-sm",
        secondary:
          "bg-[var(--secondary)] text-[var(--secondary-foreground)] hover:bg-[var(--accent)]",
        outline:
          "border border-[var(--border)] bg-white/80 text-[var(--foreground)] hover:bg-white",
        ghost:
          "text-[var(--foreground)] hover:bg-[var(--secondary)]/80",
        destructive:
          "bg-[var(--destructive)] text-[var(--destructive-foreground)] hover:opacity-90 shadow-sm",
      },
      size: {
        default: "min-h-11 px-5 py-2.5",
        sm: "min-h-11 sm:min-h-9 h-auto sm:h-9 rounded-xl px-3.5 py-2 sm:py-0 text-xs",
        lg: "min-h-13 rounded-2xl px-6 text-base",
        xl: "min-h-14 rounded-2xl px-6 text-lg font-bold",
        icon: "h-11 w-11 sm:h-10 sm:w-10 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
);
Button.displayName = "Button";
