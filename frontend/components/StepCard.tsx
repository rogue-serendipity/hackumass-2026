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
  if (value && typeof value === "object" && "body" in value) {
    const body = show((value as { body: unknown }).body);
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
      return { text: "Only the Worker did this", tone: "text-danger" };
    case "matched":
      return { text: "Both agents did this", tone: "text-ok" };
    case "arg_mismatch":
      return { text: "Same action, different details", tone: "text-warn" };
    case "shadow_only":
      return { text: "Only the Shadow did this", tone: "text-dim" };
  }
}

function frame(status: CardStatus | undefined) {
  if (!status) return "border-warn/40 bg-warn/5";
  switch (status.kind) {
    case "worker_only":
      return status.decision === "APPROVE"
        ? "border-ok/60 bg-ok/10"
        : "border-danger bg-danger/10 alarm";
    case "matched":
      return "border-ok/60 bg-ok/10";
    case "arg_mismatch":
      return "border-warn/60 bg-warn/10";
    case "shadow_only":
      return "border-line bg-raised";
  }
}

export function StepCard({ call, result, status }: Props) {
  const { tool, args, sensitive } = call.data;

  if (!sensitive) {
    const p = result ? preview(result.value) : null;
    return (
      <li className="card-in rounded-lg border border-line bg-raised px-3 py-2">
        <p className="truncate font-mono text-sm">
          <span className="text-text">{tool}</span>
          <span className="text-dim">({argsInline(args)})</span>
        </p>
        {p && p.text && (
          <p
            className={`mt-1 line-clamp-2 text-sm ${
              p.withheld ? "italic text-shadow" : "text-dim"
            }`}
          >
            {p.text}
          </p>
        )}
      </li>
    );
  }

  const b = badge(status);
  return (
    <li
      className={`card-in rounded-lg border-2 px-3 py-2.5 transition-colors duration-500 ${frame(status)}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="font-mono text-base font-semibold">{tool}</p>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-warn">
          Sensitive action
        </p>
      </div>
      <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
        {Object.entries(args).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-mono text-dim">{k}</dt>
            <dd className="line-clamp-2 break-words">{show(v)}</dd>
          </div>
        ))}
      </dl>
      <p className={`mt-2 text-sm font-semibold ${b.tone}`}>
        {b.text}
        {status?.committed && <span className="text-ok"> · ✓ committed</span>}
      </p>
      {status?.fields && status.fields.length > 0 && (
        <p className="text-xs text-dim">
          Differs between lanes in: {status.fields.join(", ")}
        </p>
      )}
    </li>
  );
}
