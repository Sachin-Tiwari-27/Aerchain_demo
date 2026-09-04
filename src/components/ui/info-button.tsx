"use client";

import { cn } from "@/lib/utils";

export function InfoButton({ label, onClick, className }: { label: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[11px] font-bold leading-none text-sky-700 hover:bg-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400",
        className,
      )}
    >
      i
    </button>
  );
}