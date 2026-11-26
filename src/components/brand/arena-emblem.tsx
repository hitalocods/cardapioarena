import { cn } from "@/lib/utils";

export function ArenaEmblem({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={cn("h-full w-full", className)}
    >
      <circle cx="60" cy="60" r="60" fill="#F5F8F4" />
      <circle cx="60" cy="60" r="52" fill="#EAF5E8" />
      {/* Sol da arena */}
      <circle cx="60" cy="44" r="18" fill="#A2CF9C" />
      <circle cx="60" cy="44" r="12" fill="#6FA967" />
      {/* Ondas / areia da quadra */}
      <path
        d="M16 74C28 66 42 66 56 73C70 80 86 80 104 70V100C92 109 77 114 60 114C43 114 28 109 16 100V74Z"
        fill="#A2CF9C"
      />
      <path
        d="M22 86C35 79 49 79 62 85C75 91 89 91 100 84V101C89 109 75 113 60 113C45 113 31 109 22 101V86Z"
        fill="#6FA967"
      />
      {/* Rede estilizada */}
      <path
        d="M32 64H88"
        stroke="#142614"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path
        d="M42 56V64M60 54V64M78 56V64"
        stroke="#142614"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
