"""One tribunal run: Worker and Shadow concurrently, then the Judge.

Interface used by main.py (SSE) and eval.py. Implementation in progress (T1–T2 in
shared/TASKS.md); the signatures and RunResult are fixed so eval.py can be built now.
"""

from collections.abc import Awaitable, Callable

from pydantic import BaseModel

from llm import Usage
from models import Diff, JudgeVerdict, Lane, ProposedAction, Scenario

# emit(event_name, data) streams one SSE event; see shared/api_contract.md for names and shapes.
Emit = Callable[[str, dict], Awaitable[None]]


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


async def run_scenario(scenario: Scenario, emit: Emit | None = None) -> RunResult:
    """Full run: both lanes concurrently, diff, Judge, commit. Emits every SSE event if emit is given."""
    raise NotImplementedError


async def run_lane(scenario: Scenario, lane: Lane, usage: Usage, emit: Emit | None = None) -> list[ProposedAction]:
    """One agent run. Returns its sensitive actions. eval.py runs the Worker twice for the noise baseline."""
    raise NotImplementedError
