import { CheckIcon } from "@phosphor-icons/react";
import type { CardStatus } from "@/lib/runReducer";
import type { StepEvent } from "@/lib/types";

type ToolCall = Extract<StepEvent, { type: "tool_call" }>;

interface Props {
  call: ToolCall;
  /** undefined until the matching tool_result arrives */
  result?: { value: unknown };
  status?: CardStatus;
}

const WITHHELD_PREFIX = "[Content withheld";

function show(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function argsInline(args: Record<string, unknown>) {
  return Object.entries(args)
    .map(([k, v]) => `${k}: ${show(v)}`)
    .join(", ");
}

/** A one-glance preview of a read-only tool's result. */
function preview(value: unknown): { text: string; withheld: boolean } {
  if (Array.isArray(value)) {
    return { text: `${value.length} ${value.length === 1 ? "item" : "items"}`, withheld: false };
  }
  if (value && typeof value === "object" && ("body" in value || "content" in value)) {
    const v = value as { body?: unknown; content?: unknown };
    const body = show(v.body ?? v.content);
    return { text: body, withheld: body.startsWith(WITHHELD_PREFIX) };
  }
  const text = value === undefined ? "" : show(value);
  return { text, withheld: text.startsWith(WITHHELD_PREFIX) };
}

function badge(status: CardStatus | undefined) {
  if (!status) return { text: "Queued for review", tone: "text-dim" };
  switch (status.kind) {
    case "worker_only":
      if (status.decision === "BLOCK")
        return {
          text: status.hardRule ? "Blocked by hard rule" : "Blocked by the Judge",
          tone: "text-danger",
        };
      if (status.decision === "APPROVE")
        return { text: "Only the Worker did this · approved", tone: "text-ok" };
      return { text: "Only the Worker did this · awaiting the Judge", tone: "text-worker" };
    case "matched":
      return { text: "Both agents did this", tone: "text-text" };
    case "arg_mismatch":
      return { text: "Same action, different details", tone: "text-text" };
    case "shadow_only":
      return { text: "Only the Shadow did this", tone: "text-dim" };
  }
}

function frame(status: CardStatus | undefined) {
  // Red is BLOCK only and green is APPROVE/committed only. Every other state
  // is neutral and told apart by its badge text.
  const neutral = "border-line bg-raised";
  if (!status) return `border-dashed ${neutral}`;
  if (status.decision === "BLOCK") return "border-danger bg-danger/10 alarm";
  if (status.decision === "APPROVE") return "border-ok/60 bg-ok/10";
  switch (status.kind) {
    case "worker_only":
      return "border-worker/70 bg-worker/10";
    case "matched":
      return status.committed ? "border-ok/60 bg-ok/10" : neutral;
    case "arg_mismatch":
    case "shadow_only":
      return neutral;
  }
}

/** What the Shadow got instead of an external email's body: shown, not just said. */
function Redacted({ page = false }: { page?: boolean }) {
  return (
    <div className="mt-1.5">
      <div aria-hidden className="flex flex-col gap-1">
        <span className="h-2.5 w-11/12 rounded-xs bg-dim/35" />
        <span className="h-2.5 w-8/12 rounded-xs bg-dim/35" />
      </div>
      <p className="mt-1.5 font-mono text-xs text-dim">
        {page
          ? "Page withheld: external website. The Shadow sees only its address and title."
          : "Body withheld: external sender. The Shadow sees only who sent it, the subject and the time."}
      </p>
    </div>
  );
}

export function StepCard({ call, result, status }: Props) {
  const { tool, args, sensitive } = call.data;

  if (!sensitive) {
    const p = result ? preview(result.value) : null;
    return (
      <li className="card-in px-1 py-0.5">
        <p className="truncate font-mono text-sm">
          <span className="text-text">{tool}</span>
          <span className="text-dim">({argsInline(args)})</span>
        </p>
        {p && p.withheld ? (
          <Redacted page={tool === "open_page"} />
        ) : (
          p && p.text && <p className="mt-1 line-clamp-2 text-sm text-dim">{p.text}</p>
        )}
      </li>
    );
  }

  const b = badge(status);
  return (
    <li
      // Marks the card that made the lanes diverge; the lane scrolls back to it.
      data-divergent={status?.kind === "worker_only" ? "1" : undefined}
      data-decision={status?.decision}
      className={`card-in rounded-sm border-2 px-3 py-2.5 transition-colors duration-500 ${frame(status)}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="font-mono text-base font-semibold">{tool}</p>
        <p className="text-[11px] font-semibold font-mono uppercase tracking-wider text-dim">
          Sensitive action
        </p>
      </div>
      <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
        {Object.entries(args).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-mono text-dim">{k}</dt>
            <dd className="line-clamp-2 break-words font-mono">{show(v)}</dd>
          </div>
        ))}
      </dl>
      <p className={`mt-2 text-sm font-semibold ${b.tone}`}>
        {b.text}
        {status?.committed && (
          <span className="text-ok">
            {" · "}
            <CheckIcon weight="bold" aria-hidden className="inline align-[-0.125em]" /> committed
          </span>
        )}
      </p>
      {status?.fields && status.fields.length > 0 && (
        <p className="text-xs text-dim">
          Differs between lanes in: {status.fields.join(", ")}
        </p>
      )}
    </li>
  );
}
