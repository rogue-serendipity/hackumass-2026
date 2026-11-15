"use client";

import { useEffect, useRef } from "react";
import {
  ArrowCounterClockwise,
  CheckCircle,
  CircleNotch,
  Eye,
  EyeSlash,
  ShieldCheck,
  ShieldWarning,
  User,
  WarningOctagon,
} from "@phosphor-icons/react";
import { HudBlockCard } from "@/components/hud/HudBlockCard";
import type { CheckRow, HudState, TimelineItem } from "@/lib/hud";
import { pillStatus, sourceLabel } from "@/lib/hud";
import { resetGuard, useHud } from "@/lib/useHud";

// The big live view of the Tribunal watching Hermes, for a projector or a recording.
// Everything Hermes reads and every action it tries, as it happens. /hud/feed?mock=1 plays a scripted run.

export default function FeedPage() {
  const [state] = useHud();
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = "Tribunal · live";
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [state.timeline.length, state.checks]);

  const allowed = state.checks.filter((c) => c.decision === "allow").length;
  const blocked = state.checks.filter((c) => c.decision === "block").length;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line bg-ink/95 px-6 py-4 backdrop-blur">
        <div className="flex items-center gap-2">
          <ShieldCheck size={26} weight="duotone" className="text-worker" />
          <h1 className="text-xl font-semibold">Shadow Agent Tribunal</h1>
          <span className="text-dim">watching Hermes Agent</span>
        </div>
        <Connection state={state} />
        <div className="ml-auto flex items-center gap-4 font-mono text-sm">
          <Stat value={allowed} label="allowed" className="text-ok" />
          <Stat value={blocked} label="blocked" className="text-danger" />
          <Stat value={state.untrusted.length} label="untrusted read" className="text-text" />
          <button
            type="button"
            onClick={resetGuard}
            className="flex items-center gap-1.5 rounded-xs border border-line px-3 py-1.5 font-sans text-dim hover:bg-raised hover:text-text"
          >
            <ArrowCounterClockwise size={14} /> Reset
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-6">
        {state.sinkPreview !== null && (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-danger bg-danger/10 p-4 text-danger">
            <WarningOctagon size={24} weight="fill" />
            <span className="font-semibold">Data reached the fake server: an attack got through.</span>
          </div>
        )}

        {state.task ? (
          <section className="mb-6 rounded-lg border border-line bg-panel p-5">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-dim">
              <User size={14} /> Your request <span className="normal-case tracking-normal">(trusted)</span>
            </p>
            <p className="text-lg">{state.task}</p>
          </section>
        ) : (
          <section className="mb-6 rounded-lg border border-dashed border-line p-8 text-center text-dim">
            Waiting for Hermes to start a task…
          </section>
        )}

        <ol className="space-y-3">
          {state.timeline.map((item) => (
            <li key={item.kind === "check" ? item.check_id : item.observation_id} className="hud-card-in">
              {item.kind === "observed" ? (
                <ReadRow item={item} />
              ) : (
                <CheckItem state={state} checkId={item.check_id} />
              )}
            </li>
          ))}
        </ol>
        <div ref={end} className="h-8" />
      </main>
    </div>
  );
}

function Connection({ state }: { state: HudState }) {
  const { tone, text } = pillStatus(state);
  if (state.connection === "live") {
    return (
      <span className="flex items-center gap-1.5 text-sm text-dim">
        <span className={`size-2 rounded-full ${tone === "checking" ? "animate-pulse bg-worker" : "bg-ok"}`} />
        Live
      </span>
    );
  }
  return <span className="text-sm text-dim">{text}</span>;
}

function Stat({ value, label, className }: { value: number; label: string; className: string }) {
  return (
    <span className="text-dim">
      <span className={`text-lg font-semibold ${className}`}>{value}</span> {label}
    </span>
  );
}

function ReadRow({ item }: { item: Extract<TimelineItem, { kind: "observed" }> }) {
  const Icon = item.trusted ? Eye : EyeSlash;
  return (
    <div className="flex items-center gap-3 px-1 text-sm text-dim">
      <Icon size={18} className="shrink-0" />
      <span>
        Hermes {item.source.startsWith("tool:") ? "used" : "read"}{" "}
        <span className="font-mono text-text">{sourceLabel(item.source)}</span>
      </span>
      <span
        className={`rounded-xs border px-1.5 py-0.5 text-[11px] uppercase tracking-wider ${
          item.trusted ? "border-line text-dim" : "border-danger/50 text-danger"
        }`}
      >
        {item.trusted ? "trusted" : "untrusted: hidden from the Shadow"}
      </span>
    </div>
  );
}

const ALLOW_WHY: Record<string, string> = {
  skip: "read-only, nothing to check",
  code: "no untrusted content involved",
  llm: "the Shadow would do the same",
};

function CheckItem({ state, checkId }: { state: HudState; checkId: string }) {
  const check = state.checks.find((c) => c.check_id === checkId);
  if (!check) return null;
  const block = state.blocks[checkId];
  if (check.decision === "block" && block) {
    return (
      <div className="max-w-3xl">
        <HudBlockCard blocked={block} />
      </div>
    );
  }
  return <CheckRowView check={check} />;
}

function CheckRowView({ check }: { check: CheckRow }) {
  const pending = check.decision === "pending";
  return (
    <div
      className={`flex items-center gap-3 rounded-sm border px-4 py-3 ${
        pending ? "border-worker/50 bg-worker/5" : "border-ok/30 bg-panel"
      }`}
    >
      {pending ? (
        <CircleNotch size={20} className="shrink-0 animate-spin text-worker" />
      ) : check.decision === "allow" ? (
        <CheckCircle size={20} weight="fill" className="shrink-0 text-ok" />
      ) : (
        <ShieldWarning size={20} weight="fill" className="shrink-0 text-danger" />
      )}
      <span className="min-w-0 flex-1 break-all font-mono text-sm">{check.summary}</span>
      <span className={`shrink-0 text-sm ${pending ? "text-worker" : "text-ok"}`}>
        {pending ? "Checking with the Shadow…" : `Allowed · ${ALLOW_WHY[check.source ?? ""] ?? "allowed"}`}
      </span>
    </div>
  );
}
