import { CheckIcon, CircleNotchIcon } from "@phosphor-icons/react";
import type { EvalProgress as Progress, Verdict } from "@/lib/types";

const clock = (s: number) => {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

function Chip({ verdict }: { verdict: Verdict }) {
  return (
    <span className={`font-mono text-xs ${verdict === "BLOCK" ? "text-danger" : "text-ok"}`}>{verdict}</span>
  );
}

/**
 * What a running evaluation is doing. With live progress from the backend it
 * shows a real bar and per-scenario status; without it, an indeterminate bar
 * and the elapsed time, so the page never looks frozen.
 */
export function EvalProgress({ progress, elapsedS }: { progress: Progress | null; elapsedS: number }) {
  const live = progress?.running && progress.total_jobs ? progress : null;
  const total = live?.total_jobs ?? 0;
  const done = live?.done_jobs ?? 0;
  const fraction = total ? done / total : 0;
  // Only estimate once a few jobs have finished, or the guess swings wildly.
  const eta = live && done >= 3 && done < total ? (elapsedS / done) * (total - done) : null;

  return (
    <section aria-label="Evaluation progress" className="rounded-lg border border-line bg-panel p-5">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="flex items-center gap-2 text-lg font-semibold">
          <CircleNotchIcon weight="bold" aria-hidden className="text-worker motion-safe:animate-spin" />
          Running the evaluation
        </p>
        <p className="font-mono text-sm tabular-nums text-dim" aria-live="polite">
          {live ? `${done} of ${total} runs · ` : ""}
          {clock(elapsedS)} elapsed
          {eta !== null && ` · about ${clock(eta)} left`}
        </p>
      </div>

      <div
        role="progressbar"
        aria-label="Evaluation progress"
        aria-valuemin={0}
        aria-valuemax={live ? total : undefined}
        aria-valuenow={live ? done : undefined}
        className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-raised"
      >
        {live ? (
          <div
            className="h-full rounded-full bg-worker transition-[width] duration-700 ease-out"
            style={{ width: `${Math.max(2, fraction * 100)}%` }}
          />
        ) : (
          <div className="progress-indeterminate absolute inset-y-0 w-1/3 rounded-full bg-worker" />
        )}
      </div>

      {live ? (
        <ol className="mt-4 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2 xl:grid-cols-3">
          {live.scenarios?.map((s) => {
            const finished = s.done >= s.total;
            const started = s.done > 0;
            return (
              <li key={s.id} className="flex items-center gap-2">
                <span className="flex w-4 justify-center" aria-hidden>
                  {finished ? (
                    <CheckIcon weight="bold" className="text-text" />
                  ) : started ? (
                    <CircleNotchIcon weight="bold" className="text-worker motion-safe:animate-spin" />
                  ) : (
                    <span className="h-2 w-2 rounded-full border border-dim" />
                  )}
                </span>
                <span className={`font-mono ${started ? "text-text" : "text-dim"}`}>{s.id}</span>
                <span className="sr-only">
                  {finished ? "finished" : started ? "running" : "queued"}
                </span>
                <span className="ml-auto flex items-center gap-2">
                  {s.verdicts.map((v, i) => (
                    <Chip key={i} verdict={v} />
                  ))}
                  {s.failed > 0 && <span className="font-mono text-xs text-dim">{s.failed} failed</span>}
                  <span className="w-8 text-right font-mono text-xs tabular-nums text-dim">
                    {s.done}/{s.total}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="mt-3 text-sm text-dim">
          Every scenario runs several times, both agents and the Judge each time. This usually takes a few minutes.
        </p>
      )}
    </section>
  );
}
