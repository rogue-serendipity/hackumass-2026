"use client";

import {
  CheckCircle,
  CircleNotch,
  ShieldCheck,
  ShieldWarning,
  WarningOctagon,
  XCircle,
} from "@phosphor-icons/react";
import type { CheckRow, HudState, PillTone } from "@/lib/hud";
import { pillStatus, sourceLabel } from "@/lib/hud";

const TONE: Record<PillTone, { ring: string; dot: string }> = {
  offline: { ring: "border-line", dot: "bg-dim" },
  idle: { ring: "border-line", dot: "bg-ok" },
  ok: { ring: "border-ok/40", dot: "bg-ok" },
  checking: { ring: "border-worker/50", dot: "bg-worker animate-pulse" },
  blocked: { ring: "border-danger/60", dot: "bg-danger" },
  breach: { ring: "border-danger", dot: "bg-danger animate-pulse" },
};

export function HudPill({
  state,
  open,
  onToggle,
}: {
  state: HudState;
  open: boolean;
  onToggle: () => void;
}) {
  const { tone, text } = pillStatus(state);
  const t = TONE[tone];
  const Icon =
    tone === "checking" ? CircleNotch : tone === "blocked" || tone === "breach" ? ShieldWarning : ShieldCheck;
  return (
    <button
      type="button"
      onClick={onToggle}
      title={state.task || "Shadow Agent Tribunal"}
      className={`flex h-11 w-full items-center gap-2.5 rounded-full border bg-panel/95 px-4 text-left shadow-lg shadow-black/40 backdrop-blur ${t.ring}`}
      aria-expanded={open}
    >
      <span className={`size-2.5 shrink-0 rounded-full ${t.dot}`} aria-hidden />
      <Icon
        size={18}
        weight="bold"
        className={`shrink-0 ${tone === "checking" ? "animate-spin text-worker" : tone === "blocked" || tone === "breach" ? "text-danger" : "text-dim"}`}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{text}</span>
      <span className="shrink-0 text-[11px] uppercase tracking-wider text-dim">Tribunal</span>
    </button>
  );
}

export function HudActivity({ state }: { state: HudState }) {
  const recent = state.checks.filter((c) => c.tool_name !== "read_file" && c.tool_name !== "search_files").slice(-3).reverse(); // fits the 200 px dropdown
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-panel/95 p-3 text-sm shadow-lg shadow-black/40 backdrop-blur">
      {state.task ? (
        <p className="mb-2 truncate text-dim">
          <span className="text-text">Task:</span> {state.task}
        </p>
      ) : (
        <p className="mb-2 text-dim">Waiting for Hermes to start a task.</p>
      )}
      {state.untrusted.length > 0 && (
        <p className="mb-2 truncate text-dim">
          Untrusted content read: {state.untrusted.map(sourceLabel).join(", ")}
        </p>
      )}
      {recent.length === 0 ? (
        <p className="text-dim">No sensitive actions yet.</p>
      ) : (
        <ul className="space-y-1">
          {recent.map((c) => (
            <CheckLine key={c.check_id} check={c} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CheckLine({ check }: { check: CheckRow }) {
  const icon =
    check.decision === "pending" ? (
      <CircleNotch size={14} className="animate-spin text-worker" />
    ) : check.decision === "allow" ? (
      <CheckCircle size={14} weight="fill" className="text-ok" />
    ) : (
      <XCircle size={14} weight="fill" className="text-danger" />
    );
  return (
    <li className="flex items-center gap-2">
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 truncate font-mono text-xs">{check.summary}</span>
    </li>
  );
}

export function HudBreach({ preview, onDismiss }: { preview: string; onDismiss: () => void }) {
  return (
    <div className="rounded-2xl border border-danger bg-panel/95 p-4 shadow-lg shadow-black/40 backdrop-blur">
      <div className="mb-2 flex items-center gap-2 text-danger">
        <WarningOctagon size={20} weight="fill" />
        <span className="font-semibold">An action got through</span>
      </div>
      <p className="mb-2 text-sm text-dim">Something reached the demo&apos;s fake exfiltration server. It received:</p>
      <pre className="mb-3 max-h-20 overflow-hidden rounded-xs bg-ink p-2 font-mono text-xs whitespace-pre-wrap">{preview}</pre>
      <button type="button" onClick={onDismiss} className="rounded-xs border border-line px-3 py-1 text-sm hover:bg-raised">
        Dismiss
      </button>
    </div>
  );
}
