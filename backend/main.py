"""FastAPI app (spec §8). Shapes and event names follow shared/api_contract.md.

    uvicorn main:app --port 8000      # from backend/
"""

import asyncio
import json
import uuid

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import patcher
from env import apply_overrides, list_scenarios, load_scenario
from models import Scenario, ScenarioSummary
from pipeline import run_scenario

app = FastAPI(title="Shadow Agent Tribunal")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# run_id -> scenario with the UI's overrides applied. The run starts when the stream is opened,
# so the frontend never misses early events.
runs: dict[str, Scenario] = {}


class Overrides(BaseModel):
    user_request: str | None = None
    emails: list[dict] | None = None
    pages: list[dict] | None = None  # replaces the whole mock web, like emails replaces the inbox


class RunRequest(BaseModel):
    scenario_id: str
    overrides: Overrides = Overrides()


class EvalRequest(BaseModel):
    runs: int = 3


@app.get("/scenarios")
def get_scenarios() -> list[ScenarioSummary]:
    return list_scenarios()


@app.get("/scenarios/{scenario_id}")
def get_scenario(scenario_id: str) -> Scenario:
    try:
        return load_scenario(scenario_id)
    except KeyError:
        raise HTTPException(404, f"No scenario {scenario_id!r}")


@app.post("/run")
def start_run(body: RunRequest) -> dict:
    scenario = get_scenario(body.scenario_id)
    try:
        scenario = apply_overrides(scenario, body.overrides.user_request, body.overrides.emails,
                                   body.overrides.pages)
    except ValueError as exc:  # pydantic ValidationError on a malformed email
        raise HTTPException(422, f"Invalid overrides: {exc}")
    run_id = uuid.uuid4().hex[:12]
    runs[run_id] = scenario
    return {"run_id": run_id}


@app.get("/run/{run_id}/stream")
async def stream_run(run_id: str) -> StreamingResponse:
    scenario = runs.pop(run_id, None)
    if scenario is None:
        raise HTTPException(404, f"No pending run {run_id!r}")

    queue: asyncio.Queue[tuple[str, dict] | None] = asyncio.Queue()

    async def emit(event: str, data: dict) -> None:
        await queue.put((event, data))

    async def run() -> None:
        try:
            await run_scenario(scenario, emit, use_rules=True)
        except Exception as exc:
            await emit("error", {"message": f"{type(exc).__name__}: {exc}"})
        finally:
            await emit("end", {})
            await queue.put(None)

    async def events():
        task = asyncio.create_task(run())
        try:
            while (item := await queue.get()) is not None:
                event, data = item
                yield f"event: {event}\ndata: {json.dumps(data)}\n\n"
        finally:
            task.cancel()  # client disconnected: stop spending tokens

    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/eval")
async def post_eval(body: EvalRequest = EvalRequest()) -> dict:
    from eval import run_eval
    return await run_eval(body.runs)


@app.get("/eval/progress")
def eval_progress() -> dict:
    from eval import get_progress
    return get_progress()


@app.get("/eval/latest")
def eval_latest() -> dict:
    """The most recent saved eval, so the Metrics tab has numbers without running one."""
    from eval import RESULTS_DIR
    files = sorted(RESULTS_DIR.glob("eval_*.json"))
    if not files:
        raise HTTPException(404, "No saved eval results yet. Run python eval.py.")
    saved = json.loads(files[-1].read_text())
    return {**saved["result"], "timestamp": saved.get("timestamp"), "models": saved.get("models")}


@app.get("/rules")
def get_rules() -> list[patcher.Rule]:
    return patcher.rules


@app.delete("/rules")
def clear_rules() -> dict:
    """Demo reset: forget every learned rule."""
    patcher.rules.clear()
    return {"cleared": True}
