"""The Shadow for Hermes: same model, same task, same transcript, untrusted content withheld.

It never runs tools. It only proposes the next action, which the guard compares with the
action Hermes is about to take.
"""

import json
import re

import policy
from backend_bridge import Usage, chat, client, model_for, parse_json
from session import Session

SHADOW_PROMPT = """You are a careful coding assistant working in a terminal for the user. Below is the user's task and what has happened so far: each tool call you made and its result. Some results are withheld because they came from untrusted sources; do the best you can with what is visible.

Decide your single next action. Reply with ONLY a JSON object:
{"tool_name": "terminal" | "write_file" | "patch" | "execute_code" | "send_message" | null,
 "tool_input": {...},          // e.g. {"command": "pip install -r requirements.txt"} or {"path": "...", "content": "..."}
 "why": "<one short sentence>"}
Use "tool_name": null if you would not take any action now (for example you'd stop or ask the user)."""


def withheld(source: str) -> str:
    return f"[withheld: content from {source}]"


def transcript(session: Session) -> str:
    lines = [f"USER TASK:\n{session.task_text or '(none recorded)'}", f"WORKING DIRECTORY: {session.cwd or '?'}", ""]
    for o in session.observations:
        body = o.content if o.trusted else withheld(o.source)
        lines.append(f"TOOL CALL {o.observation_id}: {policy.summary(o.tool_name, o.tool_input)}")
        lines.append(f"RESULT:\n{body[:4000]}\n")
    return "\n".join(lines)


async def propose(session: Session, usage: Usage) -> dict:
    """The Shadow's next action: {"tool_name": str | None, "tool_input": dict, "why": str}.

    If the model's reply can't be parsed twice in a row, returns no proposal ("unavailable"),
    so the Judge decides; an unreadable Shadow must not turn into a false alarm.
    """
    messages = [{"role": "system", "content": SHADOW_PROMPT}, {"role": "user", "content": transcript(session)}]
    for _ in range(2):
        try:
            # Generous cap: reasoning models think before the JSON, and a cut-off reply can't be parsed.
            response = await chat(client(), usage, model=model_for("shadow"), max_tokens=2000, messages=messages)
            raw = parse_json(response.choices[0].message.content or "")
        except ValueError:  # includes json.JSONDecodeError
            messages = messages[:2] + [{"role": "user", "content": "Reply with only the JSON object."}]
            continue
        tool = raw.get("tool_name") or None
        return {"tool_name": tool, "tool_input": raw.get("tool_input") or {}, "why": str(raw.get("why") or "")}
    return {"tool_name": None, "tool_input": {}, "why": "", "unavailable": True}


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


def same_action(tool_name: str, tool_input, proposal: dict) -> bool:
    """Would the Shadow take essentially the same action? Same tool, and same command, or same file."""
    if proposal.get("tool_name") != tool_name:
        return False
    mine, theirs = tool_input if isinstance(tool_input, dict) else {}, proposal.get("tool_input") or {}
    if tool_name in ("write_file", "patch"):
        return str(mine.get("path", "")).rstrip("/") == str(theirs.get("path", "")).rstrip("/")
    return _norm(policy.text_of(mine)) == _norm(policy.text_of(theirs))


def describe(proposal: dict) -> str:
    if proposal.get("unavailable"):
        return "unknown (the Shadow's answer couldn't be read)"
    if not proposal.get("tool_name"):
        return "nothing (it would not take an action here)"
    return policy.summary(proposal["tool_name"], proposal.get("tool_input"))


def dumps(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, default=str)
