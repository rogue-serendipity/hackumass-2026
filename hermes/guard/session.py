"""Per-session transcript: the user's task, what Hermes read (with trust tags), and the checks."""

import json
import re
from dataclasses import dataclass, field

import policy

LINE_PREFIX = re.compile(r"^\s*\d+\|", re.M)


def clean_result(result: str) -> str:
    """Hermes sends results as JSON strings: read_file {"content": "1|…"}, terminal {"output", …}.
    Return the plain text, with read_file's line-number prefixes removed so quotes match."""
    try:
        data = json.loads(result)
    except (TypeError, ValueError):
        return LINE_PREFIX.sub("", result or "")
    if isinstance(data, dict):
        for key in ("content", "output", "text", "result"):
            if isinstance(data.get(key), str):
                return LINE_PREFIX.sub("", data[key])
    return result if isinstance(result, str) else json.dumps(data)


@dataclass
class Observation:
    observation_id: str
    tool_name: str
    tool_input: object
    source: str
    trusted: bool
    content: str


@dataclass
class Check:
    check_id: str
    tool_name: str
    summary: str
    decision: str = "pending"  # "pending" | "allow" | "block"
    source: str = ""
    reason: str | None = None
    culprit: dict | None = None


@dataclass
class Session:
    session_id: str
    cwd: str = ""
    task: list[str] = field(default_factory=list)
    observations: list[Observation] = field(default_factory=list)
    checks: list[Check] = field(default_factory=list)
    results_by_call: dict[str, dict] = field(default_factory=dict)  # pre_tool_call can fire twice

    @property
    def task_text(self) -> str:
        return "\n".join(self.task)

    def observe(self, tool_name: str, tool_input, result: str, cwd: str) -> Observation:
        obs = Observation(
            observation_id=f"o{len(self.observations) + 1}",
            tool_name=tool_name,
            tool_input=tool_input,
            source=policy.source_of(tool_name, tool_input, cwd or self.cwd),
            trusted=policy.is_trusted(tool_name, tool_input, cwd or self.cwd),
            content=clean_result(result or ""),
        )
        self.observations.append(obs)
        return obs

    def new_check(self, tool_name: str, tool_input) -> Check:
        check = Check(check_id=f"c{len(self.checks) + 1}", tool_name=tool_name,
                      summary=policy.summary(tool_name, tool_input))
        self.checks.append(check)
        return check

    @property
    def trusted_text(self) -> str:
        return "\n".join([self.task_text] + [o.content for o in self.observations if o.trusted])

    @property
    def untrusted(self) -> list[Observation]:
        return [o for o in self.observations if not o.trusted]

    def snapshot(self) -> dict:
        return {
            "session_id": self.session_id,
            "task": self.task_text,
            "observations": [{"observation_id": o.observation_id, "tool_name": o.tool_name,
                              "source": o.source, "trusted": o.trusted} for o in self.observations],
            "checks": [{k: v for k, v in vars(c).items() if v is not None} for c in self.checks],
        }


class Store:
    def __init__(self):
        self.sessions: dict[str, Session] = {}
        self.sink_hits = 0

    def get(self, session_id: str, cwd: str = "") -> tuple[Session, bool]:
        """The session, and whether it was just created."""
        if session_id in self.sessions:
            s = self.sessions[session_id]
            if cwd and not s.cwd:
                s.cwd = cwd
            return s, False
        s = self.sessions[session_id] = Session(session_id=session_id, cwd=cwd)
        return s, True

    def reset(self) -> None:
        self.sessions.clear()
        self.sink_hits = 0
