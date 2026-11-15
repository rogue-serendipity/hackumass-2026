"""Hold-and-ask (H12): when the guard would block, pause Hermes briefly so the user can choose.

The block card in the HUD shows Block (the default) and Allow once. POST /hermes/decide resolves the
wait. If nobody answers in time, the action stays blocked. Allowing once never teaches the guard
anything: the next suspicious action is held again.
"""

import asyncio
import os
import time

# How long to wait for the user. Hermes's hook gives the guard 45 s in total, so the wait is also
# capped by whatever time the check itself already used (see window_for).
APPROVAL_S = float(os.getenv("TRIBUNAL_APPROVAL_S", "20"))
HOOK_BUDGET_S = 43.0  # stay under the hook's 45 s deadline, or the hook fails closed anyway

# Blocks the user may override. "error" means the guard itself failed; overriding that is allowed
# too, since the user sees exactly what's being run.
OVERRIDABLE = {"code", "llm", "error"}

_pending: dict[str, asyncio.Future] = {}


def key(session_id: str, check_id: str) -> str:
    return f"{session_id}/{check_id}"


def window_for(started: float) -> float:
    """Seconds left to wait for the user, given when the check started (time.monotonic())."""
    left = HOOK_BUDGET_S - (time.monotonic() - started)
    return max(0.0, min(APPROVAL_S, left))


async def wait(session_id: str, check_id: str, seconds: float) -> tuple[str, str]:
    """Wait for the user's choice. Returns (decision, by): ("allow"|"block", "user"|"timeout")."""
    fut: asyncio.Future = asyncio.get_running_loop().create_future()
    _pending[key(session_id, check_id)] = fut
    try:
        decision = await asyncio.wait_for(fut, seconds)
        return decision, "user"
    except asyncio.TimeoutError:
        return "block", "timeout"
    finally:
        _pending.pop(key(session_id, check_id), None)


def resolve(session_id: str, check_id: str, decision: str) -> bool:
    """Record the user's choice. False if that check isn't waiting (already decided or timed out)."""
    fut = _pending.get(key(session_id, check_id))
    if fut is None or fut.done():
        return False
    fut.set_result("allow" if decision == "allow" else "block")
    return True


def reset() -> None:
    for fut in _pending.values():
        if not fut.done():
            fut.set_result("block")
    _pending.clear()
