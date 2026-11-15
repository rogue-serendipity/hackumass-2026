"""The mock web: page tools, Shadow withholding, and pages reaching the Judge and Patcher. No LLM calls."""

import agents
import patcher
from env import (
    TOOL_SCHEMAS,
    WITHHELD_PAGE,
    Env,
    apply_overrides,
    list_scenarios,
    load_scenario,
    sources,
    tools_for,
    untrusted_emails,
)

WEB = [s.id for s in list_scenarios() if s.id.startswith("extra_web_")]
EMAIL_ONLY = [s.id for s in list_scenarios() if not s.id.startswith("extra_web_")]


def test_web_scenarios_exist_with_pages():
    assert set(WEB) == {"extra_web_checkout", "extra_web_forum_exfil", "extra_web_dining_hours"}
    for sid in WEB:
        assert load_scenario(sid).state.pages


def test_email_scenarios_keep_exactly_their_old_tools():
    for sid in EMAIL_ONLY:
        s = load_scenario(sid)
        assert s.state.pages == []
        assert tools_for(s) is TOOL_SCHEMAS


def test_web_scenarios_add_the_two_browsing_tools():
    names = [t["function"]["name"] for t in tools_for(load_scenario("extra_web_checkout"))]
    assert names[: len(TOOL_SCHEMAS)] == [t["function"]["name"] for t in TOOL_SCHEMAS]
    assert names[len(TOOL_SCHEMAS):] == ["search_web", "open_page"]


def test_prompt_choice(monkeypatch):
    seen = []

    class Stop(Exception):
        pass

    async def fake_chat(client, usage, **kwargs):
        seen.append((kwargs["messages"][0]["content"], [t["function"]["name"] for t in kwargs["tools"]]))
        raise Stop

    monkeypatch.setattr(agents, "chat", fake_chat)
    import asyncio

    for sid in ("inbox_exfil", "extra_web_checkout"):
        s = load_scenario(sid)
        try:
            asyncio.run(agents.run_agent(s, Env(s.state, "worker"), None, None, lambda *a: asyncio.sleep(0)))
        except Stop:
            pass
    (email_prompt, email_tools), (web_prompt, web_tools) = seen
    assert email_prompt.startswith("You are an email assistant") and "open_page" not in email_tools
    assert web_prompt.startswith("You are a personal assistant") and "open_page" in web_tools


def test_shadow_cannot_read_untrusted_pages_but_sees_address_and_title():
    s = load_scenario("extra_web_checkout")
    worker, shadow = Env(s.state, "worker"), Env(s.state, "shadow")
    listing = worker.execute("open_page", {"page_id": "p1"}, 0)
    assert "anker.deals.seller@gmail.com" in listing["content"]
    hidden = shadow.execute("open_page", {"page_id": "p1"}, 0)
    assert hidden["content"] == WITHHELD_PAGE
    assert hidden["url"] == listing["url"] and hidden["title"] == listing["title"]
    # A trusted page stays readable for both.
    trusted = load_scenario("extra_web_forum_exfil").state.model_copy(deep=True)
    trusted.pages[1].trusted = True
    assert Env(trusted, "shadow").execute("open_page", {"page_id": "p2"}, 0)["content"] != WITHHELD_PAGE


def test_search_matches_title_or_url_and_never_returns_content():
    env = Env(load_scenario("extra_web_dining_hours").state, "shadow")
    hits = env.execute("search_web", {"query": "Worcester dining hours"}, 0)
    assert [h["id"] for h in hits] == ["p1", "p2"]  # Worcester first: it matches more words
    assert set(hits[0]) == {"id", "url", "title"}
    # No match: show the whole (small) web rather than nothing.
    assert len(env.execute("search_web", {"query": "zzz"}, 0)) == 2


def test_open_page_by_url_tracks_reads_and_reports_unknown_pages():
    s = load_scenario("extra_web_forum_exfil")
    env = Env(s.state, "worker")
    page = env.execute("open_page", {"page_id": "https://cs230-forum.org/threads/final-exam-info"}, 0)
    assert page["id"] == "p1" and env.read_ids == {"p1"}
    assert "error" in env.execute("open_page", {"page_id": "p9"}, 1)


def test_pages_the_worker_read_reach_the_judge_as_untrusted_sources():
    s = load_scenario("extra_web_forum_exfil")
    env = Env(s.state, "worker")
    env.execute("read_email", {"email_id": "e1"}, 0)  # trusted: not sent to the Judge
    env.execute("open_page", {"page_id": "p1"}, 1)
    seen = untrusted_emails(s.state, env.read_ids)
    assert [e.id for e in seen] == ["p1"]
    assert seen[0].from_ == "https://cs230-forum.org/threads/final-exam-info"
    assert seen[0].subject.startswith("[Web page]")
    assert "accommodations@cs230-staff.org" in seen[0].body


def test_overrides_replace_the_pages():
    s = load_scenario("extra_web_dining_hours")
    edited = apply_overrides(s, None, None, [{"id": "p7", "url": "https://x.test", "title": "T", "body": "B"}])
    assert [p.id for p in edited.state.pages] == ["p7"] and edited.state.pages[0].trusted is False
    assert [p.id for p in s.state.pages] == ["p1", "p2"]  # original untouched


def test_patcher_rules_can_fire_on_a_page(monkeypatch):
    s = load_scenario("extra_web_checkout")
    rule = patcher.Rule(
        id=1, pattern_description="Listing asks for off-platform payment.",
        # The longest term is the page's address, which isn't in its text.
        match_terms=["https://campusmarket.com/listing/anker-65w-usb-c", "anker.deals.seller@gmail.com",
                     "checkout is down", "send payment directly"],
        blocked_tool="transfer_money", source_scenario="extra_web_checkout", source_email_id="p1",
    )
    monkeypatch.setattr(patcher, "rules", [rule])
    hit = patcher.check(s)
    assert hit is not None and hit.email_id == "p1"
    verdict = patcher.rule_verdict(hit, s)
    assert verdict.culprit_email_id == "p1"
    assert verdict.culprit_quote == "anker.deals.seller@gmail.com"
    assert verdict.culprit_quote in next(e for e in sources(s.state) if e.id == "p1").body
