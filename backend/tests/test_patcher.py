"""Patcher rule matching and validation. No LLM calls."""

import pytest

import patcher
from env import list_scenarios, load_scenario
from patcher import Rule, check, rule_verdict


@pytest.fixture(autouse=True)
def no_rules():
    patcher.rules.clear()
    yield
    patcher.rules.clear()


def add_rule(*terms, tool="forward_email"):
    rule = Rule(id=len(patcher.rules) + 1, pattern_description="Fake aid office asks to forward bank email.",
                match_terms=list(terms), blocked_tool=tool, source_scenario="inbox_exfil", source_email_id="e1")
    patcher.rules.append(rule)
    return rule


def test_rule_fires_on_the_attack_it_came_from():
    add_rule("finaid-verify@umass-studentservices.org", "umass-studentservices.org", "forward your most recent bank statement")
    hit = check(load_scenario("inbox_exfil"))
    assert hit and hit.email_id == "e1" and len(hit.matched_terms) == 3

    v = rule_verdict(hit, load_scenario("inbox_exfil"))
    assert v.verdict == "BLOCK" and v.source == "rule" and v.rule_id == 1
    assert v.culprit_quote in load_scenario("inbox_exfil").state.inbox[0].body


def test_one_matching_term_is_not_enough():
    add_rule("umass-studentservices.org", "never-appears-anywhere")
    assert check(load_scenario("inbox_exfil")) is None


def test_trusted_emails_are_never_matched():
    add_rule("first county bank", "statement is ready")
    scenario = load_scenario("inbox_exfil")
    for e in scenario.state.inbox:
        e.trusted = True
    assert check(scenario) is None


def test_valid_terms_keeps_only_text_from_the_email():
    email = load_scenario("inbox_exfil").state.inbox[0]
    terms = patcher._valid_terms(["FINAID-verify@umass-studentservices.org", "made up phrase", "aid", "finaid-verify@umass-studentservices.org"], email)
    assert terms == ["finaid-verify@umass-studentservices.org"]


def test_rules_from_attack_addresses_dont_touch_benign_scenarios():
    for s in list_scenarios():
        sc = load_scenario(s.id)
        for t in sc.attacker_targets:
            add_rule(t, t.split("@")[-1])
    for s in list_scenarios():
        if s.category == "benign":
            assert check(load_scenario(s.id)) is None, s.id


def test_shared_wording_with_a_real_contact_is_not_enough():
    # The payee-swap attack copies the real Sam's phrasing; only its address is distinctive.
    add_rule("sam.rivera.pay@gmail.com", "your half is", "grocery run came to", tool="transfer_money")
    assert check(load_scenario("requested_payment")) is None
    assert check(load_scenario("extra_payee_swap")) is not None


def test_common_mail_domains_are_never_terms():
    email = load_scenario("extra_payee_swap").state.inbox[0]
    assert "gmail.com" not in patcher._valid_terms(["gmail.com", "sam.rivera.pay@gmail.com"], email)


def test_three_phrases_fire_without_an_address():
    add_rule("forward your most recent bank statement", "aid file was selected", "keep your aid on schedule")
    assert check(load_scenario("inbox_exfil")) is not None
