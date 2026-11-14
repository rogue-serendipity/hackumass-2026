# API contract: backend ↔ frontend

The backend (`backend/`, @rogue-serendipity) implements this; the frontend (`frontend/`, @adarshvipat) consumes it. It expands §8 of `SHADOW_TRIBUNAL_SPEC.md` into exact shapes so both sides can build in parallel. The frontend can mock these responses until the backend is up.

**Changing this file:** post a `CLAIM` on the board first and tag the other side in your `DONE`, since a change here breaks the other half.

## Basics

- Backend runs at `http://localhost:8000`. The frontend reads the base URL from `NEXT_PUBLIC_API_BASE` (default `http://localhost:8000`).
- The backend allows CORS from `http://localhost:3000`.
- All bodies are JSON. Errors return a non-2xx status with `{"detail": "<message>"}` (FastAPI default).

## Shared types

```ts
type Lane = "worker" | "shadow";
type Verdict = "APPROVE" | "BLOCK";

interface Email {
  id: string;            // "e1"
  from: string;
  to: string;
  subject: string;
  timestamp: string;     // ISO 8601, no timezone: "2026-11-14T09:12:00"
  body: string;
  trusted: boolean;      // false = shown as "external" in the UI
}

interface FileItem { id: string; name: string; shared_with: string[] }

interface State {
  user: { name: string; email: string };
  contacts: string[];
  inbox: Email[];
  files: FileItem[];
  balance: number;
}

interface ScenarioSummary {
  id: string;
  title: string;
  category: "attack" | "benign";
}

interface Scenario extends ScenarioSummary {
  user_request: string;
  state: State;
  expected: Verdict;
  attacker_targets: string[];  // addresses the attack tries to reach; [] for benign scenarios
}

type SensitiveTool = "send_email" | "forward_email" | "transfer_money" | "share_file";

interface ProposedAction {
  lane: Lane;
  index: number;          // order among this lane's sensitive actions, starting at 0
  step_index: number;     // `index` of the tool_call step event that proposed it
  tool: SensitiveTool;
  args: Record<string, unknown>;  // exactly the tool args from spec §5.2
  target_known?: boolean; // only set on diff.worker_only items
}
```

## Endpoints

### `GET /scenarios` → `ScenarioSummary[]`

### `GET /scenarios/{id}` → `Scenario`

### `POST /run` → `{ "run_id": string }`

```json
{
  "scenario_id": "inbox_exfil",
  "overrides": {
    "user_request": "optional replacement request",
    "emails": [ /* optional: full Email[] replacing state.inbox */ ]
  }
}
```

`overrides` and both its fields are optional. `emails` replaces the whole inbox, so the inbox editor sends every email back, not just edited ones.

### `GET /run/{run_id}/stream` → Server-Sent Events

Each event uses a named SSE `event:` line with a JSON `data:` line, so the frontend uses `EventSource` with `addEventListener("<name>", ...)`. Events arrive in this order: `step` events from both lanes interleaved, one `lane_done` per lane, then `diff`, `verdict`, `committed`, and finally `end`. An `error` can arrive at any point and is followed by `end`.

| Event | `data` |
|---|---|
| `step` | `{ lane: Lane, index: number, type: "tool_call" \| "tool_result" \| "message", data: StepData }` |
| `lane_done` | `{ lane: Lane, actions: ProposedAction[] }` (that lane's sensitive actions) |
| `diff` | `Diff` |
| `verdict` | `JudgeVerdict` |
| `committed` | `{ actions: ProposedAction[] }` (the approved Worker actions; empty when everything was blocked) |
| `error` | `{ message: string }` |
| `end` | `{}`. The stream is over; close the `EventSource`. |

```ts
// step.data, depending on step.type
type StepData =
  | { tool: string; args: Record<string, unknown>; sensitive: boolean }  // tool_call
  | { tool: string; result: unknown }  // tool_result; sensitive tools return {"status": "queued_for_review"}
  | { text: string };                  // message (the agent's final summary)

interface Diff {
  matched: { worker: ProposedAction; shadow: ProposedAction }[];
  worker_only: ProposedAction[];   // the red, pulsing cards
  shadow_only: ProposedAction[];
  arg_mismatch: { worker: ProposedAction; shadow: ProposedAction; fields: string[] }[];
}

interface JudgeVerdict {
  verdict: Verdict;
  source: "fast_path" | "llm";     // fast_path = worker_only was empty, no LLM call
  per_action: {
    action_index: number;          // index into diff.worker_only
    decision: Verdict;
    reason: string;
    hard_rule: boolean;            // true if the code rule forced BLOCK (spec §6.3)
  }[];
  serves_user_request: boolean | null;              // null on fast_path
  introduces_new_goal_or_recipient: boolean | null; // null on fast_path
  culprit_email_id: string | null;
  culprit_quote: string | null;    // exact substring of that email's body; highlight it
  explanation: string;             // 1–2 plain-English sentences for the Judge card
}
```

To highlight a card after the diff arrives, find the `step` event whose `lane` and `index` equal the action's `lane` and `step_index`.

### `POST /eval` → `EvalResult`

Request: `{ "runs": 3 }` (optional, default 3). This takes minutes; show a spinner.

```ts
interface EvalResult {
  runs_per_scenario: number;
  attack_detection_rate: number;     // 0–1
  benign_false_positive_rate: number;// 0–1
  noise_divergence_rate: number;     // 0–1, Worker-vs-Worker divergence on benign scenarios
  avg_latency_s: number;
  total_input_tokens: number;
  total_output_tokens: number;
  scenarios: {
    id: string;
    title: string;
    category: "attack" | "benign";
    expected: Verdict;
    verdicts: Verdict[];             // one per run
    passed: number;                  // runs where verdict == expected
  }[];
}
```
