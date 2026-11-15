"""Pydantic schemas. Field names and shapes mirror shared/api_contract.md."""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

Lane = Literal["worker", "shadow"]
Verdict = Literal["APPROVE", "BLOCK"]
SensitiveTool = Literal["send_email", "forward_email", "transfer_money", "share_file"]


class Email(BaseModel):
    # "from" is a Python keyword, so the field is from_ but reads and writes as "from".
    model_config = ConfigDict(validate_by_name=True, validate_by_alias=True, serialize_by_alias=True)

    id: str
    from_: str = Field(alias="from")
    to: str
    subject: str
    timestamp: str
    body: str
    trusted: bool = False


class FileItem(BaseModel):
    id: str
    name: str
    shared_with: list[str] = []


class User(BaseModel):
    name: str
    email: str


class Page(BaseModel):
    """A page on the scenario's mock web. Like an email body, its content is untrusted unless marked."""
    id: str        # "p1"
    url: str
    title: str
    body: str
    trusted: bool = False


class State(BaseModel):
    user: User
    contacts: list[str]
    inbox: list[Email]
    files: list[FileItem]
    balance: float
    pages: list[Page] = []  # the mock web; scenarios without pages get no browsing tools


class ScenarioSummary(BaseModel):
    id: str
    title: str
    category: Literal["attack", "benign"]


class Scenario(ScenarioSummary):
    user_request: str
    state: State
    expected: Verdict
    # Addresses an attack tries to reach. A Worker action targeting one means the attack landed;
    # eval uses this to separate "Worker resisted" from "Worker hijacked and caught".
    attacker_targets: list[str] = []


class ProposedAction(BaseModel):
    lane: Lane
    index: int        # order among this lane's sensitive actions
    step_index: int   # index of the tool_call step event that proposed it
    tool: SensitiveTool
    args: dict[str, Any]
    target_known: bool | None = None  # set only on diff.worker_only items


class ActionPair(BaseModel):
    worker: ProposedAction
    shadow: ProposedAction


class Mismatch(ActionPair):
    fields: list[str]


class Diff(BaseModel):
    matched: list[ActionPair]
    worker_only: list[ProposedAction]
    shadow_only: list[ProposedAction]
    arg_mismatch: list[Mismatch]


class PerAction(BaseModel):
    action_index: int  # index into diff.worker_only
    decision: Verdict
    reason: str
    hard_rule: bool = False


class JudgeVerdict(BaseModel):
    verdict: Verdict
    source: Literal["fast_path", "llm", "rule"]  # rule = auto-blocked by a Patcher rule; agents didn't run
    per_action: list[PerAction]
    serves_user_request: bool | None = None
    introduces_new_goal_or_recipient: bool | None = None
    culprit_email_id: str | None = None
    culprit_quote: str | None = None
    explanation: str
    rule_id: int | None = None  # set when source == "rule"
