// In-browser stand-in for the backend. Same function signatures as the real
// client in api.ts; replays the scripted events from fixtures.ts on timers.

import { MOCK_EVAL, MOCK_SCENARIOS } from "./fixtures";
import type {
  EvalResult,
  RunEvent,
  RunOverrides,
  Scenario,
  ScenarioSummary,
} from "./types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Pause before each event, so the lanes animate and the Judge appears to think.
const DELAY_MS: Record<RunEvent["event"], number> = {
  step: 380,
  lane_done: 250,
  diff: 700,
  verdict: 1400,
  committed: 400,
  error: 0,
  end: 100,
};

const runs = new Map<string, string>(); // run_id -> scenario_id

export async function getScenarios(): Promise<ScenarioSummary[]> {
  await sleep(150);
  return MOCK_SCENARIOS.map(({ scenario: { id, title, category } }) => ({
    id,
    title,
    category,
  }));
}

export async function getScenario(id: string): Promise<Scenario> {
  await sleep(150);
  const found = MOCK_SCENARIOS.find((m) => m.scenario.id === id);
  if (!found) throw new Error(`Unknown scenario: ${id}`);
  return structuredClone(found.scenario);
}

export async function startRun(body: {
  scenario_id: string;
  overrides?: RunOverrides;
}): Promise<{ run_id: string }> {
  await sleep(150);
  if (!MOCK_SCENARIOS.some((m) => m.scenario.id === body.scenario_id)) {
    throw new Error(`Unknown scenario: ${body.scenario_id}`);
  }
  const run_id = `mock-${Date.now()}`;
  runs.set(run_id, body.scenario_id);
  console.info("[mock] POST /run", body);
  return { run_id };
}

export function openRunStream(
  runId: string,
  onEvent: (ev: RunEvent) => void,
): () => void {
  const scenarioId = runs.get(runId);
  const events =
    MOCK_SCENARIOS.find((m) => m.scenario.id === scenarioId)?.events ?? [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let i = 0;
  const next = () => {
    const ev = events[i++];
    if (!ev) return;
    timer = setTimeout(() => {
      onEvent(ev);
      next();
    }, DELAY_MS[ev.event]);
  };
  next();
  return () => clearTimeout(timer);
}

export async function runEval(): Promise<EvalResult> {
  await sleep(2500);
  return MOCK_EVAL;
}
