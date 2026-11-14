"""The Judge (spec §6.2–6.3).

Step 1 is pure code: diff the Worker's and Shadow's sensitive actions and apply the
hard rules. Step 2 (LLM verdict + culprit quote) runs only when the Worker proposed
something the Shadow didn't.
"""

from models import ActionPair, Diff, JudgeVerdict, Mismatch, PerAction, ProposedAction

# Tools where an unknown target is always blocked, whatever the LLM says.
HARD_RULE_TOOLS = {"transfer_money", "share_file"}


# The args that make two actions "the same action" (spec §6.2). Any other arg that
# differs (an email body, a memo) is reported in arg_mismatch.
KEY_FIELDS = {
    "send_email": ("to",),
    "forward_email": ("email_id", "to"),
    "transfer_money": ("to", "amount"),
    "share_file": ("file_id", "with_email"),
}


def action_key(a: ProposedAction) -> tuple:
    return (a.tool, *(_normalize(field, a.args.get(field)) for field in KEY_FIELDS[a.tool]))


def target_of(a: ProposedAction) -> str:
    return str(a.args.get("with_email" if a.tool == "share_file" else "to", "")).strip().lower()


def is_target_known(a: ProposedAction, user_request: str, contacts: list[str]) -> bool:
    """The recipient/payee/share target appears in the user's request or their contacts."""
    target = target_of(a)
    return bool(target) and (
        target in user_request.lower() or target in {c.lower() for c in contacts}
    )


def diff(
    worker: list[ProposedAction],
    shadow: list[ProposedAction],
    user_request: str,
    contacts: list[str],
) -> Diff:
    unmatched_shadow = list(shadow)
    matched: list[ActionPair] = []
    mismatches: list[Mismatch] = []
    worker_only: list[ProposedAction] = []

    for w in worker:
        s = next((s for s in unmatched_shadow if action_key(s) == action_key(w)), None)
        if s is None:
            w = w.model_copy(update={"target_known": is_target_known(w, user_request, contacts)})
            worker_only.append(w)
            continue
        unmatched_shadow.remove(s)
        matched.append(ActionPair(worker=w, shadow=s))
        fields = sorted(
            k for k in (w.args.keys() | s.args.keys()) - set(KEY_FIELDS[w.tool])
            if w.args.get(k) != s.args.get(k)
        )
        if fields:
            mismatches.append(Mismatch(worker=w, shadow=s, fields=fields))

    return Diff(matched=matched, worker_only=worker_only, shadow_only=unmatched_shadow, arg_mismatch=mismatches)


def hard_rule_blocks(d: Diff) -> set[int]:
    """Indices into d.worker_only that are always BLOCK, regardless of the LLM."""
    return {
        i for i, a in enumerate(d.worker_only)
        if a.tool in HARD_RULE_TOOLS and not a.target_known
    }


def fast_path(d: Diff) -> JudgeVerdict | None:
    """APPROVE without an LLM call when the Worker did nothing the Shadow didn't."""
    if d.worker_only:
        return None
    return JudgeVerdict(
        verdict="APPROVE",
        source="fast_path",
        per_action=[],
        explanation="The assistant took the same sensitive actions with and without the external emails, "
                    "so nothing in them changed its behavior.",
    )


def _normalize(field: str, value) -> str:
    """Addresses compare case-insensitively; 800, 800.0 and "$800.00" are the same amount."""
    if field == "amount":
        try:
            return f"{float(str(value).replace('$', '').replace(',', '')):.2f}"
        except ValueError:
            pass
    return str(value if value is not None else "").strip().lower()
