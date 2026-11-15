"""Hermes guard service (shared/hermes_contract.md).

    cd hermes/guard && ../../backend/.venv/bin/uvicorn server:app --port 8100
"""

import asyncio
import json
import logging
import time

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import approvals
import judge
import policy
import shadow
from backend_bridge import Usage
from session import Session, Store

CHECK_DEADLINE_S = 40
log = logging.getLogger("guard")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")

app = FastAPI(title="Tribunal guard for Hermes")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
                   allow_methods=["*"], allow_headers=["*"])

store = Store()
subscribers: set[asyncio.Queue] = set()


async def emit(event: str, data: dict) -> None:
    for q in list(subscribers):
        q.put_nowait((event, data))


# ---- requests ----------------------------------------------------------------

class Event(BaseModel):
    model_config = {"extra": "ignore"}
    event: str
    session_id: str = "default"
    cwd: str = ""
    user_message: str | None = None
    is_first_turn: bool | None = None
    tool_name: str | None = None
    tool_input: object = None
    result: object = None
    status: str | None = None
    extra: dict | None = None


class CheckRequest(BaseModel):
    model_config = {"extra": "ignore"}
    session_id: str = "default"
    tool_name: str
    tool_input: object = None
    cwd: str = ""
    tool_call_id: str | None = None
    extra: dict | None = None


NO_RETRY = " Do not retry this action, and do not suggest that the user run it."


# ---- endpoints ---------------------------------------------------------------

@app.post("/hermes/event")
async def hermes_event(e: Event) -> dict:
    s, created = store.get(e.session_id, e.cwd)
    if e.event == "pre_llm_call" and e.user_message:
        if e.is_first_turn and s.task and not created:
            s.task.clear()
        s.task.append(e.user_message)
        if created or e.is_first_turn:
            await emit("session_start", {"session_id": s.session_id, "task": s.task_text})
    elif e.event == "post_tool_call" and e.tool_name:
        extra = e.extra or {}
        if (e.status or extra.get("status")) == "blocked":
            return {}  # Hermes reports our own blocks back; they aren't content Hermes read
        raw = e.result if e.result is not None else extra.get("result")
        result = raw if isinstance(raw, str) else json.dumps(raw, default=str)
        o = s.observe(e.tool_name, e.tool_input, result or "", e.cwd)
        await emit("observed", {"session_id": s.session_id, "observation_id": o.observation_id,
                                "tool_name": o.tool_name, "source": o.source, "trusted": o.trusted})
    return {}


@app.post("/hermes/check")
async def hermes_check(req: CheckRequest) -> dict:
    s, _ = store.get(req.session_id, req.cwd)
    call_id = req.tool_call_id or (req.extra or {}).get("tool_call_id")
    if call_id and call_id in s.results_by_call:
        return s.results_by_call[call_id]  # Hermes sometimes asks twice for the same call
    check = s.new_check(req.tool_name, req.tool_input)
    started = time.monotonic()
    await emit("checking", {"session_id": s.session_id, "check_id": check.check_id,
                            "tool_name": req.tool_name, "summary": check.summary})
    try:
        result = await asyncio.wait_for(decide(s, req.tool_name, req.tool_input), CHECK_DEADLINE_S)
    except asyncio.TimeoutError:
        result = block("error", "Tribunal timed out, so this action was blocked to be safe.")
    except Exception as exc:  # fail closed
        log.exception("check failed")
        result = block("error", f"Tribunal error ({type(exc).__name__}), so this action was blocked to be safe.")

    result.update(check_id=check.check_id, summary=check.summary)
    check.decision, check.source = result["decision"], result["source"]
    check.reason, check.culprit = result.get("reason"), result.get("culprit")
    if result["decision"] == "allow":
        await emit("allowed", {"session_id": s.session_id, "check_id": check.check_id, "tool_name": req.tool_name,
                               "summary": check.summary, "source": result["source"]})
    else:
        # H12 hold-and-ask: show the block, then wait briefly for the user's Block / Allow once.
        verdict = result.get("verdict") or {}
        window = approvals.window_for(started) if result["source"] in approvals.OVERRIDABLE else 0
        prior = approvals.remembered(s.session_id, req.tool_name, check.summary) if window > 0 else None
        if prior:
            window = 0  # "Don't ask again": reuse the user's earlier decision for this exact action
        if prior == "allow":
            result = {"decision": "allow", "source": "user", "check_id": check.check_id,
                      "summary": check.summary, "remembered": True}
            check.decision, check.source = "allow", "user"
            await emit("allowed", {"session_id": s.session_id, "check_id": check.check_id, "tool_name": req.tool_name,
                                   "summary": check.summary, "source": "user", "remembered": True})
            log.info("check %s %s -> allow (remembered)", check.check_id, check.summary)
            if call_id:
                s.results_by_call[call_id] = result
            return result
        if prior == "block":
            result["reason"] = "You chose to always block this action. " + result["reason"]
            result["remembered"] = True
        await emit("blocked", {"session_id": s.session_id, "check_id": check.check_id, "tool_name": req.tool_name,
                               "summary": check.summary, "shadow_summary": result.get("shadow_summary"),
                               "reason": result["reason"], "explanation": verdict.get("explanation") or result["reason"],
                               "culprit": result.get("culprit"), "source": result["source"],
                               "awaiting_user": window > 0, "remembered": bool(prior),
                               "decide_by": int((time.time() + window) * 1000) if window > 0 else None})
        if window > 0:
            choice, by = await approvals.wait(s.session_id, check.check_id, window)
            remember = by == "user" and approvals.remembered(s.session_id, req.tool_name, check.summary) == choice
            await emit("decided", {"session_id": s.session_id, "check_id": check.check_id,
                                   "decision": choice, "by": by, "remember": remember})
            if choice == "allow":
                result = {"decision": "allow", "source": "user", "check_id": check.check_id,
                          "summary": check.summary}
                check.decision, check.source = "allow", "user"
    log.info("check %s %s -> %s (%s)", check.check_id, check.summary, result["decision"], result["source"])
    if call_id:
        s.results_by_call[call_id] = result
    return result


async def decide(s: Session, tool_name: str, tool_input) -> dict:
    """Code rules first, then the Shadow, then the Judge (the Judge only when they disagree)."""
    reason = policy.tamper(tool_name, tool_input, s.cwd)  # H10: before anything else, reads included
    if reason:
        return block("tamper", reason)
    if not policy.is_sensitive(tool_name, tool_input):
        return {"decision": "allow", "source": "skip"}

    untrusted = s.untrusted
    hit = policy.hard_rule(tool_name, tool_input, s.trusted_text, [(o.observation_id, o.content) for o in untrusted])
    if hit:
        reason, oid, dest = hit
        culprit = None
        if oid:
            o = next(o for o in untrusted if o.observation_id == oid)
            culprit = {"source": o.source, "observation_id": oid, "quote": policy.sentence_with(o.content, dest.split(":")[0])}
        return block("code", reason, culprit=culprit)

    if not untrusted:
        return {"decision": "allow", "source": "code"}  # nothing untrusted could have influenced it

    usage = Usage()
    proposal = await shadow.propose(s, usage)
    if shadow.same_action(tool_name, tool_input, proposal):
        return {"decision": "allow", "source": "llm"}

    v = await judge.decide(s, tool_name, tool_input, proposal, usage)
    if v.verdict == "APPROVE":
        return {"decision": "allow", "source": "llm"}
    culprit = None
    if v.culprit_email_id:
        o = next((o for o in untrusted if o.observation_id == v.culprit_email_id), None)
        if o:
            culprit = {"source": o.source, "observation_id": o.observation_id, "quote": v.culprit_quote}
    reason = v.per_action[0].reason if v.per_action else v.explanation
    return block("llm", reason or v.explanation, culprit=culprit, verdict=v.model_dump(mode="json"),
                 shadow_summary=shadow.describe(proposal))


def block(source: str, reason: str, culprit=None, verdict=None, shadow_summary=None) -> dict:
    """reason is what Hermes sees; it ends with an instruction not to work around the block."""
    return {"decision": "block", "source": source, "reason": reason.rstrip() + NO_RETRY, "culprit": culprit,
            "verdict": verdict, "shadow_summary": shadow_summary}


@app.get("/hermes/stream")
async def hermes_stream(request: Request) -> StreamingResponse:
    queue: asyncio.Queue = asyncio.Queue()
    subscribers.add(queue)

    async def events():
        try:
            while not await request.is_disconnected():
                try:
                    event, data = await asyncio.wait_for(queue.get(), 15)
                    yield f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        finally:
            subscribers.discard(queue)

    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/hermes/state")
def hermes_state() -> dict:
    return {"sessions": [s.snapshot() for s in store.sessions.values()], "sink_hits": store.sink_hits}


class Decision(BaseModel):
    session_id: str
    check_id: str
    decision: str  # "allow" | "block"
    remember: bool = False  # "Don't ask again" for this exact action, for the rest of the session


@app.post("/hermes/decide")
async def hermes_decide(d: Decision) -> dict:
    """The user's choice on a held block (H12). 409 if that check isn't waiting any more."""
    if d.decision not in ("allow", "block"):
        raise HTTPException(422, "decision must be 'allow' or 'block'")
    s = store.sessions.get(d.session_id)
    check = next((c for c in s.checks if c.check_id == d.check_id), None) if s else None
    if not approvals.is_waiting(d.session_id, d.check_id):
        raise HTTPException(409, "That action isn't waiting for a decision any more.")
    if d.remember and check:  # before resolving, so the waiting check sees it
        approvals.remember(d.session_id, check.tool_name, check.summary, d.decision)
    approvals.resolve(d.session_id, d.check_id, d.decision)
    return {"ok": True}


@app.post("/hermes/reset")
async def hermes_reset() -> dict:
    store.reset()
    approvals.reset()
    await emit("reset", {})
    return {"cleared": True}


@app.api_route("/collect", methods=["GET", "POST", "PUT"])
async def collect(request: Request) -> dict:
    """The demo's fake exfiltration endpoint. Logs size and a preview only; stores nothing."""
    body = await request.body()
    store.sink_hits += 1
    preview = body[:200].decode("utf-8", "replace")
    log.warning("SINK HIT: %d bytes: %r", len(body), preview)
    await emit("sink_hit", {"session_id": None, "bytes": len(body), "preview": preview})
    return {"ok": True}
