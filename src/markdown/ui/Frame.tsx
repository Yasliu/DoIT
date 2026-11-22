import type { CSSProperties, ElementType, ReactNode } from "react";
import { GraphCorners } from "@/registry/default/graph-frame/graph-frame";
import { cn } from "@/lib/utils";

interface FrameProps {
  /** Drawn on the top edge as `[ TITLE ]`. */
  title?: ReactNode;
  /** Muted text on the top edge, at the right (a time, a count). */
  meta?: ReactNode;
  /** Muted text on the bottom edge, at the right. */
  foot?: ReactNode;
  align?: "left" | "center";
  /** Uppercase the title, as the figures do. Note titles keep their case. */
  caps?: boolean;
  corner?: string;
  /** Draw the corner marks (default). Cards leave them off. */
  corners?: boolean;
  /** `box`: dashed border with corner marks; `corners`: marks only; `none`: neither. */
  variant?: "box" | "corners" | "none";
  /** The colour behind the frame, which the edge labels paint over the dashed line with. */
  surface?: string;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  [rest: string]: unknown;
}

/**
 * The figures' frame (dashed edge, `+` corners, `[ TITLE ]` on the top edge) for the app's own
 * panels and cards. Built on the registry's corners; the title sits left by default so long note
 * titles have room.
 */
export function Frame({
  title,
  meta,
  foot,
  align = "left",
  caps = true,
  corner = "+",
  corners = true,
  variant = "box",
  surface,
  as: Tag = "section",
  className,
  style,
  children,
  ...rest
}: FrameProps) {
  const edge = "absolute z-10 whitespace-nowrap bg-[var(--graph-surface,var(--background))] px-[1ch] leading-none";
  return (
    <Tag
      className={cn("relative", variant === "box" && "graph-frame", className)}
      style={surface ? ({ ...style, "--graph-surface": surface } as CSSProperties) : style}
      {...rest}
    >
      {variant !== "none" && corners && <GraphCorners mark={corner} />}
      {title != null && title !== "" && (
        <span
          className={cn(
            edge,
            "top-0 -translate-y-1/2 truncate text-graph-accent",
            meta != null && meta !== "" ? "max-w-[calc(100%-13ch)]" : "max-w-[calc(100%-6ch)]",
            align === "center" ? "left-1/2 -translate-x-1/2" : "left-[2ch]",
            caps && "uppercase tracking-wide",
          )}
        >
          [ {title} ]
        </span>
      )}
      {meta != null && meta !== "" && <span className={cn(edge, "right-[2ch] top-0 -translate-y-1/2 text-[11px] text-graph-muted")}>{meta}</span>}
      {foot != null && foot !== "" && <span className={cn(edge, "bottom-0 right-[2ch] translate-y-1/2 text-[11px] text-graph-muted")}>{foot}</span>}
      {children}
    </Tag>
  );
}
