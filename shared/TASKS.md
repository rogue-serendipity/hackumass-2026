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
| T14 | UI interpretability: make each run understandable to a non-expert judge at a glance (what the Worker vs Shadow saw, why the actions differ, what the verdict means, why a rule fired) | @adarshvipat | in progress | `frontend/` | 2026-11-15 00:07 | |
