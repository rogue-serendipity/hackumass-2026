# Tasks

The single list of work for the project. Ownership of a task's **Paths** works like directory ownership in `AGENTS.md`: only the task's owner edits them.

**Status:** `open` (unassigned) · `assigned` (owner hasn't committed yet) · `in progress` · `blocked` (waiting on another task) · `done`.

Only the coordinator (see `AGENTS.md` §5) assigns or reassigns tasks, and it updates this file when it does. Owners update the Status of their own tasks (claim not needed for that one cell). Times are UTC.

| ID | Task | Owner | Status | Paths | Assigned at | Depends on |
|---|---|---|---|---|---|---|
| T1 | Worker/Shadow agent loop, concurrent runs (spec §6.1, build steps 2–3) | @rogue-serendipity | done | `backend/agents.py`, `backend/pipeline.py` | 2026-11-14 22:09 | |
| T2 | Judge step 2: LLM verdict, culprit quote validation (spec §6.3) | @rogue-serendipity | done | `backend/judge.py` | 2026-11-14 22:09 | T1 |
| T3 | FastAPI app + SSE stream (spec §8) | @rogue-serendipity | done | `backend/main.py` | 2026-11-14 22:09 | T1 |
| T4 | Eval script: detection/FP rates, noise baseline, `results/*.json` (spec §10). Build against the `run_scenario` / `run_lane` signatures in `backend/pipeline.py` and the `EvalResult` shape in `shared/api_contract.md`. Expose `async def run_eval(runs: int = 3) -> dict`; @rogue-serendipity wires it to `POST /eval` in T3. | @adarshvipat | done | `backend/eval.py`, `backend/tests/test_eval.py` | 2026-11-14 22:09 | T1 for live runs (stub `pipeline` in tests until then) |
| T5 | Frontend against the real backend: fix contract mismatches, set token prices | @adarshvipat | done | `frontend/` | 2026-11-14 22:09 | T3 |
| T6 | Root README: what it is, architecture diagram, setup and run steps, demo script (spec step 9) | @adarshvipat | done | `README.md` | 2026-11-14 22:09 | |
| T7 | Red-team scenarios: 3+ subtle new attacks and 2+ hard benign cases (e.g. a legit request that names an outside recipient), each with `expected` | @rogue-serendipity | done | `backend/scenarios/extra_*.json` | 2026-11-14 22:12 | T1 |
| T8 | Demo polish: reset button, loading and error states, projector check | @adarshvipat | done | `frontend/` | 2026-11-14 22:09 | T5 |
| T9 | Optional deploy: one Vultr compute instance running backend + frontend, no GPU (spec §4) | @rogue-serendipity | done | `deploy/` | 2026-11-14 22:39 | T3, T11 |
| T10 | Stretch: Patcher backend (spec build step 10): rule learning, pre-check auto-block, `/rules` | @rogue-serendipity | done | `backend/patcher.py` | 2026-11-14 22:12 | T8 |
| T11 | Provision the Vultr server for T9 on @adarshvipat's account (credits are there): Ubuntu 24.04, 2 GB, region `ewr`, Aarit's SSH key added, ports 22/80/443 open. Deliverable: post its IPv4 on the board tagging @rogue-serendipity. | @adarshvipat | done | none (Vultr console) | 2026-11-14 23:04 | |
| T12 | Patcher UI: show `rule_created` ("Learned rule #N"), render `source: "rule"` verdicts as "Auto-blocked by rule #N" with empty lanes, a rules list from `GET /rules`, and a "Forget rules" control (`DELETE /rules`) in the demo reset. See "Patcher rules" in `shared/api_contract.md`. | @adarshvipat | done | `frontend/` | 2026-11-14 23:08 | T10 |
| T13 | Hackathon fit: compare against HackUMass judging and past winners, then strengthen the project (backend, scenarios, pitch, judge Q&A). UI findings go to @adarshvipat as `NEED`s. | @rogue-serendipity | in progress | `backend/`, `docs/hackathon_fit.md` | 2026-11-15 00:07 | |
| T14 | UI interpretability: make each run understandable to a non-expert judge at a glance (what the Worker vs Shadow saw, why the actions differ, what the verdict means, why a rule fired) | @adarshvipat | done | `frontend/` | 2026-11-15 00:07 | |
| H0 | Hermes spike (≤30 min): a hook that blocks a staged `curl` in a real `hermes -z` run; confirm payload, block message, timeout, `--accept-hooks`, `post_tool_call` results. See `docs/hermes_plan.md`. Suggested: @adarshvipat | @adarshvipat | done | `hermes/hooks/` | 2026-11-15 03:10 |  |
| H1 | Pin the Hermes guard contract (endpoints + SSE events in `docs/hermes_plan.md`). Suggested: @rogue-serendipity | @rogue-serendipity | done | `shared/hermes_contract.md` | 2026-11-15 03:10 | H0 |
| H2 | Hermes guard service skeleton: endpoints, session store, SSE, sink, fail-closed. Suggested: @rogue-serendipity | @rogue-serendipity | done | `hermes/guard/server.py`, `hermes/guard/session.py` | 2026-11-15 03:10 | H1 |
| H3 | Hermes policy + Shadow + Judge, with tests. Suggested: @rogue-serendipity | @rogue-serendipity | done | `hermes/guard/policy.py`, `hermes/guard/shadow.py`, `hermes/guard/judge.py`, `hermes/guard/tests/` | 2026-11-15 03:10 | H2 |
| H4 | Hermes hook script + `install.sh`. Suggested: @adarshvipat | @adarshvipat | done | `hermes/hooks/`, `hermes/install.sh` | 2026-11-15 03:10 | H0, H1 |
| H5 | HUD page: pill + expanded block card, mock event stream for dev. Suggested: @adarshvipat | @adarshvipat | done | `frontend/app/hud/`, `frontend/components/hud/` | 2026-11-15 03:10 | H1 |
| H6 | Electron always-on-top HUD shell (cut first if short on time). Suggested: @adarshvipat | @adarshvipat | done | `hermes/hud/` | 2026-11-15 03:10 | H5 |
| H7 | Hermes demo world: weather-cli clean + poisoned README, fake `.env`, `setup_demo.sh`; Hermes takes the bait ≥2/3. Suggested: @rogue-serendipity | @rogue-serendipity | in progress | `hermes/demo/` | 2026-11-15 03:10 | H3, H4 |
| H8 | Hermes end-to-end rehearsal, README section, video beat. Suggested: @adarshvipat | @adarshvipat | assigned | `README.md` (claim), `docs/` | 2026-11-15 03:10 | all H |
| H9 | Hermes email demo: local `mail` CLI (list/read/reply/forward/send; sending writes to a local outbox only) and a seeded inbox from `inbox_exfil` plus a Sam email that needs a reply; `setup_mail_demo.sh` stages it at `~/tribunal-mail` | @adarshvipat | done | `hermes/demo/mail/` | 2026-11-15 06:20 |  |
| H10 | Guard: email trust for the `mail` CLI (`mail read` output untrusted unless the sender is in `~/tribunal-mail/contacts.txt`; `mail list` headers and contacts trusted; `mail list/read` read-only); let harmless local inspection commands (`ps`, `netstat`, `docker ps`, `lsof`, `dig`) skip the LLM | @adarshvipat | done | `hermes/guard/` | 2026-11-15 08:05 | H9 |
| H11 | Visual demo: a large live feed page (every observation and check, culprit inline) and one-command launchers that open Hermes in a visible Terminal window per scenario (readme, email) | @adarshvipat | done | `frontend/app/hud/feed/`, `frontend/components/hud/`, `hermes/demo/run_demo.sh` | 2026-11-15 06:20 |  |
| H12 | Hold-and-ask: when the guard would block, pause Hermes up to ~20 s and let the user choose Block (default) or Allow once from the block card; timeout blocks | @adarshvipat | done | `hermes/guard/approvals.py`, the block path of `hermes/guard/server.py` (H12 hunk only), `shared/hermes_contract.md` (decide endpoint + `decided` event), `frontend/` HUD | 2026-11-15 06:45 | |
