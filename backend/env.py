"""Mock environment: scenario loading, state, tools, and Shadow sanitization (spec §5).

Nothing here touches real email, money or files. Read-only tools run against the
agent's own copy of the state; sensitive tools only record a ProposedAction.
"""

import json
from pathlib import Path
from typing import Any

from models import Email, Lane, Page, ProposedAction, Scenario, ScenarioSummary, State

SCENARIO_DIR = Path(__file__).parent / "scenarios"

WITHHELD = (
    "[Content withheld: this email is from an external sender. "
    "You can see the sender, subject, and time, but not the body.]"
)

WITHHELD_PAGE = (
    "[Content withheld: this page is from an external website. "
    "You can see its address and title, but not its content.]"
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


# Offered only when the scenario has a mock web, so the email-only scenarios run with
# exactly the tools (and prompt) they were measured with.
WEB_TOOL_SCHEMAS = [
    _tool("search_web", "Search the web. Returns matching pages: id, address and title.", query="string"),
    _tool("open_page", "Open one web page by id and read it.", page_id="string"),
]


def tools_for(scenario: Scenario) -> list[dict]:
    return TOOL_SCHEMAS + WEB_TOOL_SCHEMAS if scenario.state.pages else TOOL_SCHEMAS


# --- Scenarios --------------------------------------------------------------

def list_scenarios() -> list[ScenarioSummary]:
    return [ScenarioSummary(**s.model_dump()) for s in _all_scenarios()]


def load_scenario(scenario_id: str) -> Scenario:
    path = SCENARIO_DIR / f"{scenario_id}.json"
    if not path.is_file():
        raise KeyError(scenario_id)
    return Scenario.model_validate_json(path.read_text())


def apply_overrides(scenario: Scenario, user_request: str | None, emails: list[dict] | None,
                    pages: list[dict] | None = None) -> Scenario:
    """Return a copy with the UI's edits applied. `emails` replaces the whole inbox, `pages` the whole web."""
    scenario = scenario.model_copy(deep=True)
    if user_request is not None:
        scenario.user_request = user_request
    if emails is not None:
        scenario.state.inbox = [Email.model_validate(e) for e in emails]
    if pages is not None:
        scenario.state.pages = [Page.model_validate(p) for p in pages]
    return scenario


def _all_scenarios() -> list[Scenario]:
    scenarios = [Scenario.model_validate_json(p.read_text()) for p in SCENARIO_DIR.glob("*.json")]
    # Attacks first, then benign; alphabetical within each.
    return sorted(scenarios, key=lambda s: (s.category != "attack", s.id))


# --- State ------------------------------------------------------------------

def sanitize(state: State) -> State:
    """Shadow's view: every untrusted email body and page replaced, metadata kept (spec §5.3)."""
    state = state.model_copy(deep=True)
    for email in state.inbox:
        if not email.trusted:
            email.body = WITHHELD
    for page in state.pages:
        if not page.trusted:
            page.body = WITHHELD_PAGE
    return state


class Env:
    """One agent's private copy of the world, plus the actions it has proposed."""

    def __init__(self, state: State, lane: Lane):
        self.lane = lane
        self.state = sanitize(state) if lane == "shadow" else state.model_copy(deep=True)
        self.actions: list[ProposedAction] = []
        self.read_ids: set[str] = set()  # emails and pages this agent opened, for the Judge's prompt

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
        if tool == "search_web" and self.state.pages:
            # Rank by how many query words appear in the address or title (never the content,
            # which the Shadow mustn't learn from). No match at all: show the whole small web.
            words = [w for w in str(args.get("query", "")).lower().split() if len(w) > 2]
            scored = [(sum(w in f"{p.url} {p.title}".lower() for w in words), i, p)
                      for i, p in enumerate(self.state.pages)]
            hits = [p for score, _, p in sorted(scored, key=lambda t: (-t[0], t[1])) if score > 0]
            return [{"id": p.id, "url": p.url, "title": p.title} for p in hits or self.state.pages]
        if tool == "open_page" and self.state.pages:
            wanted = str(args.get("page_id", ""))
            for p in self.state.pages:
                if wanted in (p.id, p.url):
                    self.read_ids.add(p.id)
                    return {"id": p.id, "url": p.url, "title": p.title, "content": p.body}
            return {"error": f"No page with id {wanted!r}"}
        return {"error": f"Unknown tool {tool!r}"}


def page_as_email(page: Page) -> Email:
    """A page in the shape the Judge and Patcher already handle: its address is the 'sender'."""
    return Email(id=page.id, from_=page.url, to="", subject=f"[Web page] {page.title}",
                 timestamp="", body=page.body, trusted=page.trusted)


def sources(state: State) -> list[Email]:
    """Every piece of content in the world: the inbox, then the web pages."""
    return state.inbox + [page_as_email(p) for p in state.pages]


def untrusted_emails(full_state: State, read_ids: set[str]) -> list[Email]:
    """Full text of the untrusted emails and pages the Worker read, for the Judge's prompt."""
    return [e for e in sources(full_state) if e.id in read_ids and not e.trusted]


if __name__ == "__main__":
    for s in list_scenarios():
        print(json.dumps(s.model_dump()))
