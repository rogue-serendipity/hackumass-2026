"""Mock environment: scenario loading, state, tools, and Shadow sanitization (spec §5).

Nothing here touches real email, money or files. Read-only tools run against the
agent's own copy of the state; sensitive tools only record a ProposedAction.
"""

import json
from pathlib import Path
from typing import Any

from models import Email, Lane, ProposedAction, Scenario, ScenarioSummary, State

SCENARIO_DIR = Path(__file__).parent / "scenarios"

WITHHELD = (
    "[Content withheld: this email is from an external sender. "
    "You can see the sender, subject, and time, but not the body.]"
)

SENSITIVE_TOOLS = {"send_email", "forward_email", "transfer_money", "share_file"}


def _tool(name: str, description: str, **params: str) -> dict:
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {
                "type": "object",
                "properties": {p: {"type": t} for p, t in params.items()},
                "required": list(params),
            },
        },
    }


TOOL_SCHEMAS = [
    _tool("list_inbox", "List emails in the inbox: id, sender, subject and time."),
    _tool("read_email", "Read one email by id.", email_id="string"),
    _tool("send_email", "Send an email.", to="string", subject="string", body="string"),
    _tool("forward_email", "Forward an existing email to someone.", email_id="string", to="string"),
    _tool("transfer_money", "Send money from the user's account.", to="string", amount="number", memo="string"),
    _tool("share_file", "Share one of the user's files with someone.", file_id="string", with_email="string"),
]


# --- Scenarios --------------------------------------------------------------

def list_scenarios() -> list[ScenarioSummary]:
    return [ScenarioSummary(**s.model_dump()) for s in _all_scenarios()]


def load_scenario(scenario_id: str) -> Scenario:
    path = SCENARIO_DIR / f"{scenario_id}.json"
    if not path.is_file():
        raise KeyError(scenario_id)
    return Scenario.model_validate_json(path.read_text())


def apply_overrides(scenario: Scenario, user_request: str | None, emails: list[dict] | None) -> Scenario:
    """Return a copy with the UI's edits applied. `emails` replaces the whole inbox."""
    scenario = scenario.model_copy(deep=True)
    if user_request is not None:
        scenario.user_request = user_request
    if emails is not None:
        scenario.state.inbox = [Email.model_validate(e) for e in emails]
    return scenario


def _all_scenarios() -> list[Scenario]:
    scenarios = [Scenario.model_validate_json(p.read_text()) for p in SCENARIO_DIR.glob("*.json")]
    # Attacks first, then benign; alphabetical within each.
    return sorted(scenarios, key=lambda s: (s.category != "attack", s.id))


# --- State ------------------------------------------------------------------

def sanitize(state: State) -> State:
    """Shadow's view: every untrusted email body replaced, metadata kept (spec §5.3)."""
    state = state.model_copy(deep=True)
    for email in state.inbox:
        if not email.trusted:
            email.body = WITHHELD
    return state


class Env:
    """One agent's private copy of the world, plus the actions it has proposed."""

    def __init__(self, state: State, lane: Lane):
        self.lane = lane
        self.state = sanitize(state) if lane == "shadow" else state.model_copy(deep=True)
        self.actions: list[ProposedAction] = []
        self.read_ids: set[str] = set()  # emails this agent opened, for the Judge's prompt

    def execute(self, tool: str, args: dict[str, Any], step_index: int) -> Any:
        if tool in SENSITIVE_TOOLS:
            self.actions.append(ProposedAction(
                lane=self.lane, index=len(self.actions), step_index=step_index, tool=tool, args=args,
            ))
            return {"status": "queued_for_review"}
        if tool == "list_inbox":
            return [
                {"id": e.id, "from": e.from_, "subject": e.subject, "timestamp": e.timestamp}
                for e in self.state.inbox
            ]
        if tool == "read_email":
            for e in self.state.inbox:
                if e.id == args.get("email_id"):
                    self.read_ids.add(e.id)
                    return e.model_dump()
            return {"error": f"No email with id {args.get('email_id')!r}"}
        return {"error": f"Unknown tool {tool!r}"}


def untrusted_emails(full_state: State, read_ids: set[str]) -> list[Email]:
    """Full text of the untrusted emails the Worker read, for the Judge's prompt."""
    return [e for e in full_state.inbox if e.id in read_ids and not e.trusted]


if __name__ == "__main__":
    for s in list_scenarios():
        print(json.dumps(s.model_dump()))
