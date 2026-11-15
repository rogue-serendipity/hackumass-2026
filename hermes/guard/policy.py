"""What counts as sensitive, what's trusted, and the code-only hard rule (no LLM).

Trust: the user's message is trusted. Web content is untrusted. Files (and command output)
under an untrusted root are untrusted: by default ~/tribunal-demo, the "freshly downloaded
project". Override with TRIBUNAL_UNTRUSTED_DIRS (colon-separated).

Email (H10): the demo's ./mail client lives in ~/tribunal-mail (TRIBUNAL_MAIL_DIR). Its contacts
and `./mail list` headers are trusted, like the web app's Shadow seeing sender and subject.
`./mail read <id>` is untrusted unless the sender is a contact.

Tamper protection (H10): Hermes may not inspect or touch the Tribunal itself (the guard's port,
process, code, or the demo's hidden files). Checked before everything else.
"""

import os
import re
import shlex
from pathlib import Path

# Tools that can change something or send something. Everything else is read-only and skipped.
SENSITIVE_TOOLS = {"terminal", "execute_code", "write_file", "patch", "send_message",
                   "browser_type", "browser_click"}
WEB_TOOLS = {"web_extract", "web_search", "browser_snapshot", "browser_navigate"}

# Terminal commands that only read. A command is read-only if every part of a pipeline/chain
# starts with one of these and nothing is redirected to a file.
READ_ONLY_COMMANDS = {"ls", "cat", "head", "tail", "wc", "grep", "rg", "find", "pwd", "which",
                      "echo", "tree", "file", "stat", "du", "df", "env", "printenv", "whoami",
                      "date", "uname", "python3 --version", "python --version", "pip list",
                      "pip show", "git status", "git log", "git diff",
                      # Local inspection (H10): harmless, and blocking it looks like a false alarm.
                      "ps", "netstat", "lsof", "dig", "nslookup", "host", "dscacheutil", "ifconfig",
                      "docker ps", "docker images", "id", "groups", "uptime", "cut", "sort", "uniq",
                      "command", "type", "test", "[", "true", "printf", "basename", "dirname",
                      # The demo mail client's read-only verbs (H10).
                      "mail list", "mail read", "mail outbox"}

# Flags and commands that send data somewhere.
UPLOAD_PATTERNS = [
    r"\bcurl\b[^|;&]*(?:-d\b|--data|-F\b|--form|-T\b|--upload-file|-X\s*(?:POST|PUT|PATCH))",
    r"\bwget\b[^|;&]*--post",
    r"\b(?:nc|ncat|netcat|scp|rsync|sftp|ftp)\b",
    r"\b(?:mail|sendmail|mutt)\b",
    r"\bInvoke-WebRequest\b|\brequests\.(?:post|put)\b|\burllib\.request\b|\bfetch\(",
]
SECRET_PATTERNS = [r"(?:^|[\s@/'\"=])\.env\b", r"\bid_(?:rsa|ed25519)\b", r"\.ssh/", r"\.aws/",
                   r"\bcredentials\b", r"\.netrc\b", r"\.npmrc\b", r"\.pypirc\b"]

URL_RE = re.compile(r"\b(?:https?|ftp)://([^\s/'\"<>`]+)", re.I)
EMAIL_RE = re.compile(r"\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b")
HOST_RE = re.compile(r"\b(?:localhost|\d{1,3}(?:\.\d{1,3}){3}|(?:[a-z0-9-]+\.)+[a-z]{2,})(?::\d+)?\b", re.I)


def untrusted_roots() -> list[Path]:
    raw = os.getenv("TRIBUNAL_UNTRUSTED_DIRS", "~/tribunal-demo")
    return [Path(p).expanduser().resolve() for p in raw.split(":") if p.strip()]


def _resolve(path: str, cwd: str) -> Path:
    p = Path(path).expanduser()
    return (p if p.is_absolute() else Path(cwd or ".") / p).resolve()


def _under_untrusted(path: Path) -> bool:
    return any(path == r or r in path.parents for r in untrusted_roots())


def text_of(tool_input) -> str:
    """The interesting text of a tool call, for summaries and destination extraction."""
    if isinstance(tool_input, dict):
        for key in ("command", "code", "cmd", "script"):
            if isinstance(tool_input.get(key), str):
                return tool_input[key]
        return " ".join(f"{k}={v}" for k, v in tool_input.items() if isinstance(v, (str, int, float)))
    return str(tool_input or "")


def summary(tool_name: str, tool_input) -> str:
    text = " ".join(text_of(tool_input).split())
    if isinstance(tool_input, dict) and tool_name in ("write_file", "patch", "read_file"):
        text = str(tool_input.get("path") or tool_input.get("file_path") or text)
    return f"{tool_name}: {text[:400]}" if text else tool_name  # long enough to show a chained command in full


def source_of(tool_name: str, tool_input, cwd: str) -> str:
    ti = tool_input if isinstance(tool_input, dict) else {}
    if tool_name in ("read_file", "search_files"):
        return f"file:{ti.get('path') or ti.get('file_path') or ti.get('pattern') or '?'}"
    if tool_name in WEB_TOOLS:
        url = ti.get("url") or ti.get("urls") or ti.get("query") or "?"
        return f"web:{url if isinstance(url, str) else ' '.join(map(str, url))}"
    if tool_name in ("terminal", "execute_code"):
        return f"terminal:{text_of(tool_input)[:80]}"
    return f"tool:{tool_name}"


def is_trusted(tool_name: str, tool_input, cwd: str) -> bool:
    """Is the *result* of this tool call trusted content?"""
    if tool_name in WEB_TOOLS:
        return False
    ti = tool_input if isinstance(tool_input, dict) else {}
    path = ti.get("path") or ti.get("file_path")
    if path:
        return not _under_untrusted(_resolve(str(path), cwd))
    # Command output, search results etc.: untrusted when produced inside an untrusted project.
    return not (cwd and _under_untrusted(_resolve(cwd, cwd)))


def is_read_only_command(command: str) -> bool:
    if re.search(r"(?<![0-9&])>|\btee\b", command):  # writes to a file
        return False
    parts = [p.strip() for p in re.split(r"\|\||&&|[|;]", command) if p.strip()]
    for part in parts:
        try:
            words = shlex.split(part)
        except ValueError:
            return False
        if not words:
            continue
        words[0] = os.path.basename(words[0])  # .venv/bin/pip list → pip list
        if words[0] not in READ_ONLY_COMMANDS and " ".join(words[:2]) not in READ_ONLY_COMMANDS:
            return False
    return bool(parts)


def is_sensitive(tool_name: str, tool_input) -> bool:
    if tool_name not in SENSITIVE_TOOLS:
        return False
    if tool_name == "terminal" and is_read_only_command(text_of(tool_input)):
        return False
    return True


def sends_data(tool_name: str, tool_input) -> bool:
    if tool_name in ("send_message", "browser_type"):
        return True
    text = text_of(tool_input)
    return any(re.search(p, text, re.I) for p in UPLOAD_PATTERNS)


def touches_secrets(tool_input) -> bool:
    text = text_of(tool_input)
    return any(re.search(p, text) for p in SECRET_PATTERNS)


def destinations(text: str) -> set[str]:
    """Hosts (with port) and email addresses mentioned in text, lowercased."""
    found = {m.group(1).lower().rstrip(".,)") for m in URL_RE.finditer(text)}
    found |= {m.group(0).lower() for m in EMAIL_RE.finditer(text)}
    if not found:
        found |= {m.group(0).lower() for m in HOST_RE.finditer(text)
                  if not re.fullmatch(r"[\w-]+\.(?:py|txt|md|json|yaml|yml|toml|cfg|sh|env|lock)", m.group(0), re.I)}
    return found


def mail_recipients(segment: str) -> set[str] | None:
    """Where a demo ./mail command actually sends: --to for forward/send, the original sender for
    reply. Addresses merely mentioned in a --body/--note aren't destinations. None if not mail."""
    mv = mail_verb(segment)
    if not mv:
        return None
    verb, args = mv
    if verb in ("forward", "send"):
        for i, a in enumerate(args):
            if a == "--to" and i + 1 < len(args):
                return {args[i + 1].lower()}
            if a.startswith("--to="):
                return {a.split("=", 1)[1].lower()}
        return set()
    if verb == "reply" and args:
        try:
            import json
            inbox = json.loads((mail_dir() / "inbox.json").read_text())
            sender = next((e["from"] for e in inbox if e.get("id") == args[0]), None)
        except (OSError, ValueError):
            sender = None
        return {sender.lower()} if sender else set()
    return set()


def action_destinations(tool_name: str, tool_input) -> set[str]:
    ti = tool_input if isinstance(tool_input, dict) else {}
    text = text_of(tool_input)
    if tool_name == "terminal":
        # Per chained command, so a mail reply's body doesn't count as a destination (H10).
        dests: set[str] = set()
        for segment in (p.strip() for p in re.split(r"\|\||&&|;", text) if p.strip()):
            recipients = mail_recipients(segment)
            dests |= recipients if recipients is not None else destinations(segment)
    else:
        dests = destinations(text)
    for key in ("to", "recipient", "target", "channel", "url"):
        if isinstance(ti.get(key), str):
            dests |= {ti[key].lower()} | destinations(ti[key])
    return dests


def hard_rule(tool_name: str, tool_input, trusted_text: str, untrusted: list[tuple[str, str]]):
    """Code-only BLOCK: data goes to a destination that appears only in untrusted content.

    `untrusted` is [(observation_id, content)]. Returns (reason, observation_id, destination)
    or None. Also blocks sending secret files anywhere the user never mentioned.
    """
    if not sends_data(tool_name, tool_input):
        return None
    trusted_l = trusted_text.lower()
    for dest in sorted(action_destinations(tool_name, tool_input)):
        if dest in trusted_l:
            continue
        host = dest.split(":")[0]
        for oid, content in untrusted:
            if dest in content.lower() or (host and host in content.lower()):
                what = "your secrets" if touches_secrets(tool_input) else "data"
                return (f"This sends {what} to {dest}, an address that appears only in untrusted content, "
                        f"never in your request.", oid, dest)
    if touches_secrets(tool_input):
        dests = action_destinations(tool_name, tool_input)
        if dests and not any(d in trusted_l for d in dests):
            return (f"This sends a secrets file to {', '.join(sorted(dests))}, which you never asked for.", None, None)
    return None


def sentence_with(content: str, needle: str) -> str | None:
    """The sentence (or line) of content containing needle, as an exact substring."""
    low = content.lower()
    i = low.find(needle.lower())
    if i < 0:
        return None
    starts = [content.rfind(c, 0, i) for c in (".\n", ". ", "\n", "! ", "? ")]
    start = max(starts) + 1 if max(starts) >= 0 else 0
    while start < i and content[start] in " .\n`#*-":
        start += 1
    ends = [e for e in (content.find("\n", i), content.find(". ", i)) if e >= 0]
    end = min(ends) + 1 if ends else len(content)
    return content[start:end].strip() or None


# ---- Email trust for the demo's ./mail client (H10) ------------------------------------------

def mail_dir() -> Path:
    return Path(os.getenv("TRIBUNAL_MAIL_DIR", "~/tribunal-mail")).expanduser().resolve()


def contacts() -> set[str]:
    try:
        lines = (mail_dir() / "contacts.txt").read_text().splitlines()
    except OSError:
        return set()
    return {line.strip().lower() for line in lines if line.strip() and not line.startswith("#")}


def contacts_text() -> str:
    """Trusted text: the user's own address book."""
    return "\n".join(sorted(contacts()))


def mail_verb(command: str) -> tuple[str, list[str]] | None:
    """("read", ["e1"]) for `./mail read e1`; None if the command isn't the demo mail client."""
    first = re.split(r"\|\||&&|[|;]", command)[0].strip()
    try:
        words = shlex.split(first)
    except ValueError:
        return None
    if words[:1] == ["cd"] or not words:
        return None
    if os.path.basename(words[0]) != "mail" or len(words) < 2:
        return None
    return words[1], words[2:]


FROM_RE = re.compile(r"^From:.*?<?([\w.+-]+@[\w-]+(?:\.[\w-]+)+)>?\s*$", re.M)


def mail_observation(tool_name: str, tool_input, content: str) -> tuple[str, bool] | None:
    """(source, trusted) for output of the mail client, or None for anything else."""
    if tool_name != "terminal":
        return None
    mv = mail_verb(text_of(tool_input))
    if not mv:
        return None
    verb, args = mv
    if verb == "read" and args:
        m = FROM_RE.search(content)
        sender = m.group(1).lower() if m else "unknown sender"
        return f"email:{args[0]} from {sender}", sender in contacts()
    if verb == "list":
        return "email:inbox (senders and subjects)", True
    if verb == "outbox":
        return "email:your outbox", True
    return None


# ---- Tamper protection (H10) ------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parents[2]
GUARD_PID = os.getpid()


def protected_paths() -> list[Path]:
    home = Path.home()
    return [REPO_ROOT, home / ".tribunal-hermes", home / ".weathercli-telemetry"]


TAMPER_PATTERNS = [
    r"(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):8100\b", r":8100/", r"\btcp:8100\b", r"-i\s*\S*:8100\b",
    r"\buvicorn\b", r"hermes/guard\b", r"\.tribunal-hermes\b", r"\.weathercli-telemetry\b",
    r"tribunal-demo-logs", r"shell-hooks-allowlist", r"tribunal_hook",
]


def tamper(tool_name: str, tool_input, cwd: str) -> str | None:
    """A reason if this action inspects or touches the Tribunal itself, else None."""
    ti = tool_input if isinstance(tool_input, dict) else {}
    text = text_of(tool_input)
    unescaped = text.replace("\\ ", " ")
    hits = [p for p in TAMPER_PATTERNS if re.search(p, unescaped, re.I)]
    if re.search(rf"\b(?:ps|lsof|kill|pkill|killall|top|sample|dtruss|strace)\b[^|;&]*\b{GUARD_PID}\b", unescaped):
        hits.append("guard pid")
    repo = str(REPO_ROOT)
    if repo in unescaped or REPO_ROOT.name in unescaped:
        hits.append("repo")
    path = ti.get("path") or ti.get("file_path")
    if isinstance(path, str) and path:
        resolved = _resolve(path, cwd)
        if any(resolved == p or p in resolved.parents for p in protected_paths()):
            hits.append("protected path")
    if not hits:
        return None
    return ("Hermes may not inspect or tamper with the Shadow Agent Tribunal (its process, port, code or "
            "settings). This is outside your task.")
