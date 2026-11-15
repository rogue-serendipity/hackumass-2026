"use client";

import { XIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { getEvalProgress, runEval } from "@/lib/api";
import type { EvalProgress as Progress, EvalResult, Verdict } from "@/lib/types";
import { useNow } from "@/lib/useNow";
import { EvalProgress } from "./EvalProgress";

const PRICE_IN = Number(process.env.NEXT_PUBLIC_PRICE_IN_PER_M);
const PRICE_OUT = Number(process.env.NEXT_PUBLIC_PRICE_OUT_PER_M);
const HAS_PRICE = PRICE_IN > 0 && PRICE_OUT > 0;

const pct = (n: number) => `${(n * 100).toFixed(n === 1 || n === 0 ? 0 : 1)}%`;
const num = (n: number) => n.toLocaleString("en-US");

function Tile({
  label,
  value,
  note,
  tone = "text-text",
}: {
  label: string;
  value: string;
  note: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-panel p-5">
      <p className="text-xs font-semibold font-mono uppercase tracking-wider text-dim">{label}</p>
      <p className={`mt-2 text-5xl font-bold tabular-nums tracking-tight ${tone}`}>{value}</p>
      <p className="mt-2 text-sm text-dim">{note}</p>
    </div>
  );
}

function Chip({ verdict, expected }: { verdict: Verdict; expected: Verdict | null }) {
  // `expected` is null for attack scenarios: an APPROVE there is correct when the
  // Worker resisted, and the per-run verdict alone can't tell the two apart.
  const ok = expected === null || verdict === expected;
  // Color follows the verdict itself; a miss is marked by an X icon and an underline.
  return (
    <span
      className={`font-mono text-xs ${verdict === "BLOCK" ? "text-danger" : "text-ok"} ${
        ok ? "" : "font-bold underline decoration-text underline-offset-4"
      }`}
      title={expected === null ? undefined : ok ? "Matches the expected verdict" : `Expected ${expected}`}
    >
      {verdict}
      {!ok && <XIcon weight="bold" aria-hidden className="ml-1 inline align-[-0.125em]" />}
    </span>
  );
}

export function Metrics() {
  const [result, setResult] = useState<EvalResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  // One run per scenario takes about a minute and a half; three take several minutes.
  const [runs, setRuns] = useState(1);
  const now = useNow(loading, 500);

  // Poll the backend's progress while the eval runs. If it doesn't offer
  // progress, `progress` stays null and the panel shows elapsed time only.
  useEffect(() => {
    if (!loading) return;
    let stopped = false;
    const poll = async () => {
      try {
        const p = await getEvalProgress();
        if (!stopped) setProgress(p);
      } catch {
        if (!stopped) setProgress(null);
      }
    };
    const id = setInterval(poll, 1000);
    void poll();
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [loading]);

  async function run() {
    setLoading(true);
    setProgress(null);
    setStartedAt(Date.now());
    setError(null);
    try {
      setResult(await runEval(runs));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const cost =
    result && HAS_PRICE
      ? (result.total_input_tokens * PRICE_IN + result.total_output_tokens * PRICE_OUT) / 1e6
      : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-4">
        <div className="mr-auto">
          <h2 className="text-2xl font-semibold">Evaluation</h2>
          <p className="text-sm text-dim">
            Runs every scenario several times. An attack counts as hijacked when the Worker acts on
            it; detection is measured over those runs.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-dim">
          Runs per scenario
          <select
            value={runs}
            onChange={(e) => setRuns(Number(e.target.value))}
            disabled={loading}
            className="h-10 rounded-xs border border-line bg-panel px-2 text-sm text-text outline-none focus:border-worker disabled:opacity-50"
          >
            <option value={1}>1 (about 1½ min)</option>
            <option value={2}>2</option>
            <option value={3}>3 (several min)</option>
          </select>
        </label>
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="h-10 rounded-xs bg-worker px-5 text-sm font-semibold text-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Running…" : result ? "Run again" : "Run evaluation"}
        </button>
      </div>

      {loading && (
        <EvalProgress
          progress={progress}
          elapsedS={startedAt && now ? (now - startedAt) / 1000 : 0}
        />
      )}

      {error && (
        <p role="alert" className="rounded-xs border border-line bg-raised px-4 py-3 text-sm">
          The evaluation failed: {error}
        </p>
      )}

      {!result && !loading && !error && (
        <p className="rounded-lg border border-dashed border-line bg-panel px-6 py-12 text-center text-dim">
          No evaluation yet. Run it to see hijack, detection and false-positive rates.
        </p>
      )}

      {result && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <Tile
              label="Hijack rate"
              value={pct(result.hijack_rate)}
              note="Attack runs where the Worker acted on the injected instructions"
            />
            <Tile
              label="Hijacks blocked"
              value={result.attack_detection_rate === null ? "n/a" : pct(result.attack_detection_rate)}
              note={
                result.attack_detection_rate === null
                  ? "No attack hijacked the Worker, so there was nothing to block"
                  : "Hijacked runs that ended in BLOCK"
              }
            />
            <Tile
              label="False positives"
              value={pct(result.benign_false_positive_rate)}
              note="Benign runs that were wrongly blocked"
            />
            <Tile
              label="Noise baseline"
              value={pct(result.noise_divergence_rate)}
              note="Two identical Worker runs that still diverged"
            />
            <Tile
              label="Average latency"
              value={`${result.avg_latency_s.toFixed(1)}s`}
              note="Per run: both agents plus the Judge"
            />
          </div>

          <p className="text-sm text-dim">
            {result.runs_per_scenario} {result.runs_per_scenario === 1 ? "run" : "runs"} per scenario ·{" "}
            <span className="text-text">{num(result.total_input_tokens)}</span> input tokens ·{" "}
            <span className="text-text">{num(result.total_output_tokens)}</span> output tokens
            {cost !== null && (
              <>
                {" "}
                · estimated cost <span className="text-text">${cost.toFixed(2)}</span>
              </>
            )}
          </p>

          <div className="overflow-x-auto rounded-lg border border-line bg-panel">
            <table className="w-full text-left text-sm">
              <thead className="text-xs font-mono uppercase tracking-wider text-dim">
                <tr className="border-b border-line">
                  <th className="px-4 py-3 font-semibold">Scenario</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Hijacked</th>
                  <th className="px-4 py-3 font-semibold">Verdicts</th>
                  <th className="px-4 py-3 text-right font-semibold">Passed</th>
                </tr>
              </thead>
              <tbody>
                {result.scenarios.map((s) => (
                  <tr key={s.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3">
                      <span className="font-mono">{s.id}</span>
                      <span className="block text-dim">{s.title}</span>
                    </td>
                    <td className="px-4 py-3">
                      {s.category}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-dim">
                      {s.category === "attack" ? `${s.hijacked}/${s.verdicts.length}` : "–"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex flex-wrap gap-x-3 gap-y-1">
                        {s.verdicts.map((v, i) => (
                          <Chip
                            key={i}
                            verdict={v}
                            expected={s.category === "attack" ? null : s.expected}
                          />
                        ))}
                      </span>
                    </td>
                    <td
                      className={`px-4 py-3 text-right tabular-nums ${
                        s.passed === s.verdicts.length ? "text-dim" : "font-bold text-text"
                      }`}
                    >
                      {s.passed}/{s.verdicts.length}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
