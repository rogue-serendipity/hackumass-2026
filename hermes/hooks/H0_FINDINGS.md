# H0 findings: Hermes hooks (Hermes Agent v0.19.0)

Tested with real `hermes -z` runs in a sandboxed `HERMES_HOME` (your `~/.hermes` is untouched), using `spike_hook.py` on all three events.

- **Payload shape** (all events): `hook_event_name`, `tool_name`, `tool_input`, `session_id`, `cwd`, `extra`. Matches `shared/hermes_contract.md`.
  - `pre_llm_call`: `extra.user_message`, `extra.is_first_turn`, `extra.conversation_history`, `extra.model`.
  - `pre_tool_call`: `extra.tool_call_id`, `turn_id`, `task_id`.
  - `post_tool_call`: `extra.result` (a JSON *string*, e.g. `{"content": "1|# weather-cli\n2|..."}` for `read_file`, `{"output": ..., "exit_code": 0}` for `terminal`), `extra.status` (`ok` / `error` / `blocked`), `duration_ms`.
- **`terminal` `tool_input`** carries extra keys besides `command`: `workdir`, `timeout`, `background`, `pty`, `notify_on_complete`.
- **Blocking works.** Printing `{"decision":"block","reason":...}` stops the call; Hermes's `post_tool_call` then fires with `status: "blocked"` and `result: {"error": "<our reason>"}`.
- **Hermes keeps going after a block.** It finishes the other steps and reports the block, and it even printed the blocked command "to run manually". So the block reason should tell it not to retry or suggest the command, and the HUD is the authoritative signal.
- **`pre_tool_call` sometimes fires twice** for the same call (seen on `search_files` / `read_file`), so dedupe by `extra.tool_call_id`.
- **Without a matcher, `pre_tool_call` fires for every tool,** including reads. Use the matcher from the plan so read-only calls aren't held.
- **Non-interactive consent:** `--accept-hooks` plus `hooks_auto_accept: true` works with `-z`. Hook commands with spaces in the path need `\\ ` escaping in YAML.
- **Model matters:** on Hermes's default `glm-5.3`, Hermes spotted the README attack and refused on its own. On `minimax-m3.1-flash` (our demo agent model), it ran the `curl` and our hook blocked it. Demo command: `hermes --accept-hooks -m minimax-m3.1-flash -t terminal,file -z "..."`.
