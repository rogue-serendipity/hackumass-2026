"use client";

import { useEffect, useRef } from "react";
import { cardKey, type CardStatus, type RunState } from "@/lib/runReducer";
import type { Lane as LaneName, ProposedAction, StepEvent } from "@/lib/types";
import { seconds, useNow } from "@/lib/useNow";
import { Markdown } from "./Markdown";
import { StepCard } from "./StepCard";

interface Props {
  lane: LaneName;
  steps: StepEvent[];
  statuses: Record<string, CardStatus>;
  runStatus: RunState["status"];
  done: boolean;
  startedAt: number | null;
  doneAt: number | null;
  /** Set when a Patcher rule blocked the run, so this lane never ran. */
  skippedByRule?: number | null;
  /** Actions the other lane took that this one never did; shown as gaps. */
  missing?: ProposedAction[];
  /** Says what this lane can read, e.g. "Can't read 3 external emails". */
  sub?: string;
}

/** Where an action was aimed, for the gap card's one-line description. */
function targetOf(a: ProposedAction): string {
  const t = a.args.with_email ?? a.args.to;
  return typeof t === "string" ? t : "";
}

function Gap({ action, status }: { action: ProposedAction; status?: CardStatus }) {
  const target = targetOf(action);
  // Red is for BLOCK only, so the gap stays neutral until the Judge blocks.
  const blocked = status?.decision === "BLOCK";
  return (
    <li
      data-divergent="1"
      className={`ghost-in rounded-sm border-2 border-dashed px-3 py-2.5 ${
        blocked ? "border-danger/50" : "border-line"
      }`}
    >
      <p
        className={`font-mono text-base font-semibold text-dim line-through ${
          blocked ? "decoration-danger/70" : "decoration-dim"
        }`}
      >
        {action.tool}
      </p>
      <p className="mt-1 text-sm text-dim">
        The Shadow never did this{target && <> · <span className="font-mono">{target}</span></>}
      </p>
      <p className={`mt-1 text-sm font-semibold ${blocked ? "text-danger" : "text-text"}`}>
        The lanes split here{status?.decision === "APPROVE" && " · the Judge allowed it"}
      </p>
    </li>
  );
}

const COPY: Record<LaneName, { title: string; sub: string; tone: string; dot: string }> = {
  worker: {
    title: "Worker",
    sub: "Sees everything",
    tone: "text-worker",
    dot: "bg-worker",
  },
  shadow: {
    title: "Shadow",
    sub: "Untrusted content withheld",
    tone: "text-text",
    dot: "bg-dim",
  },
};

type ToolCall = Extract<StepEvent, { type: "tool_call" }>;
type Card =
  | { kind: "call"; call: ToolCall; result?: { value: unknown } }
  | { kind: "message"; index: number; text: string };

/** Fold each tool_result into the tool_call card before it. */
function toCards(steps: StepEvent[]): Card[] {
  const cards: Card[] = [];
  for (const step of steps) {
    if (step.type === "tool_call") {
      cards.push({ kind: "call", call: step });
    } else if (step.type === "tool_result") {
      const open = cards.findLast(
        (c) => c.kind === "call" && !c.result && c.call.data.tool === step.data.tool,
      );
      if (open?.kind === "call") open.result = { value: step.data.result };
    } else {
      cards.push({ kind: "message", index: step.index, text: step.data.text });
    }
  }
  return cards;
}

export function Lane({
  lane,
  steps,
  statuses,
  runStatus,
  done,
  startedAt,
  doneAt,
  skippedByRule = null,
  missing = [],
  sub,
}: Props) {
  const copy = COPY[lane];
  const cards = toCards(steps);
  // Gaps go just before the final summary, where the other lane's action sits.
  const summaryAt = cards.findIndex((c) => c.kind === "message");
  const gapsAt = summaryAt === -1 ? cards.length : summaryAt;
  const scroller = useRef<HTMLOListElement>(null);
  const running = runStatus === "running";
  const working = running && !done;
  const now = useNow(working);

  // Keep the newest card in view while steps stream in. A final summary is
  // long, so show its start rather than its end.
  useEffect(() => {
    const el = scroller.current;
    const last = el?.lastElementChild as HTMLElement | null;
    if (!el || !last) return;
    const top = last.dataset.summary ? last.offsetTop - 12 : el.scrollHeight;
    el.scrollTo({ top, behavior: "smooth" });
  }, [steps.length]);

  // Once the diff is in, the card the audience needs to see is the one only the
  // Worker proposed, not the final summary. Scroll back up to it.
  useEffect(() => {
    const el = scroller.current;
    const card = el?.querySelector<HTMLElement>("[data-divergent]");
    if (el && card) el.scrollTo({ top: card.offsetTop - 12, behavior: "smooth" });
  }, [statuses]);

  let status = "";
  if (skippedByRule !== null) status = "Skipped";
  else if (working) status = startedAt ? `Working… ${seconds(now - startedAt)}` : "Working…";
  else if (done) status = startedAt && doneAt ? `Finished in ${seconds(doneAt - startedAt, true)}` : "Finished";
  else if (runStatus === "done") status = "Stopped";

  return (
    <section
      aria-label={`${copy.title} lane`}
      className="flex min-h-0 flex-col rounded-lg border border-line bg-panel"
    >
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <span className={`h-2.5 w-2.5 rounded-full ${copy.dot} ${working ? "motion-safe:animate-pulse" : ""}`} />
        <h2 className={`text-lg font-semibold ${copy.tone}`}>{copy.title}</h2>
        <p className="text-sm text-dim">{sub ?? copy.sub}</p>
        <span className="ml-auto font-mono text-sm tabular-nums text-dim">{status}</span>
      </header>
      <ol
        ref={scroller}
        className="relative flex h-[26rem] flex-col gap-2 overflow-y-auto p-3"
      >
        {cards.length === 0 && (
          <li className="m-auto text-sm text-dim">
            {skippedByRule !== null
              ? `Skipped: rule${skippedByRule ? ` #${skippedByRule}` : ""} blocked this inbox before the agents ran.`
              : running
              ? "Starting…"
              : runStatus === "done"
                ? "No steps before the run stopped."
                : "Steps appear here when you hit Run."}
          </li>
        )}
        {cards.map((card, i) => [
          i === gapsAt && missing.map((a) => <Gap key={`gap-${a.index}`} action={a} status={statuses[cardKey(a.lane, a.step_index)]} />),
          card.kind === "call" ? (
            <StepCard
              key={card.call.index}
              call={card.call}
              result={card.result}
              status={statuses[cardKey(lane, card.call.index)]}
            />
          ) : (
            <li
              key={card.index}
              data-summary="1"
              className="card-in border-t border-line px-1 pt-3"
            >
              <p className={`font-mono text-xs font-semibold uppercase tracking-wider ${copy.tone}`}>
                Final summary
              </p>
              <Markdown text={card.text} className="mt-1 leading-relaxed" />
            </li>
          ),
        ])}
        {gapsAt === cards.length && missing.map((a) => <Gap key={`gap-${a.index}`} action={a} status={statuses[cardKey(a.lane, a.step_index)]} />)}
      </ol>
    </section>
  );
}
