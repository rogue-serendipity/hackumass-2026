"""Vultr Serverless Inference client (OpenAI-compatible) with token accounting.

Run directly for the build-order step 1 smoke test:
    python llm.py            # list models, then one tool-calling request with WORKER_MODEL
    python llm.py <model>    # same, with a specific model
"""

import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv
from openai import AsyncOpenAI

load_dotenv(Path(__file__).parent / ".env")


def env(name: str, default: str | None = None) -> str:
    value = os.getenv(name) or default
    if not value:
        # Not sys.exit: inside the API server that would kill uvicorn instead of failing one run.
        raise RuntimeError(f"Missing {name}: set it in backend/.env (see backend/.env.example)")
    return value


@dataclass
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0

    def add(self, usage) -> None:
        if usage:
            self.input_tokens += usage.prompt_tokens or 0
            self.output_tokens += usage.completion_tokens or 0


def make_client() -> AsyncOpenAI:
    return AsyncOpenAI(
        api_key=env("VULTR_INFERENCE_API_KEY"),
        base_url=env("VULTR_INFERENCE_BASE_URL", "https://api.vultrinference.com/v1"),
    )


def model_for(role: str) -> str:
    """role is "worker", "shadow" or "judge"; each falls back to WORKER_MODEL."""
    return os.getenv(f"{role.upper()}_MODEL") or env("WORKER_MODEL")


async def chat(client: AsyncOpenAI, usage: Usage, **kwargs):
    """One chat completion at temperature 0, with usage recorded."""
    kwargs.setdefault("temperature", 0)
    response = await client.chat.completions.create(**kwargs)
    usage.add(response.usage)
    return response


async def _smoke_test(model: str | None) -> None:
    client = make_client()

    models = [m.id async for m in client.models.list()]
    print("Available models:")
    for m in models:
        print("  ", m)

    model = model or os.getenv("WORKER_MODEL")
    if not model:
        sys.exit("\nSet WORKER_MODEL in backend/.env (or pass a model name) to run the tool-calling test.")

    tools = [{
        "type": "function",
        "function": {
            "name": "read_email",
            "description": "Read one email by id.",
            "parameters": {
                "type": "object",
                "properties": {"email_id": {"type": "string"}},
                "required": ["email_id"],
            },
        },
    }]
    usage = Usage()
    response = await chat(
        client, usage,
        model=model,
        messages=[{"role": "user", "content": "Read email e1 for me."}],
        tools=tools,
    )
    calls = response.choices[0].message.tool_calls or []
    print(f"\nModel: {model}")
    print(f"Tokens: {usage.input_tokens} in / {usage.output_tokens} out")
    if calls and calls[0].function.name == "read_email":
        print(f"PASS: tool call read_email({json.loads(calls[0].function.arguments)})")
    else:
        print("FAIL: no read_email tool call. Pick another model.")
        print("Response:", response.choices[0].message)
        sys.exit(1)


if __name__ == "__main__":
    import asyncio
    try:
        asyncio.run(_smoke_test(sys.argv[1] if len(sys.argv) > 1 else None))
    except RuntimeError as exc:
        sys.exit(str(exc))
