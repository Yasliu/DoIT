import { useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, RotateCw, TriangleAlert } from "lucide-react";
import { updateAnnouncement, updateLabel as label, type AppUpdate, type UpdateState } from "../../hooks/useAppUpdate";
import { useHoverCard } from "../../hooks/useHoverCard";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { readReleaseNotes } from "../../lib/releaseNotes";

const RADIUS = 10;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** The ring around the icon: full while offered, filling while downloading, turning while busy. */
function Ring({ state }: { state: UpdateState }) {
  const busy = state.status === "installing" || (state.status === "downloading" && state.percent === null);
  const fill = state.status === "downloading" && state.percent !== null ? state.percent / 100 : null;
  return (
    <svg className="ui-update-ring" data-busy={busy || undefined} viewBox="0 0 24 24" aria-hidden="true">
      <circle className="ui-update-track" cx="12" cy="12" r={RADIUS} />
      {(busy || fill !== null) && (
        <circle
          className="ui-update-arc"
          cx="12"
          cy="12"
          r={RADIUS}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - (fill ?? 0.25))}
        />
      )}
    </svg>
  );
}

/**
 * The modern sidebar's update control: nothing until there is an update, then one small icon.
 * `showIcon` is off while the sidebar is collapsed; changes are still announced.
 */
export function UpdateButton({ update, showIcon }: { update: AppUpdate; showIcon: boolean }) {
  const { state, act } = update;
  const trigger = useRef<HTMLButtonElement>(null);
  const card = useHoverCard(trigger);
  const reduce = useReducedMotion();
  const [at, setAt] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    const box = trigger.current?.getBoundingClientRect();
    if (card.open && box) setAt({ top: box.bottom + 8, left: Math.max(8, box.left - 8) });
  }, [card.open]);

  const announced = (
    <span role="status" className="sr-only">
      {updateAnnouncement(state)}
    </span>
  );
  if (state.status === "none" || !showIcon) return announced;
  const percent = state.status === "downloading" ? state.percent : null;
  const notes = readReleaseNotes(state.notes);

  return (
    <>
      {announced}
      <button
        ref={trigger}
        type="button"
        className="ui-icon-button ui-update"
        data-status={state.status}
        aria-label={label(state)}
        aria-expanded={card.open}
        aria-controls={card.open ? card.cardId : undefined}
        onClick={act}
        {...card.props}
      >
        {state.status === "ready" ? (
          <>
            <RotateCw size={14} />
            <span>Restart</span>
          </>
        ) : state.status === "error" ? (
          <TriangleAlert size={15} />
        ) : (
          <>
            <Ring state={state} />
            {/* Without motion the ring cannot show it is busy: say how far instead. */}
            {reduce && percent !== null ? <span className="ui-update-percent">{percent}</span> : <ArrowDown size={12} strokeWidth={2.4} />}
          </>
        )}
      </button>

      {card.open && (
        <div id={card.cardId} className="ui-update-card" role="dialog" aria-label={label(state)} style={at} {...card.props}>
          <div className="ui-update-head">
            <span className="ui-update-title">DoIT {state.version}</span>
            <span className="ui-update-status">
              {state.status === "available" && "Update available"}
              {state.status === "downloading" && (percent === null ? "Downloading…" : `Downloading… ${percent}%`)}
              {state.status === "ready" && "Downloaded"}
              {state.status === "installing" && "Installing…"}
              {state.status === "error" && "Update failed"}
            </span>
          </div>

          {state.status === "error" && <p className="ui-update-error">{state.reason}</p>}

          {notes.length > 0 && (
            <div className="ui-update-notes">
              {notes.map((line, i) => {
                const Tag = line.kind === "heading" ? "h4" : "p";
                return (
                  <Tag key={i} className={line.kind === "item" ? "ui-update-item" : undefined}>
                    {line.spans.map((span, j) =>
                      span.code ? <code key={j}>{span.text}</code> : span.strong ? <strong key={j}>{span.text}</strong> : span.text,
                    )}
                  </Tag>
                );
              })}
            </div>
          )}

          {(state.status === "available" || state.status === "ready" || state.status === "error") && (
            <div className="ui-update-foot">
              <span className="ui-update-hint">{state.status === "ready" && "Your notes are saved first."}</span>
              <button
                type="button"
                className="btn"
                data-variant="primary"
                onClick={() => {
                  // This button goes while the update works: keep focus (and the card) on the icon.
                  trigger.current?.focus();
                  act();
                }}
              >
                {state.status === "available" ? "Update" : state.status === "ready" ? "Restart" : "Retry"}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
