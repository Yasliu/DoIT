import { useRef } from "react";
import { updateAnnouncement, updateLabel as label, type AppUpdate } from "../../hooks/useAppUpdate";
import { useHoverCard } from "../../hooks/useHoverCard";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { readReleaseNotes } from "../../lib/releaseNotes";
import { APP_VERSION } from "../../lib/version";
import { cn } from "@/lib/utils";
import { Btn, Frame, Spin } from "../ui";

/** The top bar's update status, as text: `[↓ 1.2.5]`, `[⠋ 42%]`, `[restart]`, `[! update failed]`. */
export function UpdateStatus({ update }: { update: AppUpdate }) {
  const { state, act } = update;
  const trigger = useRef<HTMLButtonElement>(null);
  const card = useHoverCard(trigger);
  const reduce = useReducedMotion();
  const announced = (
    <span role="status" className="sr-only">
      {updateAnnouncement(state)}
    </span>
  );
  if (state.status === "none") return announced;

  const percent = state.status === "downloading" ? state.percent : null;
  const busy = state.status === "downloading" || state.status === "installing";
  // Without motion a spinner cannot turn: an arrow and the percentage say it instead.
  const lead = busy ? (reduce ? "↓" : <Spin />) : state.status === "available" ? "↓" : state.status === "error" ? "!" : null;
  const text = {
    available: state.version,
    downloading: percent === null ? "downloading" : `${percent}%`,
    installing: "installing",
    ready: "restart",
    error: "update failed",
  }[state.status];
  const notes = readReleaseNotes(state.notes);

  return (
    <div className="relative" {...card.props}>
      {announced}
      <Btn
        ref={trigger}
        variant={state.status === "ready" ? "primary" : state.status === "error" ? "danger" : "default"}
        lead={lead}
        aria-label={label(state)}
        aria-expanded={card.open}
        aria-controls={card.open ? card.cardId : undefined}
        onClick={act}
        className={state.status === "available" || busy ? "text-graph-accent" : undefined}
      >
        <span className="tabular-nums">{text}</span>
      </Btn>

      {card.open && (
        <div
          id={card.cardId}
          role="dialog"
          aria-label={label(state)}
          className="absolute right-0 top-full z-50 w-[380px] pt-2"
          onDoubleClick={(e) => e.stopPropagation()}
          style={{ animation: "tm-in 140ms var(--ease) both" }}
        >
          <Frame title="update" meta={`${APP_VERSION} → ${state.version}`} className="tm-layer px-[2.5ch] pb-4 pt-6" surface="var(--background)">
            {state.status !== "available" && (
              <div className="text-[13px]">
                {state.status === "downloading" && (percent === null ? "downloading…" : `downloading… ${percent}%`)}
                {state.status === "ready" && "your notes are saved first."}
                {state.status === "installing" && "installing, then DoIT restarts."}
                {state.status === "error" && <span className="text-destructive">{state.reason}</span>}
              </div>
            )}

            {notes.length > 0 && (
              <div
                className={cn(
                  "max-h-[220px] overflow-y-auto text-[13px] leading-relaxed text-graph-muted",
                  state.status !== "available" && "tm-rule-t mt-3 pt-3",
                )}
              >
                {notes.map((line, i) => (
                  <p key={i} className={line.kind === "heading" ? "mt-2 font-semibold text-foreground first:mt-0" : line.kind === "item" ? "flex gap-[1ch]" : undefined}>
                    {line.kind === "item" && <span className="text-graph-accent">-</span>}
                    <span>
                      {line.spans.map((span, j) =>
                        span.code ? (
                          <code key={j} className="text-graph-accent">
                            {span.text}
                          </code>
                        ) : span.strong ? (
                          <strong key={j} className="font-semibold text-foreground">
                            {span.text}
                          </strong>
                        ) : (
                          span.text
                        ),
                      )}
                    </span>
                  </p>
                ))}
              </div>
            )}

            {!busy && (
              <div className="mt-4 flex justify-end">
                <Btn
                  variant="primary"
                  onClick={() => {
                    // This button goes while the update works: keep focus (and the card) on the status.
                    trigger.current?.focus();
                    act();
                  }}
                >
                  {state.status === "available" ? "update" : state.status === "ready" ? "restart" : "retry"}
                </Btn>
              </div>
            )}
          </Frame>
        </div>
      )}
    </div>
  );
}
