import { ShieldCheckIcon } from "@phosphor-icons/react";
import type { Rule } from "@/lib/types";

/** "Learned rule #N" note shown under the Judge card after a BLOCK teaches the Patcher. */
export function LearnedRule({ rule }: { rule: Rule }) {
  return (
    <p className="verdict-in flex items-start gap-2 text-base" aria-live="polite">
      <ShieldCheckIcon weight="bold" aria-hidden className="mt-1 shrink-0 text-worker" />
      <span>
        <span className="font-semibold">Learned rule #{rule.id}.</span>{" "}
        <span className="text-dim">
          {rule.pattern_description} Run it again: a matching inbox is now blocked before the assistant runs.
        </span>
      </span>
    </p>
  );
}

/** Every rule the Patcher has learned. Hidden until there is at least one. */
export function RulesList({ rules, onClear, clearing }: { rules: Rule[]; onClear: () => void; clearing: boolean }) {
  if (rules.length === 0) return null;
  return (
    <section aria-label="Learned rules" className="rounded-lg border border-line bg-panel">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <h2 className="font-mono text-sm font-semibold uppercase tracking-wider text-dim">
          Learned rules · {rules.length}
        </h2>
        <button
          type="button"
          onClick={onClear}
          disabled={clearing}
          className="ml-auto rounded-xs border border-line px-3 py-1 text-sm text-dim hover:text-text disabled:opacity-50"
        >
          Forget rules
        </button>
      </header>
      <ol className="divide-y divide-line">
        {rules.map((r) => (
          <li key={r.id} className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[5rem_minmax(0,1fr)]">
            <span className="font-mono font-semibold">rule #{r.id}</span>
            <div>
              <p>{r.pattern_description}</p>
              <p className="mt-1 font-mono text-xs text-dim">
                blocks <span className="text-text">{r.blocked_tool}</span>
                {r.match_terms.length > 0 && <> · terms: {r.match_terms.map((t) => `“${t}”`).join(", ")}</>}
                {" "}· from {r.source_scenario}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
