"use client";

import { useState } from "react";
import { CheckCircle, ShieldWarning, X } from "@phosphor-icons/react";
import type { BlockedInfo } from "@/lib/hud";
import { sourceLabel } from "@/lib/hud";
import { useNow } from "@/lib/useNow";

/**
 * The compact block popup for the menu bar dropdown and the floating pill: what Hermes tried,
 * the sentence that caused it, and Block / Allow once. Fixed size, never scrolls. The live feed
 * (/hud/feed) keeps the full HudBlockCard with the Shadow's version and the explanation.
 */
export function HudBlockPopup({
  blocked,
  onDismiss,
  onDecide,
}: {
  blocked: BlockedInfo;
  onDismiss: () => void;
  onDecide: (decision: "allow" | "block", remember: boolean) => void;
}) {
  const [remember, setRemember] = useState(false);
  const now = useNow(blocked.awaitingUser && blocked.decideBy !== null, 250);
  const left =
    blocked.awaitingUser && blocked.decideBy !== null && now > 0
      ? Math.max(0, Math.ceil((blocked.decideBy - now) / 1000))
      : null;
  const allowed = blocked.userDecision?.decision === "allow";
  const action = blocked.summary.replace(/^terminal:\s*/, "");
  const { culprit } = blocked;

  return (
    <div
      role="alert"
      className={`hud-card-in overflow-hidden rounded-xl border bg-panel/95 px-4 py-3 shadow-lg shadow-black/40 backdrop-blur ${
        allowed ? "border-ok/50" : "border-danger/60"
      }`}
    >
      <div className="flex items-center gap-2">
        {allowed ? (
          <CheckCircle size={18} weight="fill" className="shrink-0 text-ok" />
        ) : (
          <ShieldWarning size={18} weight="fill" className="shrink-0 text-danger" />
        )}
        <span className={`font-semibold ${allowed ? "text-ok" : "text-danger"}`}>{title(blocked)}</span>
        <span className="ml-auto text-xs text-dim">
          {left !== null ? `Blocking in ${left}s` : null}
        </span>
        {!blocked.awaitingUser && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="-mr-1 rounded-xs p-1 text-dim hover:bg-raised hover:text-text"
          >
            <X size={14} weight="bold" />
          </button>
        )}
      </div>

      <p className="mt-2 truncate font-mono text-xs" title={action}>
        {action}
      </p>

      {blocked.reason && (
        <p className="mt-2 line-clamp-2 text-xs leading-snug" title={blocked.reason}>
          <span className="font-medium text-danger">Why: </span>
          {blocked.reason}
        </p>
      )}

      {culprit?.quote && (
        <div className="mt-2 border-l-2 border-danger pl-2">
          <p className="text-[11px] text-dim">
            Exact text in <span className="font-mono text-text">{sourceLabel(culprit.source)}</span>
          </p>
          <p className="line-clamp-3 text-xs leading-snug" title={culprit.quote}>
            <mark className="rounded-xs bg-danger/25 px-0.5 text-text">{culprit.quote}</mark>
          </p>
        </div>
      )}

      {blocked.awaitingUser ? (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            autoFocus
            onClick={() => onDecide("block", remember)}
            className="rounded-xs bg-danger px-3 py-1 text-sm font-semibold text-ink hover:bg-danger/90"
          >
            Block
          </button>
          <button
            type="button"
            onClick={() => onDecide("allow", remember)}
            className="rounded-xs border border-line px-3 py-1 text-sm text-dim hover:bg-raised hover:text-text"
          >
            Allow once
          </button>
          <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs text-dim select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="size-3.5 accent-worker"
            />
            Don&apos;t ask again
          </label>
        </div>
      ) : (
        <p className="mt-2 text-xs text-dim">{outcome(blocked)}</p>
      )}
    </div>
  );
}

function title(b: BlockedInfo): string {
  if (b.userDecision?.decision === "allow") return "Allowed by you";
  if (b.awaitingUser) return "Blocked · your call";
  return "Blocked";
}

function outcome(b: BlockedInfo): string {
  if (b.userDecision?.decision === "allow") return "Hermes ran it.";
  if (b.remembered) return "Blocked automatically, as you asked.";
  if (b.userDecision?.by === "user") return "You blocked it. Hermes was told not to retry.";
  if (b.source === "tamper") return "Hermes tried to touch the Tribunal itself.";
  if (b.source === "error") return "The check couldn't finish, so it was held to be safe.";
  return "Hermes was stopped and told not to retry.";
}
