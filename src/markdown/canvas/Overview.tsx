import { useMemo } from "react";
import type { NoteItem } from "../../api/tauriBridge";
import { GraphActivity } from "@/registry/default/graph-activity/graph-activity";
import { GraphCheck } from "@/registry/default/graph-check/graph-check";
import { GraphKpi } from "@/registry/default/graph-kpi/graph-kpi";
import { GraphMeter } from "@/registry/default/graph-meter/graph-meter";
import { GraphRank } from "@/registry/default/graph-rank/graph-rank";
import { GraphStat } from "@/registry/default/graph-stat/graph-stat";
import { GraphTimeline } from "@/registry/default/graph-timeline/graph-timeline";
import { shelfMark } from "../../lib/shelfMarks";
import { cleanText, relativeShort } from "../../lib/text";

interface OverviewProps {
  notes: NoteItem[];
  shelves: string[];
}

const DAY = 86_400_000;

/** A local calendar day as YYYY-MM-DD. */
function isoDay(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * The workspace at a glance, drawn entirely with the registry's figures: counts, when notes were last
 * touched, how full each shelf is, and what is still open.
 */
export function Overview({ notes, shelves }: OverviewProps) {
  const data = useMemo(() => {
    const desk = notes.filter((n) => !n.is_settled);
    const tasks = desk.flatMap((n) => n.content.filter((c) => c.is_todo).map((c) => ({ item: c, note: n })));
    const done = tasks.filter((t) => t.item.completed).length;

    // Each note counts once, on the day it was last edited.
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const span = 7 * 22;
    const perDay = new Map<string, number>();
    for (const n of notes) perDay.set(isoDay(n.last_edited), (perDay.get(isoDay(n.last_edited)) ?? 0) + 1);
    const days = Array.from({ length: span }, (_, i) => {
      const date = isoDay(today.getTime() - (span - 1 - i) * DAY);
      return { date, count: perDay.get(date) ?? 0 };
    });
    const lastTwoWeeks = days.slice(-14).map((d) => d.count);
    const thisWeek = lastTwoWeeks.slice(-7).reduce((a, b) => a + b, 0);
    const lastWeek = lastTwoWeeks.slice(0, 7).reduce((a, b) => a + b, 0);

    const ranked = shelves
      .map((shelf) => ({ label: `${shelfMark(shelf)} ${cleanText(shelf)}`, value: desk.filter((n) => (n.category || "Uncategorized") === shelf).length }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    const recent = [...notes].sort((a, b) => b.last_edited - a.last_edited).slice(0, 6);
    const open = tasks.filter((t) => !t.item.completed).slice(0, 7);
    const closed = tasks.filter((t) => t.item.completed).slice(0, 3);

    return { desk, tasks, done, days, lastTwoWeeks, thisWeek, lastWeek, ranked, recent, open, closed };
  }, [notes, shelves]);

  const plain = (text: string) => text.replace(/^\s*[-*+]\s+\[[ xX]\]\s*/, "").replace(/[*_`~=]/g, "").trim() || "untitled task";
  const delta = data.thisWeek - data.lastWeek;

  return (
    <div className="h-full overflow-y-auto" style={{ scrollbarGutter: "stable" }}>
      <div className="mx-auto w-full max-w-[1180px] px-12 pb-32 pt-12">
        <h1 className="text-[24px] font-semibold leading-tight">Overview</h1>

        <div className="mt-12 grid grid-cols-1 gap-x-10 gap-y-14 lg:grid-cols-2">
          <GraphStat
            title="workspace"
            className="lg:col-span-2"
            items={[
              { value: data.desk.length, label: "notes", accent: true },
              { value: shelves.length, label: "shelves" },
              { value: data.tasks.length - data.done, label: "open tasks" },
              { value: notes.length - data.desk.length, label: "settled" },
            ]}
          />

          <GraphActivity
            title="last edited"
            className="lg:col-span-2"
            days={data.days}
            weekStartsOn={1}
            caption={false}
            palette="duo"
          />

          <GraphKpi
            title="this week"
            value={String(data.thisWeek)}
            label="notes edited"
            hint={`${delta >= 0 ? "+" : ""}${delta} vs last week`}
            data={data.lastTwoWeeks}
          />

          <GraphMeter
            title="tasks"
            value={data.tasks.length ? data.done / data.tasks.length : 0}
            caption={data.tasks.length ? `${data.done} of ${data.tasks.length}` : "No tasks yet. Type [] at the start of a line."}
            ticks={20}
          />

          {data.ranked.length > 0 && <GraphRank title="shelves" items={data.ranked} ticks={18} />}

          {data.recent.length > 0 && (
            <GraphTimeline
                title="recent"
                events={data.recent.map((note, i) => ({
                  date: relativeShort(note.last_edited),
                  label: cleanText(note.title) || "Untitled",
                  note: `${shelfMark(note.category)} ${cleanText(note.category)}`,
                  state: i === 0 ? "now" : "done",
                }))}
              />
          )}

          {data.tasks.length > 0 && (
            <GraphCheck
              title="open tasks"
              items={[
                ...data.open.map((t) => ({ label: plain(t.item.text), note: cleanText(t.note.title) || "untitled", done: false })),
                ...data.closed.map((t) => ({ label: plain(t.item.text), note: cleanText(t.note.title) || "untitled", done: true })),
              ]}
            />
          )}

        </div>
      </div>
    </div>
  );
}
