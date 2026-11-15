"use client";

import { ShieldWarning, X } from "@phosphor-icons/react";
import type { BlockedInfo } from "@/lib/hud";
import { sourceLabel } from "@/lib/hud";

/** The expanded pill: what Hermes tried, which untrusted text caused it, and what it would have done otherwise. */
export function HudBlockCard({ blocked, onDismiss }: { blocked: BlockedInfo; onDismiss?: () => void }) {
  const { culprit } = blocked;
  return (
    <div
      role="alert"
      className="hud-card-in rounded-2xl border border-danger/70 bg-panel/95 p-4 shadow-xl shadow-black/50 backdrop-blur"
    >
      <div className="mb-3 flex items-center gap-2">
        <ShieldWarning size={22} weight="fill" className="text-danger" />
        <h1 className="flex-1 font-semibold text-danger">Blocked by the Shadow Agent Tribunal</h1>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="rounded-xs p-1 text-dim hover:bg-raised hover:text-text"
          >
            <X size={16} weight="bold" />
          </button>
        )}
      </div>

      <Label>Hermes tried</Label>
      <p className="mb-3 rounded-xs border border-danger/40 bg-danger/10 px-2 py-1.5 font-mono text-xs break-all">
        {blocked.summary}
      </p>

      {culprit && (
        <>
          <Label>
            Caused by this text in <span className="font-mono normal-case">{sourceLabel(culprit.source)}</span>
          </Label>
          {culprit.quote ? (
            <blockquote className="mb-3 border-l-2 border-danger pl-2 text-sm">
              <mark className="rounded-xs bg-danger/25 px-0.5 text-text">{culprit.quote}</mark>
            </blockquote>
          ) : (
            <p className="mb-3 text-sm text-dim">Untrusted content from this source.</p>
          )}
        </>
      )}

      <Label>Without that content, the same agent would have</Label>
      <p className="mb-3 font-mono text-xs text-dim break-all">
        {blocked.shadow_summary && blocked.shadow_summary !== "nothing"
          ? blocked.shadow_summary
          : "not tried anything like this"}
      </p>

      <p className="text-sm leading-snug">{blocked.explanation}</p>
      <p className="mt-2 text-xs text-dim">
        {blocked.source === "error"
          ? "The Tribunal couldn't finish its check, so the action was held to be safe."
          : blocked.source === "code"
            ? "Blocked by a hard rule. Hermes was stopped and told not to retry."
            : "Hermes was stopped and told not to retry."}
      </p>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-dim">{children}</p>;
}
