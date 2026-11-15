# Hermes guard contract

The guard service (`hermes/guard/`, @rogue-serendipity, H2–H3) implements this. The Hermes hook (`hermes/hooks/tribunal_hook.py`, @adarshvipat, H4) and the HUD (`frontend/app/hud/`, @adarshvipat, H5) consume it. Background: `docs/hermes_plan.md`.

**Changing this file:** post a `CLAIM` first and tag the other side in your `DONE`.

## Basics

- The guard runs at `http://127.0.0.1:8100` (`uvicorn server:app --port 8100` from `hermes/guard/`). The hook reads the base URL from `TRIBUNAL_GUARD_URL` (default `http://127.0.0.1:8100`); the HUD reads it from `NEXT_PUBLIC_GUARD_BASE` (same default).
- The guard allows CORS from `http://localhost:3000` and `http://127.0.0.1:3000`.
- All bodies are JSON. Unknown extra fields are ignored, so the hook may forward Hermes's payload fields as-is.

### Timeouts and failing closed

| Layer | Limit | On timeout or error |
|---|---|---|
| Hermes hook timeout (`config.yaml`) | 60 s | Hermes fails **open**, so the hook must answer first |
| Hook → `POST /hermes/check` | 45 s | Hook prints **block**, reason `"Tribunal unavailable: <why>"` |
| Guard's own work per check | 40 s | Guard returns **block**, reason `"Tribunal timed out"` |

The hook fails **closed** for every `pre_tool_call` it's registered on (connection refused, non-200, bad JSON, timeout). Errors on `/hermes/event` are ignored (the hook prints nothing and exits 0).

## Shared types

```ts
type Decision = "allow" | "block";

// Where a piece of content came from. Shown in the HUD and used to attribute the culprit.
//   "user"                  the user's own message (trusted)
//   "file:<path>"           a file Hermes read, path as Hermes gave it (README.md, ~/tribunal-demo/x/README.md)
//   "web:<url>"             a web page or search result
//   "terminal:<command>"    output of a command Hermes ran (first 80 chars of the command)
//   "tool:<tool_name>"      anything else
type Source = string;

interface Culprit {
  source: Source;          // the untrusted content that caused the blocked action
  observation_id: string;  // which observation it came from ("o3")
  quote: string | null;    // exact substring of that observation's content, for highlighting
}

// JudgeVerdict is the existing shape from shared/api_contract.md (backend/models.py), reused as-is.
// In it, culprit_email_id holds the observation_id and culprit_quote the quote.
```

## Endpoints

### `POST /hermes/event` → `{}`

The hook forwards `pre_llm_call` and `post_tool_call`. Always returns 200 quickly; recording never blocks Hermes.

```json
{
  "event": "pre_llm_call" | "post_tool_call",
  "session_id": "…",              // from Hermes's payload
  "cwd": "/Users/…/tribunal-demo/weather-cli",

  // pre_llm_call
  "user_message": "Set up the project in …",
  "is_first_turn": true,

  // post_tool_call
  "tool_name": "read_file",
  "tool_input": { "path": "README.md" },
  "result": "…"                   // Hermes's extra.result, as a string (the hook JSON-encodes non-strings)
}
```

The first `pre_llm_call` with `is_first_turn: true` (or the first event for an unknown `session_id`) starts a session; its `user_message` is the trusted task. Later user messages in the same session are appended to the task. Each `post_tool_call` becomes an **observation** (`o1`, `o2`, …), tagged trusted or untrusted by the guard's policy.

### `POST /hermes/check` → `CheckResult`

The hook calls this from `pre_tool_call`, and the response tells it whether to block. The guard emits `checking` and then `allowed` or `blocked` on the stream.

```json
{ "session_id": "…", "tool_name": "terminal", "tool_input": { "command": "curl …" }, "cwd": "…" }
```

```ts
type CheckResult =
  | {
      decision: "allow";
      check_id: string;          // "c1", "c2", … per session
      source: "skip" | "code" | "llm" | "user";  // skip = not sensitive; code = rules alone; llm = Shadow + Judge; user = the user chose Allow once (H12)
      summary: string;           // one line, e.g. "terminal: pip install -r requirements.txt"
    }
  | {
      decision: "block";
      check_id: string;
      source: "code" | "llm" | "error";  // error = the guard failed or timed out (fail closed)
      summary: string;
      reason: string;            // shown to Hermes as the block reason; one or two sentences
      shadow_summary: string | null;  // what the Shadow did instead, e.g. "terminal: pip install …", or "nothing"
      culprit: Culprit | null;
      verdict: JudgeVerdict | null;   // null when source is "code" or "error"
    };
```

**What the hook prints:** on `allow`, nothing (exit 0). On `block`: `{"decision":"block","reason":"<reason>"}`.

### `GET /hermes/stream` → Server-Sent Events

Named events (`event:` line, then a JSON `data:` line), for the HUD. The stream stays open; send `: ping` comments every 15 s. Every event has `session_id` except `reset`.

| Event | `data` |
|---|---|
| `session_start` | `{ session_id, task }` |
| `observed` | `{ session_id, observation_id, tool_name, source, trusted }` |
| `checking` | `{ session_id, check_id, tool_name, summary }` |
| `allowed` | `{ session_id, check_id, tool_name, summary, source: "skip" \| "code" \| "llm" }` |
| `blocked` | `{ session_id, check_id, tool_name, summary, shadow_summary, reason, explanation, culprit, source }` (`explanation` is `verdict.explanation` or `reason`) |
| `decided` | `{ session_id, check_id, decision: "allow" \| "block", by: "user" \| "timeout" }`. The outcome of a held block (H12). After `allow`, the action ran. |
| `sink_hit` | `{ session_id: null, bytes, preview }`. Something reached `/collect`, so an attack got through. The HUD should show this loudly. |
| `reset` | `{}` |

### `GET /hermes/state` → `GuardState`

A snapshot, so the HUD can render correctly after a reload, before new stream events arrive.

```ts
interface GuardState {
  sessions: {
    session_id: string;
    task: string;
    observations: { observation_id: string; tool_name: string; source: Source; trusted: boolean }[];
    checks: { check_id: string; tool_name: string; summary: string; decision: Decision | "pending";
              source: string; reason?: string; culprit?: Culprit | null }[];
  }[];                      // newest session last
  sink_hits: number;
}
```

### Hold-and-ask (H12)

When the guard would block, it doesn't answer the hook right away. It emits `blocked` with two extra fields, then waits up to `TRIBUNAL_APPROVAL_S` (default 20 s, and always short enough to answer within the hook's 45 s) for the user:

- `awaiting_user: boolean`: the block card should show **Block** (default) and **Allow once**.
- `decide_by: number | null`: epoch milliseconds when the wait ends, for a countdown.

#### `POST /hermes/decide` → `{ "ok": true }`

```json
{ "session_id": "…", "check_id": "c3", "decision": "allow" | "block", "remember": false }
```

`remember: true` is the card's "Don't ask again for this action" box. For the rest of the session, the same action (same tool and summary) gets that decision without holding. An allow is emitted as `allowed` with `source: "user", remembered: true`. A block is emitted as `blocked` with `awaiting_user: false, remembered: true`, and its reason starts with "You chose to always block this action." `/hermes/reset` forgets these.

Returns 409 if that check isn't waiting any more (already decided, timed out, or reset), and 422 for any other `decision`. The guard then emits `decided`. **On `allow`,** `/hermes/check` returns `{decision: "allow", source: "user", …}` and the action runs once. **On `block` or timeout,** the hook gets the original block. Allowing once never creates a rule; the next suspicious action is held again.

### `POST /hermes/reset` → `{ "cleared": true }`

Forget all sessions and sink hits. Emits `reset`.

### `POST /collect` (also `GET`, `PUT`) → `{ "ok": true }`

The demo's fake exfiltration endpoint. It **only logs** the byte count and the first 200 characters, and emits `sink_hit`. Nothing is stored.
