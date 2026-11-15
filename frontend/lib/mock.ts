// In-browser stand-in for the backend. Same function signatures as the real
// client in api.ts; replays the scripted events from fixtures.ts on timers.

import { MOCK_EVAL, MOCK_SCENARIOS } from "./fixtures";
import type {
  EvalProgress,
  EvalResult,
  JudgeVerdict,
  Rule,
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
  rule_created: 300,
  error: 0,
  end: 100,
};

const runs = new Map<string, string>(); // run_id -> scenario_id

// The mock Patcher: after a scenario is blocked once, rerunning it is auto-blocked.
// (The real backend matches rules against the inbox text; by scenario is enough here.)
let rules: Rule[] = [];

export async function getRules(): Promise<Rule[]> {
  await sleep(100);
  return structuredClone(rules);
}

export async function clearRules(): Promise<{ cleared: boolean }> {
  await sleep(100);
  rules = [];
  return { cleared: true };
}

/** Add the rule_created event after a BLOCK, or replace the run with an auto-block. */
function withPatcher(scenarioId: string, events: RunEvent[]): RunEvent[] {
  const verdict = events.find((e) => e.event === "verdict")?.data as JudgeVerdict | undefined;
  if (!verdict || verdict.verdict !== "BLOCK") return events;

  const known = rules.find((r) => r.source_scenario === scenarioId);
  if (known) {
    const empty = { matched: [], worker_only: [], shadow_only: [], arg_mismatch: [] };
    return [
      { event: "lane_done", data: { lane: "worker", actions: [] } },
      { event: "lane_done", data: { lane: "shadow", actions: [] } },
      { event: "diff", data: empty },
      {
        event: "verdict",
        data: {
          ...verdict,
          source: "rule",
          rule_id: known.id,
          per_action: [],
          serves_user_request: null,
          introduces_new_goal_or_recipient: null,
          explanation: `This inbox matches rule #${known.id}, learned from an earlier block: ${known.pattern_description}`,
        },
      },
      { event: "committed", data: { actions: [] } },
      { event: "end", data: {} },
    ];
  }

  const worker = events.find((e) => e.event === "diff")?.data;
  const tool = worker && "worker_only" in worker ? worker.worker_only[0]?.tool : undefined;
  const rule: Rule = {
    id: rules.length + 1,
    pattern_description: "An external email tells the assistant to send account data to an address the user never mentioned.",
    match_terms: (verdict.culprit_quote ?? "").toLowerCase().split(/\W+/).filter((w) => w.length > 6).slice(0, 4),
    blocked_tool: tool ?? "send_email",
    source_scenario: scenarioId,
    source_email_id: verdict.culprit_email_id ?? "",
  };
  rules.push(rule);
  const end = events.findIndex((e) => e.event === "end");
  return [...events.slice(0, end), { event: "rule_created", data: { rule } }, ...events.slice(end)];
}

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
  const scenarioId = runs.get(runId) ?? "";
  const events = withPatcher(
    scenarioId,
    MOCK_SCENARIOS.find((m) => m.scenario.id === scenarioId)?.events ?? [],
  );
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

const MOCK_EVAL_MS = 9000;
let evalStartedAt: number | null = null;

export async function runEval(): Promise<EvalResult> {
  evalStartedAt = Date.now();
  await sleep(MOCK_EVAL_MS);
  evalStartedAt = null;
  return MOCK_EVAL;
}

/** Fake progress for the mock eval: jobs finish evenly over MOCK_EVAL_MS. */
export async function getEvalProgress(): Promise<EvalProgress> {
  if (evalStartedAt === null) return { running: false };
  const runs = MOCK_EVAL.runs_per_scenario;
  const rows = MOCK_EVAL.scenarios.map((s) => ({
    id: s.id,
    category: s.category,
    total: runs * (s.category === "benign" ? 2 : 1),
  }));
  const total = rows.reduce((n, r) => n + r.total, 0);
  const elapsed = Date.now() - evalStartedAt;
  let left = Math.min(total, Math.floor((elapsed / MOCK_EVAL_MS) * total));
  const done = left;
  return {
    running: true,
    runs_per_scenario: runs,
    total_jobs: total,
    done_jobs: done,
    elapsed_s: elapsed / 1000,
    scenarios: rows.map((r) => {
      const d = Math.min(r.total, left);
      left -= d;
      const verdicts = MOCK_EVAL.scenarios.find((s) => s.id === r.id)!.verdicts.slice(0, Math.min(runs, d));
      return { ...r, done: d, failed: 0, verdicts };
    }),
  };
}
