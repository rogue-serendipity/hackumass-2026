"use client";

import { useEffect, useRef } from "react";
import { cardKey, type CardStatus } from "@/lib/runReducer";
import type { Lane as LaneName, StepEvent } from "@/lib/types";
import { StepCard } from "./StepCard";

interface Props {
  lane: LaneName;
  steps: StepEvent[];
  statuses: Record<string, CardStatus>;
  running: boolean;
  done: boolean;
}

const COPY: Record<LaneName, { title: string; sub: string; tone: string; dot: string }> = {
  worker: {
    title: "Worker",
    sub: "sees everything",
    tone: "text-worker",
    dot: "bg-worker",
  },
  shadow: {
    title: "Shadow",
    sub: "untrusted content withheld",
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

export function Lane({ lane, steps, statuses, running, done }: Props) {
  const copy = COPY[lane];
  const cards = toCards(steps);
  const scroller = useRef<HTMLOListElement>(null);

  // Keep the newest card in view while steps stream in.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [steps.length]);

  return (
    <section
      aria-label={`${copy.title} lane`}
      className="flex min-h-0 flex-col rounded-lg border border-line bg-panel"
    >
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <span className={`h-2.5 w-2.5 rounded-full ${copy.dot} ${running && !done ? "animate-pulse" : ""}`} />
        <h2 className="text-lg font-semibold">
          <span className={copy.tone}>{copy.title}</span>
          <span className="font-normal text-dim"> — {copy.sub}</span>
        </h2>
        <span className="ml-auto text-xs text-dim" aria-live="polite">
          {done ? "finished" : running ? "working…" : ""}
        </span>
      </header>
      <ol
        ref={scroller}
        className="flex h-[26rem] flex-col gap-2 overflow-y-auto p-3"
      >
        {cards.length === 0 && (
          <li className="m-auto text-sm text-dim">
            {running ? "Starting…" : "Steps appear here when you hit Run."}
          </li>
        )}
        {cards.map((card) =>
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
              className="card-in border-t border-line px-1 pt-3"
            >
              <p className={`text-[11px] font-semibold font-mono uppercase tracking-wider ${copy.tone}`}>
                Final summary
              </p>
              <p className="mt-1 text-sm leading-relaxed">{card.text}</p>
            </li>
          ),
        )}
      </ol>
    </section>
  );
}
