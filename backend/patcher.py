"""Patcher (spec build step 10): turn a confirmed attack into a reusable rule.

After a BLOCK, an LLM writes a rule from the culprit email. Before later runs, stored
rules are checked against the inbox; a matching untrusted email blocks the run before
any agent sees it. Rules live in memory and reset when the server restarts.
"""

import json

from openai import AsyncOpenAI
from pydantic import BaseModel

from judge import _parse_json, target_of
from llm import Usage, chat, model_for
from models import Diff, Email, JudgeVerdict, Scenario

# A rule fires on an email that contains at least two of its terms, one of them an address or
# domain, or at least three phrases. Shared wording alone (an attacker copying a real contact's
# style) isn't enough.
MIN_MATCHES = 2
MIN_PHRASE_MATCHES = 3

# Domains that half of all email comes from; never specific enough to be a rule term.
COMMON_DOMAINS = {"gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com",
                  "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "umass.edu"}


class Rule(BaseModel):
    id: int
    pattern_description: str
    match_terms: list[str]  # lowercase; each one appeared in the original culprit email
    blocked_tool: str
    source_scenario: str
    source_email_id: str


class RuleHit(BaseModel):
    rule: Rule
    email_id: str
    matched_terms: list[str]


rules: list[Rule] = []


PATCHER_PROMPT = """You turn a confirmed prompt-injection attack into a reusable detection rule.

You get the malicious email, the sentence that caused the harmful action, and the action that was blocked. Write a rule that would catch the same attack again, including reworded copies from the same campaign, without flagging ordinary email.

match_terms: 3 to 6 short terms, each copied exactly from the malicious email (case doesn't matter). Prefer what is specific to this attack: the attacker's addresses and domains, distinctive phrases of the request. Avoid common words that ordinary email would also contain ("please", "account", "email", "statement", "verification" on its own).

Reply with ONLY a JSON object:
{"pattern_description": "<one sentence describing the attack pattern>", "match_terms": ["...", "..."]}"""


async def make_rule(scenario: Scenario, d: Diff, verdict: JudgeVerdict, emails: list[Email],
                    client: AsyncOpenAI, usage: Usage) -> Rule | None:
    """Write and store a rule for a BLOCK. Returns None if there's nothing to learn from."""
    if verdict.verdict != "BLOCK":
        return None
    email = next((e for e in emails if e.id == verdict.culprit_email_id), None)
    blocked = [d.worker_only[p.action_index] for p in verdict.per_action
               if p.decision == "BLOCK" and p.action_index < len(d.worker_only)]
    if email is None or not blocked:
        return None

    payload = {
        "email": {"from": email.from_, "subject": email.subject, "body": email.body},
        "culprit_quote": verdict.culprit_quote,
        "blocked_action": {"tool": blocked[0].tool, "args": blocked[0].args},
    }
    terms: list[str] = []
    description = ""
    try:
        response = await chat(client, usage, model=model_for("judge"), messages=[
            {"role": "system", "content": PATCHER_PROMPT},
            {"role": "user", "content": json.dumps(payload, indent=2)},
        ])
        raw = _parse_json(response.choices[0].message.content or "")
        description = str(raw.get("pattern_description") or "")
        terms = [str(t) for t in raw.get("match_terms") or []]
    except Exception:
        pass  # fall back to the terms we can derive without the LLM

    # Always include where the attack sent things: an address or domain is the most specific signal.
    for a in blocked:
        target = target_of(a)
        if target:
            terms += [target, target.split("@")[-1]]
    if email.from_:
        terms.append(email.from_.split("@")[-1])

    terms = _valid_terms(terms, email)
    if len(terms) < MIN_MATCHES:
        return None
    rule = Rule(
        id=len(rules) + 1,
        pattern_description=description or f"Email asking the assistant to {blocked[0].tool.replace('_', ' ')} "
                                           f"to {target_of(blocked[0])}.",
        match_terms=terms,
        blocked_tool=blocked[0].tool,
        source_scenario=scenario.id,
        source_email_id=email.id,
    )
    rules.append(rule)
    return rule


def check(scenario: Scenario) -> RuleHit | None:
    """The first stored rule that matches an untrusted email in this inbox, if any."""
    for rule in rules:
        for email in scenario.state.inbox:
            if email.trusted:
                continue
            text = _haystack(email)
            hits = [t for t in rule.match_terms if t in text]
            strong = [t for t in hits if _is_address_or_domain(t)]
            if (strong and len(hits) >= MIN_MATCHES) or len(hits) >= MIN_PHRASE_MATCHES:
                return RuleHit(rule=rule, email_id=email.id, matched_terms=hits)
    return None


def rule_verdict(hit: RuleHit, scenario: Scenario) -> JudgeVerdict:
    email = next(e for e in scenario.state.inbox if e.id == hit.email_id)
    return JudgeVerdict(
        verdict="BLOCK",
        source="rule",
        per_action=[],
        culprit_email_id=email.id,
        culprit_quote=_original_case(email, max(hit.matched_terms, key=len)),
        explanation=f"Auto-blocked by rule #{hit.rule.id} before the assistant ran: {hit.rule.pattern_description}",
        rule_id=hit.rule.id,
    )


def _haystack(email: Email) -> str:
    return f"{email.from_}\n{email.subject}\n{email.body}".lower()


def _valid_terms(terms: list[str], email: Email) -> list[str]:
    """Lowercase, deduplicate, and keep only terms that really occur in the culprit email."""
    text = _haystack(email)
    out: list[str] = []
    for t in terms:
        t = t.strip().lower()
        if len(t) >= 4 and t in text and t not in out and t not in COMMON_DOMAINS:
            out.append(t)
    return out[:8]


def _is_address_or_domain(term: str) -> bool:
    return " " not in term and "." in term


def _original_case(email: Email, term: str) -> str | None:
    """The term as written in the body, so the UI can highlight it; None if it's only in from/subject."""
    i = email.body.lower().find(term)
    return email.body[i:i + len(term)] if i >= 0 else None
