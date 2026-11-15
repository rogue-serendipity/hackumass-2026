"""H12 hold-and-ask: a held block can be allowed once or blocked by the user; silence blocks."""

import threading
import time

import pytest
from fastapi.testclient import TestClient

import approvals
import server
from test_guard import CURL, read_readme, start, stub_llm  # noqa: F401  (project fixture below)
from test_guard import project  # noqa: F401


def held_check(c, cwd, results):
    results.append(c.post("/hermes/check", json={
        "session_id": "s1", "tool_name": "terminal", "cwd": str(cwd),
        "tool_input": {"command": CURL, "workdir": str(cwd)}}).json())


def wait_until_pending(timeout=5.0):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if approvals._pending:
            return next(iter(approvals._pending)).split("/")[1]
        time.sleep(0.02)
    raise AssertionError("no check started waiting for the user")


@pytest.fixture
def held(project, monkeypatch):  # noqa: F811
    monkeypatch.setattr(approvals, "APPROVAL_S", 5.0)
    with TestClient(server.app) as c:
        start(c, project)
        read_readme(c, project)
        results: list = []
        t = threading.Thread(target=held_check, args=(c, project, results))
        t.start()
        check_id = wait_until_pending()
        yield c, check_id, results, t


def test_allow_once_lets_the_action_through(held):
    c, check_id, results, t = held
    assert c.post("/hermes/decide", json={"session_id": "s1", "check_id": check_id, "decision": "allow"}).json() == {"ok": True}
    t.join(5)
    assert results[0]["decision"] == "allow" and results[0]["source"] == "user"
    snap = c.get("/hermes/state").json()["sessions"][0]["checks"][-1]
    assert snap["decision"] == "allow" and snap["source"] == "user"


def test_user_block_keeps_it_blocked(held):
    c, check_id, results, t = held
    c.post("/hermes/decide", json={"session_id": "s1", "check_id": check_id, "decision": "block"})
    t.join(5)
    assert results[0]["decision"] == "block"


def test_late_or_unknown_decisions_are_rejected(held):
    c, check_id, results, t = held
    c.post("/hermes/decide", json={"session_id": "s1", "check_id": check_id, "decision": "block"})
    t.join(5)
    late = c.post("/hermes/decide", json={"session_id": "s1", "check_id": check_id, "decision": "allow"})
    assert late.status_code == 409
    bad = c.post("/hermes/decide", json={"session_id": "s1", "check_id": check_id, "decision": "maybe"})
    assert bad.status_code == 422


def test_silence_blocks(project, monkeypatch):  # noqa: F811
    monkeypatch.setattr(approvals, "APPROVAL_S", 0.3)
    with TestClient(server.app) as c:
        start(c, project)
        read_readme(c, project)
        results: list = []
        held_check(c, project, results)
    assert results[0]["decision"] == "block"


def test_window_never_exceeds_the_hook_budget():
    assert approvals.window_for(time.monotonic() - approvals.HOOK_BUDGET_S) == 0
    assert approvals.window_for(time.monotonic()) <= approvals.APPROVAL_S
