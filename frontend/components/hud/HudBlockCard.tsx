"use client";

import { useState } from "react";
import { CheckCircle, ShieldWarning, X } from "@phosphor-icons/react";
import type { BlockedInfo } from "@/lib/hud";
import { sourceLabel } from "@/lib/hud";
import { useNow } from "@/lib/useNow";

/** The expanded pill: what Hermes tried, which untrusted text caused it, and what it would have done otherwise. */
export function HudBlockCard({
  blocked,
  onDismiss,
  onDecide,
}: {
  blocked: BlockedInfo;
  onDismiss?: () => void;
  onDecide?: (decision: "allow" | "block", remember: boolean) => void;
}) {
  const { culprit } = blocked;
  const allowed = blocked.userDecision?.decision === "allow";
  return (
    <div
      role="alert"
      className={`hud-card-in rounded-2xl border bg-panel/95 p-4 shadow-xl shadow-black/50 backdrop-blur ${
        allowed ? "border-ok/60" : "border-danger/70"
      }`}
    >
      <div className="mb-3 flex items-center gap-2">
        {allowed ? (
          <CheckCircle size={22} weight="fill" className="text-ok" />
        ) : (
          <ShieldWarning size={22} weight="fill" className="text-danger" />
        )}
        <h1 className={`flex-1 font-semibold ${allowed ? "text-ok" : "text-danger"}`}>
          {allowed
            ? blocked.userDecision?.remember
              ? "You allowed this (don't ask again)"
              : "You allowed this once"
            : blocked.awaitingUser
              ? "Held by the Shadow Agent Tribunal"
              : "Blocked by the Shadow Agent Tribunal"}
        </h1>
        {onDismiss && !blocked.awaitingUser && (
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
      {blocked.awaitingUser && onDecide ? (
        <Decide decideBy={blocked.decideBy} onDecide={onDecide} />
      ) : (
        <p className="mt-2 text-xs text-dim">{outcome(blocked)}</p>
      )}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-dim">{children}</p>;
}

function outcome(b: BlockedInfo): string {
  if (b.remembered) return "You chose to always block this action, so it was blocked without asking.";
  if (b.userDecision?.decision === "allow" && b.userDecision.remember)
    return "You allowed it, so Hermes ran it. This exact action won't be held again this session; anything else still will.";
  if (b.userDecision?.decision === "allow") return "You chose Allow once, so Hermes ran it. The next suspicious action will be held again.";
  if (b.userDecision?.by === "user" && b.userDecision.remember)
    return "You chose Block, and this exact action will be blocked without asking for the rest of the session.";
  if (b.userDecision?.by === "user") return "You chose Block. Hermes was stopped and told not to retry.";
  if (b.userDecision?.by === "timeout") return "No answer in time, so it stayed blocked. Hermes was told not to retry.";
  if (b.source === "error") return "The Tribunal couldn't finish its check, so the action was held to be safe.";
  if (b.source === "code") return "Blocked by a hard rule. Hermes was stopped and told not to retry.";
  return "Hermes was stopped and told not to retry.";
}

/** Hold-and-ask (H12): Block is the default and what happens if nobody answers. */
function Decide({
  decideBy,
  onDecide,
}: {
  decideBy: number | null;
  onDecide: (d: "allow" | "block", remember: boolean) => void;
}) {
  const now = useNow(decideBy !== null, 250);
  const [remember, setRemember] = useState(false);
  const left = decideBy !== null && now > 0 ? Math.max(0, Math.ceil((decideBy - now) / 1000)) : null;
  return (
    <div className="mt-3 border-t border-line pt-3">
      <p className="mb-2 text-sm text-dim">
        Hermes is paused. Did <span className="text-text">you</span> want this?
        {left !== null && <span className="ml-1 font-mono">Blocking in {left}s.</span>}
      </p>
      <label className="mb-3 flex w-fit cursor-pointer items-center gap-2 text-sm text-dim select-none">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          className="size-4 accent-worker"
        />
        Don&apos;t ask again for this action
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          autoFocus
          onClick={() => onDecide("block", remember)}
          className="rounded-xs bg-danger px-4 py-1.5 text-sm font-semibold text-ink hover:bg-danger/90"
        >
          Block
        </button>
        <button
          type="button"
          onClick={() => onDecide("allow", remember)}
          className="rounded-xs border border-line px-4 py-1.5 text-sm text-dim hover:bg-raised hover:text-text"
        >
          Allow once
        </button>
      </div>
    </div>
  );
}
