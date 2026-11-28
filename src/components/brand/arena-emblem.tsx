import { cn } from "@/lib/utils";

export function ArenaEmblem({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt="Arena Home Beach"
      className={cn("h-full w-full object-contain p-1.5", className)}
    />
  );
}
