#!/usr/bin/env python3
"""Hermes shell hook that routes Hermes through the Shadow Agent Tribunal guard.

Register it for pre_llm_call, post_tool_call and pre_tool_call (hermes/install.sh does this).
Hermes pipes one JSON payload to stdin per firing (see hermes/hooks/H0_FINDINGS.md):

- pre_llm_call / post_tool_call: forwarded to POST /hermes/event. Never blocks; errors are ignored.
- pre_tool_call: sent to POST /hermes/check. On "block", or on ANY error, prints
  {"decision": "block", "reason": ...} so Hermes stops the call (fail closed).

Standard library only, so it runs under whatever python3 Hermes finds. Contract: shared/hermes_contract.md.
"""
import json
import os
import sys
import urllib.error
import urllib.request

GUARD = os.environ.get("TRIBUNAL_GUARD_URL", "http://127.0.0.1:8100").rstrip("/")
CHECK_TIMEOUT_S = 45   # Hermes's own hook timeout is 60 s and it fails OPEN, so answer well before that.
EVENT_TIMEOUT_S = 3
NO_RETRY = "Do not retry this action or suggest that the user run it."


def post(path: str, body: dict, timeout: float) -> dict:
    req = urllib.request.Request(
        GUARD + path,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        if resp.status != 200:
            raise RuntimeError(f"guard returned HTTP {resp.status}")
        return json.loads(resp.read().decode() or "{}")


def block(reason: str) -> None:
    reason = reason.strip()
    if NO_RETRY not in reason:
        reason = f"{reason} {NO_RETRY}"
    print(json.dumps({"decision": "block", "reason": reason}))


def as_text(value) -> str:
    if value is None:
        return ""
    return value if isinstance(value, str) else json.dumps(value)


def handle(payload: dict) -> None:
    event = payload.get("hook_event_name")
    extra = payload.get("extra") or {}
    base = {"session_id": payload.get("session_id") or "", "cwd": payload.get("cwd") or ""}

    if event == "pre_tool_call":
        body = {
            **base,
            "tool_name": payload.get("tool_name") or "",
            "tool_input": payload.get("tool_input") or {},
            "tool_call_id": extra.get("tool_call_id"),  # lets the guard dedupe double firings
        }
        try:
            result = post("/hermes/check", body, CHECK_TIMEOUT_S)
        except Exception as exc:  # noqa: BLE001 - fail closed on anything
            block(f"Tribunal unavailable: {describe(exc)}. The action was held for safety.")
            return
        decision = result.get("decision")
        if decision == "allow":
            return
        if decision == "block":
            block(result.get("reason") or "Blocked by Shadow Agent Tribunal.")
            return
        block(f"Tribunal unavailable: unexpected response {decision!r}. The action was held for safety.")
        return

    if event == "pre_llm_call":
        body = {**base, "event": event,
                "user_message": as_text(extra.get("user_message")),
                "is_first_turn": bool(extra.get("is_first_turn"))}
    elif event == "post_tool_call":
        body = {**base, "event": event,
                "tool_name": payload.get("tool_name") or "",
                "tool_input": payload.get("tool_input") or {},
                "result": as_text(extra.get("result")),
                "status": extra.get("status")}
    else:
        return
    try:
        post("/hermes/event", body, EVENT_TIMEOUT_S)
    except Exception:  # noqa: BLE001 - recording must never get in Hermes's way
        pass


def describe(exc: Exception) -> str:
    if isinstance(exc, urllib.error.HTTPError):
        return f"guard returned HTTP {exc.code}"
    if isinstance(exc, urllib.error.URLError):
        return f"cannot reach the guard at {GUARD} ({exc.reason})"
    if isinstance(exc, TimeoutError):
        return "the guard took too long"
    return type(exc).__name__


def main() -> None:
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw)
    except ValueError:
        payload = None
    if not isinstance(payload, dict):
        # We can't tell which event this is. Blocking is only meaningful for pre_tool_call,
        # and Hermes ignores a block decision on other events, so failing closed is safe.
        block("Tribunal hook received an unreadable payload. The action was held for safety.")
        return
    handle(payload)


if __name__ == "__main__":
    main()
