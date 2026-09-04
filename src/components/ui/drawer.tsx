"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type DrawerTone = "light" | "dark";
export type DrawerWidth = "sm" | "md" | "lg";

const widthClass: Record<DrawerWidth, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
};

const toneStyles: Record<
  DrawerTone,
  { backdrop: string; panel: string; eyebrow: string; heading: string; subtitle: string; close: string }
> = {
  light: {
    backdrop: "bg-slate-900/30",
    panel: "bg-white text-slate-900",
    eyebrow: "text-sky-700",
    heading: "text-slate-900",
    subtitle: "text-slate-500",
    close: "text-slate-500 hover:text-slate-900",
  },
  dark: {
    backdrop: "bg-slate-950/30",
    panel: "bg-slate-950 text-white",
    eyebrow: "text-emerald-300",
    heading: "text-white",
    subtitle: "text-slate-400",
    close: "text-slate-400 hover:text-white",
  },
};

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  subtitle?: string;
  tone?: DrawerTone;
  width?: DrawerWidth;
  children: ReactNode;
}

/**
 * Right-anchored slide-over panel. Click-outside or the close button dismisses.
 * Escape closes. Body scroll is locked while open. Matches the recipe already
 * inlined in `app-shell.tsx` (system log) and `compare/page.tsx` (quote evidence).
 */
export function Drawer({
  open,
  onClose,
  title,
  eyebrow,
  subtitle,
  tone = "light",
  width = "md",
  children,
}: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const styles = toneStyles[tone];
  const titleId = `drawer-title-${title.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`;

  return (
    <div
      className={cn("fixed inset-0 z-50 flex justify-end", styles.backdrop)}
      role="presentation"
      onClick={onClose}
    >
      <aside
        className={cn(
          "flex h-full w-full flex-col overflow-y-auto shadow-2xl",
          widthClass[width],
          styles.panel,
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 p-6">
          <div>
            {eyebrow && (
              <p className={cn("text-xs font-bold uppercase tracking-[0.18em]", styles.eyebrow)}>
                {eyebrow}
              </p>
            )}
            <h2 id={titleId} className={cn("mt-2 text-xl font-semibold", styles.heading)}>
              {title}
            </h2>
            {subtitle && (
              <p className={cn("mt-1 text-sm", styles.subtitle)}>{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className={cn("text-sm font-medium", styles.close)}
            aria-label="Close drawer"
          >
            Close
          </button>
        </header>
        <div className="flex-1 px-6 pb-6">{children}</div>
      </aside>
    </div>
  );
}