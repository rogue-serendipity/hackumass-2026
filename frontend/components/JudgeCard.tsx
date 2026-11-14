import { splitAroundQuote } from "@/lib/highlight";
import type { Phase } from "@/lib/runReducer";
import type { Diff, Email, JudgeVerdict } from "@/lib/types";

interface Props {
  phase: Phase;
  diff: Diff | null;
  verdict: JudgeVerdict | null;
  /** The inbox as it was sent with this run. */
  emails: Email[];
}

const WAITING: Record<Exclude<Phase, "done">, string> = {
  idle: "The Judge compares the two lanes and rules here.",
  agents: "Waiting for both agents to finish…",
  diffing: "Comparing the two action traces…",
  judging: "The Worker did something the Shadow didn't. The Judge is deciding…",
};

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
    <div className="rounded-lg border border-danger/40 bg-ink p-4">
      <p className="text-[11px] font-semibold font-mono uppercase tracking-wider text-danger">
        The email that caused it
      </p>
      <p className="mt-1.5 text-sm">
        <span className="font-semibold">{email.subject}</span>
        <span className="text-dim"> · from <span className="font-mono">{email.from}</span></span>
      </p>
      <p className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-dim">
        {split ? (
          <>
            {split.before}
            <mark className="rounded bg-danger/25 px-0.5 font-medium text-text ring-1 ring-danger/60">
              {split.match}
            </mark>
            {split.after}
          </>
        ) : (
          email.body
        )}
      </p>
      {!split && quote && (
        <p className="mt-3 border-l-2 border-danger pl-3 text-sm text-text">
          <span className="text-dim">Judge&apos;s quote: </span>
          {quote}
        </p>
      )}
    </div>
  );
}

export function JudgeCard({ phase, diff, verdict, emails }: Props) {
  if (!verdict) {
    const waiting = phase === "done" ? "The run ended without a verdict." : WAITING[phase];
    const active = phase !== "idle" && phase !== "done";
    return (
      <section
        aria-label="Judge"
        aria-live="polite"
        className="rounded-xl border border-dashed border-line bg-panel px-6 py-8 text-center"
      >
        <p className="text-xs font-semibold font-mono uppercase tracking-wider text-dim">Judge</p>
        <p className={`mt-2 text-lg ${active ? "animate-pulse text-text" : "text-dim"}`}>
          {waiting}
        </p>
      </section>
    );
  }

  const block = verdict.verdict === "BLOCK";
  const culprit = emails.find((e) => e.id === verdict.culprit_email_id);
  // An approval with no culprit has nothing to show on the right.
  const evidence = block || culprit !== undefined || verdict.culprit_quote !== null;

  return (
    <section
      aria-label="Judge"
      aria-live="polite"
      className={`verdict-in rounded-xl border-2 p-6 ${
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
          <p className="mt-3 text-xl leading-snug">{verdict.explanation}</p>

          {verdict.per_action.length > 0 && (
            <ul className="mt-4 space-y-2 text-sm">
              {verdict.per_action.map((p) => {
                const action = diff?.worker_only[p.action_index];
                return (
                  <li key={p.action_index} className="rounded-lg border border-line bg-ink/60 px-3 py-2">
                    <span
                      className={`mr-2 font-semibold ${
                        p.decision === "BLOCK" ? "text-danger" : "text-ok"
                      }`}
                    >
                      {p.decision}
                    </span>
                    {action && <span className="mr-2 font-mono">{action.tool}</span>}
                    {p.hard_rule && (
                      <span className="mr-2 rounded bg-danger/20 px-1.5 py-0.5 text-[11px] font-semibold font-mono uppercase tracking-wide text-danger">
                        hard rule
                      </span>
                    )}
                    <span className="text-dim">{p.reason}</span>
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
                : "Diff by code, verdict by LLM"}
            </li>
          </ul>
        </div>

        {culprit ? (
          <Culprit email={culprit} quote={verdict.culprit_quote} />
        ) : verdict.culprit_quote ? (
          <div className="rounded-lg border border-danger/40 bg-ink p-4 text-sm">
            <p className="text-[11px] font-semibold font-mono uppercase tracking-wider text-danger">
              The sentence that caused it
            </p>
            <p className="mt-2">{verdict.culprit_quote}</p>
          </div>
        ) : block ? (
          <div className="flex items-center justify-center rounded-lg border border-line bg-ink/60 p-4 text-center text-sm text-dim">
            The Judge did not point to a specific email.
          </div>
        ) : null}
      </div>
    </section>
  );
}
