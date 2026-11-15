"use client";

import {
  ArrowClockwiseIcon,
  CheckIcon,
  CircleNotchIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { describeError } from "@/lib/errors";
import { splitAroundQuote } from "@/lib/highlight";
import type { Phase, RunState } from "@/lib/runReducer";
import type { Diff, Email, JudgeVerdict } from "@/lib/types";
import { seconds, useNow } from "@/lib/useNow";
import { Markdown } from "./Markdown";
import { Tag } from "./Tag";

interface Props {
  phase: Phase;
  diff: Diff | null;
  verdict: JudgeVerdict | null;
  /** The inbox as it was sent with this run. */
  emails: Email[];
  run: Pick<RunState, "startedAt" | "laneDone" | "error">;
  onRetry: () => void;
  canRetry: boolean;
}

/** Real runs take 5–9 s; past this, say why it might be slow. */
const SLOW_MS = 20_000;

const STAGES = [
  { phase: "agents", label: "Agents run" },
  { phase: "diffing", label: "Compare traces" },
  { phase: "judging", label: "Judge decides" },
] as const;

function waitingText(phase: Phase, laneDone: RunState["laneDone"]): string {
  switch (phase) {
    case "agents":
      if (laneDone.worker) return "The Worker finished. Waiting for the Shadow…";
      if (laneDone.shadow) return "The Shadow finished. Waiting for the Worker…";
      return "Both agents are working through the inbox…";
    case "diffing":
      return "Comparing what the two agents tried to do…";
    case "judging":
      return "The Worker did something the Shadow didn't. The Judge is deciding…";
    default:
      return "Hit Run. The Judge compares the two lanes and rules here.";
  }
}

function Waiting({ phase, run }: Pick<Props, "phase" | "run">) {
  const active = phase !== "idle" && phase !== "done";
  const now = useNow(active);
  const elapsed = run.startedAt ? now - run.startedAt : 0;
  const current = STAGES.findIndex((s) => s.phase === phase);

  return (
    <section
      aria-label="Judge"
      className="rounded-lg border border-dashed border-line bg-panel px-6 py-6"
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <p className="font-mono text-sm font-semibold uppercase tracking-wider text-dim">Judge</p>
        {active && (
          <ol className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-sm">
            {STAGES.map((s, i) => (
              <li
                key={s.phase}
                className={`flex items-center gap-1.5 ${i === current ? "text-text" : "text-dim"}`}
              >
                {i < current ? (
                  <CheckIcon weight="bold" aria-hidden />
                ) : i === current ? (
                  <CircleNotchIcon weight="bold" aria-hidden className="motion-safe:animate-spin" />
                ) : (
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full border border-dim" />
                )}
                {s.label}
              </li>
            ))}
          </ol>
        )}
        {active && (
          <span className="ml-auto font-mono text-sm tabular-nums text-dim">{seconds(elapsed)}</span>
        )}
      </div>
      <p className={`mt-3 text-xl ${active ? "text-text" : "text-dim"}`} aria-live="polite">
        {waitingText(phase, run.laneDone)}
      </p>
      {active && elapsed > SLOW_MS && (
        <p className="mt-2 text-sm text-dim">
          Slower than usual. The model provider may be queueing requests; it usually catches up.
        </p>
      )}
    </section>
  );
}

function Failed({ error, onRetry, canRetry }: { error: string; onRetry: () => void; canRetry: boolean }) {
  const { title, hint } = describeError(error);
  return (
    <section
      aria-label="Judge"
      role="alert"
      className="rounded-lg border border-line bg-panel px-6 py-6"
    >
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <WarningCircleIcon aria-hidden className="mt-1 shrink-0 text-2xl text-text" />
        <div className="mr-auto min-w-0">
          <p className="text-2xl font-semibold">{title}</p>
          <p className="mt-1 text-lg text-dim">{hint}</p>
          <p className="mt-3 line-clamp-3 break-words font-mono text-sm text-dim" title={error}>
            {error}
          </p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          disabled={!canRetry}
          className="flex h-10 items-center gap-2 rounded-xs bg-worker px-5 text-sm font-semibold text-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowClockwiseIcon weight="bold" aria-hidden />
          Run again
        </button>
      </div>
    </section>
  );
}

function Flag({ label, value }: { label: string; value: boolean | null }) {
  if (value === null) return null;
  return (
    <li className="flex items-center gap-2">
      <span className={value ? "text-text" : "text-dim"}>{value ? "Yes" : "No"}</span>
      <span className="text-dim">{label}</span>
    </li>
  );
}

function Culprit({ email, quote }: { email: Email; quote: string | null }) {
  const split = splitAroundQuote(email.body, quote);
  return (
    <div className="border-l-2 border-danger/50 pl-4">
      <p className="text-[11px] font-semibold font-mono uppercase tracking-wider text-danger">
        The email that caused it
      </p>
      <p className="mt-1.5 text-sm">
        <span className="font-semibold">{email.subject}</span>
        <span className="text-dim"> · from <span className="font-mono">{email.from}</span></span>
      </p>
      {/* Base size, not small: this is the evidence, and it has to read on a projector. */}
      <p className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap text-base leading-relaxed text-dim">
        {split ? (
          <>
            {split.before}
            <mark data-culprit="1" className="rounded-xs bg-danger/25 px-0.5 font-medium text-text ring-1 ring-danger/60">
              {split.match}
            </mark>
            {split.after}
          </>
        ) : (
          email.body
        )}
      </p>
      {!split && quote && (
        <p className="mt-3 text-sm text-text">
          <span className="text-dim">Judge&apos;s quote: </span>
          {quote}
        </p>
      )}
    </div>
  );
}

export function JudgeCard({ phase, diff, verdict, emails, run, onRetry, canRetry }: Props) {
  if (!verdict) {
    if (phase === "done")
      return (
        <Failed
          error={run.error ?? "The run ended without a verdict."}
          onRetry={onRetry}
          canRetry={canRetry}
        />
      );
    return <Waiting phase={phase} run={run} />;
  }

  const block = verdict.verdict === "BLOCK";
  const ruleId = verdict.source === "rule" ? (verdict.rule_id ?? null) : null;
  const ruleHeadline = `Auto-blocked by rule${ruleId !== null ? ` #${ruleId}` : ""} before the assistant ran`;
  // The backend's rule explanation may open with the same sentence as the headline.
  const explanation =
    verdict.source === "rule" && verdict.explanation.startsWith(ruleHeadline)
      ? verdict.explanation.slice(ruleHeadline.length).replace(/^[\s:.\-–—]+/, "")
      : verdict.explanation;
  const culprit = emails.find((e) => e.id === verdict.culprit_email_id);
  // An approval with no culprit has nothing to show on the right.
  const evidence = block || culprit !== undefined || verdict.culprit_quote !== null;

  return (
    <section
      aria-label="Judge"
      aria-live="polite"
      className={`verdict-in rounded-2xl border-2 p-6 ${
        block ? "border-danger bg-danger/[0.07]" : "border-ok bg-ok/[0.07]"
      }`}
    >
      <div
        className={`grid gap-6 ${evidence ? "lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]" : ""}`}
      >
        <div>
          <p className="text-xs font-semibold font-mono uppercase tracking-wider text-dim">
            Judge&apos;s verdict
          </p>
          <p
            className={`mt-1 text-6xl font-black tracking-tight ${
              block ? "text-danger" : "text-ok"
            }`}
          >
            {block ? "BLOCK" : "APPROVE"}
          </p>
          {verdict.source === "rule" && (
            <p className="mt-2 text-2xl font-semibold">
              {ruleHeadline}
            </p>
          )}
          {explanation && <Markdown text={explanation} className="mt-3 text-xl leading-snug" />}

          {verdict.per_action.length > 0 && (
            <ul className="mt-4 divide-y divide-line text-sm">
              {verdict.per_action.map((p) => {
                const action = diff?.worker_only[p.action_index];
                return (
                  <li key={p.action_index} className="py-2">
                    <span
                      className={`mr-2 font-semibold ${
                        p.decision === "BLOCK" ? "text-danger" : "text-ok"
                      }`}
                    >
                      {p.decision}
                    </span>
                    {action && <span className="mr-2 font-mono">{action.tool}</span>}
                    {p.hard_rule && (
                      <Tag tone="danger" className="mr-2">
                        hard rule
                      </Tag>
                    )}
                    <Markdown text={p.reason} className="mt-1 text-dim" />
                  </li>
                );
              })}
            </ul>
          )}

          <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <Flag label="serves the user's request" value={verdict.serves_user_request} />
            <Flag
              label="introduces a new goal or recipient"
              value={verdict.introduces_new_goal_or_recipient}
            />
            <li className="text-dim">
              {verdict.source === "fast_path"
                ? "Fast path: decided by code, no LLM call"
                : verdict.source === "rule"
                  ? "Patcher rule: no agents ran, no tokens spent"
                  : "Diff by code, verdict by LLM"}
            </li>
          </ul>

          {run.error && (
            <p role="alert" className="mt-4 flex items-start gap-2 text-sm text-dim">
              <WarningCircleIcon aria-hidden className="mt-0.5 shrink-0" />
              <span>
                Something failed after the verdict: <span className="font-mono">{run.error}</span>
              </span>
            </p>
          )}
        </div>

        {culprit ? (
          <Culprit email={culprit} quote={verdict.culprit_quote} />
        ) : verdict.culprit_quote ? (
          <div className="border-l-2 border-danger/50 pl-4 text-sm">
            <p className="text-[11px] font-semibold font-mono uppercase tracking-wider text-danger">
              The sentence that caused it
            </p>
            <p className="mt-2">{verdict.culprit_quote}</p>
          </div>
        ) : block ? (
          <div className="flex items-center justify-center p-4 text-center text-sm text-dim">
            The Judge did not point to a specific email.
          </div>
        ) : null}
      </div>
    </section>
  );
}
