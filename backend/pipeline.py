"""One tribunal run: Worker and Shadow concurrently, then the Judge.

Used by main.py (SSE stream) and eval.py.
"""

import asyncio
import time

from openai import AsyncOpenAI
from pydantic import BaseModel

from agents import Emit, run_agent
from env import Env, untrusted_emails
from judge import diff, judge
from llm import Usage, make_client
from models import Diff, JudgeVerdict, Lane, ProposedAction, Scenario

_clients: dict[int, AsyncOpenAI] = {}


def client() -> AsyncOpenAI:
    """One client per event loop: an AsyncOpenAI client can't be reused across asyncio.run() calls."""
    loop = id(asyncio.get_running_loop())
    if loop not in _clients:
        _clients[loop] = make_client()
    return _clients[loop]


async def _ignore(event: str, data: dict) -> None:
    pass


class RunResult(BaseModel):
    scenario_id: str
    worker_actions: list[ProposedAction]
    shadow_actions: list[ProposedAction]
    diff: Diff
    verdict: JudgeVerdict
    committed: list[ProposedAction]
    latency_s: float
    input_tokens: int
    output_tokens: int


async def _run_env(scenario: Scenario, lane: Lane, usage: Usage, emit: Emit) -> Env:
    env = Env(scenario.state, lane)
    await run_agent(scenario, env, client(), usage, emit)
    await emit("lane_done", {"lane": lane, "actions": [a.model_dump(mode="json") for a in env.actions]})
    return env


async def run_lane(scenario: Scenario, lane: Lane, usage: Usage, emit: Emit | None = None) -> list[ProposedAction]:
    """One agent run. Returns its sensitive actions. eval.py runs the Worker twice for the noise baseline."""
    return (await _run_env(scenario, lane, usage, emit or _ignore)).actions


async def run_scenario(scenario: Scenario, emit: Emit | None = None) -> RunResult:
    """Full run: both lanes concurrently, diff, Judge, commit. Emits every SSE event if emit is given."""
    emit = emit or _ignore
    usage = Usage()
    start = time.monotonic()

    worker, shadow = await asyncio.gather(
        _run_env(scenario, "worker", usage, emit),
        _run_env(scenario, "shadow", usage, emit),
    )

    d = diff(worker.actions, shadow.actions, scenario.user_request, scenario.state.contacts)
    await emit("diff", d.model_dump(mode="json"))

    verdict = await judge(scenario, d, untrusted_emails(scenario.state, worker.read_ids), client(), usage)
    await emit("verdict", verdict.model_dump(mode="json"))

    # Spec §3: on BLOCK, nothing sensitive is committed.
    committed = worker.actions if verdict.verdict == "APPROVE" else []
    await emit("committed", {"actions": [a.model_dump(mode="json") for a in committed]})

    return RunResult(
        scenario_id=scenario.id,
        worker_actions=worker.actions,
        shadow_actions=shadow.actions,
        diff=d,
        verdict=verdict,
        committed=committed,
        latency_s=round(time.monotonic() - start, 2),
        input_tokens=usage.input_tokens,
        output_tokens=usage.output_tokens,
    )
