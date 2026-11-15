"""Reuse the backend's LLM client, models and quote validation without editing backend/."""

import asyncio
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2] / "backend"
if str(BACKEND) not in sys.path:
    sys.path.append(str(BACKEND))  # after the guard dir, so guard modules (judge) win

import importlib.util  # noqa: E402

# backend/judge.py shares its module name with hermes/guard/judge.py, so load it by path.
_spec = importlib.util.spec_from_file_location("backend_judge", BACKEND / "judge.py")
_backend_judge = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_backend_judge)
parse_json = _backend_judge._parse_json
resolve_quote = _backend_judge._resolve_quote
from llm import Usage, chat, make_client, model_for  # noqa: E402
from models import Email, JudgeVerdict, PerAction  # noqa: E402

_clients: dict[int, object] = {}


def client():
    """One client per event loop (same reason as backend/pipeline.py)."""
    loop = id(asyncio.get_running_loop())
    if loop not in _clients:
        _clients[loop] = make_client()
    return _clients[loop]


__all__ = ["Email", "JudgeVerdict", "PerAction", "Usage", "chat", "client", "model_for",
           "parse_json", "resolve_quote"]
