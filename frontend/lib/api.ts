// Client for the backend described in shared/api_contract.md. With
// NEXT_PUBLIC_USE_MOCK=1 every call is served by lib/mock.ts instead.

import * as mock from "./mock";
import {
  RUN_EVENT_NAMES,
  type EvalProgress,
  type EvalResult,
  type Rule,
  type RunEvent,
  type RunOverrides,
  type Scenario,
  type ScenarioSummary,
} from "./types";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";
export const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new Error(`Can't reach the backend at ${API_BASE}. Is it running?`);
  }
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      // non-JSON error body; keep the status line
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export function getScenarios(): Promise<ScenarioSummary[]> {
  return USE_MOCK ? mock.getScenarios() : request("/scenarios");
}

export function getScenario(id: string): Promise<Scenario> {
  return USE_MOCK
    ? mock.getScenario(id)
    : request(`/scenarios/${encodeURIComponent(id)}`);
}

export function startRun(body: {
  scenario_id: string;
  overrides?: RunOverrides;
}): Promise<{ run_id: string }> {
  return USE_MOCK ? mock.startRun(body) : request("/run", post(body));
}

/** Rules the Patcher has learned so far (in memory on the backend). */
export function getRules(): Promise<Rule[]> {
  return USE_MOCK ? mock.getRules() : request("/rules");
}

/** Forget every learned rule. Part of the demo reset. */
export function clearRules(): Promise<{ cleared: boolean }> {
  return USE_MOCK ? mock.clearRules() : request("/rules", { method: "DELETE" });
}

/** Progress of the evaluation in flight. Throws if the backend doesn't offer it. */
export function getEvalProgress(): Promise<EvalProgress> {
  return USE_MOCK ? mock.getEvalProgress() : request("/eval/progress");
}

export function runEval(runs?: number): Promise<EvalResult> {
  return USE_MOCK
    ? mock.runEval()
    : request("/eval", post(runs ? { runs } : {}));
}

/**
 * Subscribe to a run's event stream. Returns a function that closes it.
 * The stream closes itself after `end`; a dropped connection is reported as
 * an `error` followed by `end`, so callers only handle one shape.
 */
export function openRunStream(
  runId: string,
  onEvent: (ev: RunEvent) => void,
): () => void {
  if (USE_MOCK) return mock.openRunStream(runId, onEvent);

  const source = new EventSource(
    `${API_BASE}/run/${encodeURIComponent(runId)}/stream`,
  );
  let closed = false;
  const close = () => {
    closed = true;
    source.close();
  };

  for (const name of RUN_EVENT_NAMES) {
    source.addEventListener(name, (e) => {
      if (closed) return;
      // The server's `error` event and the browser's connection-failure event
      // share a name; only the server's carries data.
      const raw = (e as MessageEvent).data;
      if (typeof raw !== "string") {
        close();
        onEvent({
          event: "error",
          data: { message: "Lost the connection to the backend mid-run." },
        });
        onEvent({ event: "end", data: {} });
        return;
      }
      let data: unknown;
      try {
        data = JSON.parse(raw);
      } catch {
        data = { message: `Unreadable "${name}" event from the backend.` };
        onEvent({ event: "error", data } as RunEvent);
        return;
      }
      if (name === "end") close();
      onEvent({ event: name, data } as RunEvent);
    });
  }
  return close;
}
