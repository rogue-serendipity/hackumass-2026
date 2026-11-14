import type {
  Diff,
  Email,
  JudgeVerdict,
  Lane,
  ProposedAction,
  Rule,
  RunEvent,
  StepEvent,
  Verdict,
} from "./types";

export interface RunState {
  status: "idle" | "running" | "done";
  steps: Record<Lane, StepEvent[]>;
  laneDone: Record<Lane, boolean>;
  diff: Diff | null;
  verdict: JudgeVerdict | null;
  committed: ProposedAction[] | null;
  /** A rule the Patcher learned from this run's BLOCK. */
  ruleCreated: Rule | null;
  error: string | null;
  /** The inbox exactly as posted with this run; the Judge card highlights in it. */
  sentEmails: Email[];
  /** Wall-clock ms (Date.now()) for the run's milestones, for elapsed-time display. */
  startedAt: number | null;
  laneDoneAt: Record<Lane, number | null>;
  endedAt: number | null;
}

export type RunAction =
  | { type: "start"; emails: Email[]; at?: number }
  | { type: "event"; ev: RunEvent; at?: number }
  | { type: "reset" };

export const initialRunState: RunState = {
  status: "idle",
  steps: { worker: [], shadow: [] },
  laneDone: { worker: false, shadow: false },
  diff: null,
  verdict: null,
  committed: null,
  ruleCreated: null,
  error: null,
  sentEmails: [],
  startedAt: null,
  laneDoneAt: { worker: null, shadow: null },
  endedAt: null,
};

export function runReducer(state: RunState, action: RunAction): RunState {
  if (action.type === "reset") return initialRunState;
  if (action.type === "start") {
    return {
      ...initialRunState,
      status: "running",
      sentEmails: action.emails,
      startedAt: action.at ?? Date.now(),
    };
  }
  // Events from a stream that was already closed or replaced are dropped.
  if (state.status !== "running") return state;

  const { ev } = action;
  const at = action.at ?? Date.now();
  switch (ev.event) {
    case "step": {
      const lane = ev.data.lane;
      return {
        ...state,
        steps: { ...state.steps, [lane]: [...state.steps[lane], ev.data] },
      };
    }
    case "lane_done":
      return {
        ...state,
        laneDone: { ...state.laneDone, [ev.data.lane]: true },
        laneDoneAt: { ...state.laneDoneAt, [ev.data.lane]: at },
      };
    case "diff":
      return { ...state, diff: ev.data };
    case "verdict":
      return { ...state, verdict: ev.data };
    case "committed":
      return { ...state, committed: ev.data.actions };
    case "rule_created":
      return { ...state, ruleCreated: ev.data.rule };
    case "error":
      // Keep the first error: it's the cause; later ones are usually fallout.
      return { ...state, error: state.error ?? ev.data.message };
    case "end":
      return { ...state, status: "done", endedAt: at };
  }
}

export type CardKind =
  | "worker_only"
  | "matched"
  | "arg_mismatch"
  | "shadow_only";

export interface CardStatus {
  kind: CardKind;
  /** Args that differ between the lanes (from diff.arg_mismatch). */
  fields?: string[];
  /** Judge's decision for a worker_only action, once the verdict is in. */
  decision?: Verdict;
  reason?: string;
  hardRule?: boolean;
  targetKnown?: boolean;
  committed?: boolean;
}

export const cardKey = (lane: Lane, stepIndex: number) =>
  `${lane}:${stepIndex}`;

const keyOf = (a: ProposedAction) => cardKey(a.lane, a.step_index);

/**
 * Map each sensitive step card (`lane:step_index`) to how it should be
 * highlighted. Derived from diff/verdict/committed so it can't go stale.
 */
export function deriveCardStatuses(
  state: Pick<RunState, "diff" | "verdict" | "committed">,
): Record<string, CardStatus> {
  const out: Record<string, CardStatus> = {};
  const { diff, verdict, committed } = state;
  if (!diff) return out;

  for (const a of diff.shadow_only) out[keyOf(a)] = { kind: "shadow_only" };

  // arg_mismatch first, then matched: a pair listed in both stays green and
  // keeps the list of differing fields as a note.
  for (const m of diff.arg_mismatch) {
    out[keyOf(m.worker)] = { kind: "arg_mismatch", fields: m.fields };
    out[keyOf(m.shadow)] = { kind: "arg_mismatch", fields: m.fields };
  }
  for (const m of diff.matched) {
    for (const a of [m.worker, m.shadow]) {
      out[keyOf(a)] = { kind: "matched", fields: out[keyOf(a)]?.fields };
    }
  }

  diff.worker_only.forEach((a, i) => {
    const judged = verdict?.per_action.find((p) => p.action_index === i);
    out[keyOf(a)] = {
      kind: "worker_only",
      targetKnown: a.target_known,
      decision: judged?.decision,
      reason: judged?.reason,
      hardRule: judged?.hard_rule,
    };
  });

  for (const a of committed ?? []) {
    const k = keyOf(a);
    if (out[k]) out[k] = { ...out[k], committed: true };
  }
  return out;
}

/** The Patcher rule that auto-blocked this run before the agents ran, if any. */
export function autoBlockedBy(state: Pick<RunState, "verdict">): number | null {
  const v = state.verdict;
  return v?.source === "rule" ? (v.rule_id ?? 0) : null;
}

export type Phase =
  | "idle"
  | "agents"
  | "diffing"
  | "judging"
  | "done";

export function phaseOf(state: RunState): Phase {
  if (state.status === "idle") return "idle";
  if (state.status === "done" || state.verdict) return "done";
  if (state.diff) return "judging";
  if (state.laneDone.worker && state.laneDone.shadow) return "diffing";
  return "agents";
}
