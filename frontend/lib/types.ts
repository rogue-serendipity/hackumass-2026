// Types from shared/api_contract.md. Keep in sync with that file; don't extend
// the wire shapes here.

export type Lane = "worker" | "shadow";
export type Verdict = "APPROVE" | "BLOCK";

export interface Email {
  id: string;
  from: string;
  to: string;
  subject: string;
  timestamp: string; // ISO 8601, no timezone
  body: string;
  trusted: boolean; // false = shown as "external"
}

export interface FileItem {
  id: string;
  name: string;
  shared_with: string[];
}

export interface State {
  user: { name: string; email: string };
  contacts: string[];
  inbox: Email[];
  files: FileItem[];
  balance: number;
}

export interface ScenarioSummary {
  id: string;
  title: string;
  category: "attack" | "benign";
}

export interface Scenario extends ScenarioSummary {
  user_request: string;
  state: State;
  expected: Verdict;
  attacker_targets: string[]; // addresses the attack tries to reach; [] for benign
}

export type SensitiveTool =
  | "send_email"
  | "forward_email"
  | "transfer_money"
  | "share_file";

export interface ProposedAction {
  lane: Lane;
  index: number; // order among this lane's sensitive actions
  step_index: number; // `index` of the tool_call step that proposed it
  tool: SensitiveTool;
  args: Record<string, unknown>;
  target_known?: boolean; // only on diff.worker_only items
}

export interface RunOverrides {
  user_request?: string;
  emails?: Email[];
}

export interface ToolCallData {
  tool: string;
  args: Record<string, unknown>;
  sensitive: boolean;
}
export interface ToolResultData {
  tool: string;
  result: unknown;
}
export interface MessageData {
  text: string;
}

export type StepEvent =
  | { lane: Lane; index: number; type: "tool_call"; data: ToolCallData }
  | { lane: Lane; index: number; type: "tool_result"; data: ToolResultData }
  | { lane: Lane; index: number; type: "message"; data: MessageData };

export interface Diff {
  matched: { worker: ProposedAction; shadow: ProposedAction }[];
  worker_only: ProposedAction[];
  shadow_only: ProposedAction[];
  arg_mismatch: {
    worker: ProposedAction;
    shadow: ProposedAction;
    fields: string[];
  }[];
}

export interface JudgeVerdict {
  verdict: Verdict;
  source: "fast_path" | "llm" | "rule"; // rule = auto-blocked by a Patcher rule; agents never ran
  per_action: {
    action_index: number; // index into diff.worker_only
    decision: Verdict;
    reason: string;
    hard_rule: boolean;
  }[];
  serves_user_request: boolean | null;
  introduces_new_goal_or_recipient: boolean | null;
  culprit_email_id: string | null;
  culprit_quote: string | null;
  explanation: string;
  rule_id?: number | null; // the Patcher rule that auto-blocked this run (source == "rule")
}

/** A rule the Patcher learned from a BLOCK. Reruns that match it are auto-blocked. */
export interface Rule {
  id: number; // "rule #1" in the UI
  pattern_description: string;
  match_terms: string[];
  blocked_tool: SensitiveTool;
  source_scenario: string;
  source_email_id: string;
}

export interface EvalResult {
  runs_per_scenario: number;
  hijack_rate: number; // attack runs where the Worker was hijacked / attack runs
  attack_detection_rate: number | null; // hijacked runs that got BLOCK; null if none were hijacked
  benign_false_positive_rate: number;
  noise_divergence_rate: number;
  avg_latency_s: number;
  total_input_tokens: number;
  total_output_tokens: number;
  scenarios: {
    id: string;
    title: string;
    category: "attack" | "benign";
    expected: Verdict;
    verdicts: Verdict[];
    hijacked: number; // always 0 for benign scenarios
    passed: number;
  }[];
}

// One entry per SSE event name on GET /run/{run_id}/stream.
export type RunEvent =
  | { event: "step"; data: StepEvent }
  | { event: "lane_done"; data: { lane: Lane; actions: ProposedAction[] } }
  | { event: "diff"; data: Diff }
  | { event: "verdict"; data: JudgeVerdict }
  | { event: "committed"; data: { actions: ProposedAction[] } }
  | { event: "rule_created"; data: { rule: Rule } }
  | { event: "error"; data: { message: string } }
  | { event: "end"; data: Record<string, never> };

export const RUN_EVENT_NAMES = [
  "step",
  "lane_done",
  "diff",
  "verdict",
  "committed",
  "rule_created",
  "error",
  "end",
] as const;
