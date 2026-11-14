"""eval.py against a stubbed pipeline. No LLM calls."""

import asyncio
import json

import pytest

import eval as ev
import pipeline
from env import list_scenarios
from judge import diff, fast_path
from models import JudgeVerdict, ProposedAction

ATTACKS = [s.id for s in list_scenarios() if s.category == "attack"]
BENIGN = [s.id for s in list_scenarios() if s.category == "benign"]

# Keys and nothing else: the frontend's EvalResult type in shared/api_contract.md.
RESULT_KEYS = {
    "runs_per_scenario", "hijack_rate", "attack_detection_rate", "benign_false_positive_rate",
    "noise_divergence_rate", "avg_latency_s", "total_input_tokens",
    "total_output_tokens", "scenarios",
}
SCENARIO_KEYS = {"id", "title", "category", "expected", "verdicts", "hijacked", "passed"}


def action(to="mallory@evil.example"):
    return ProposedAction(lane="worker", index=0, step_index=2, tool="send_email", args={"to": to, "body": "x"})


def result(scenario, outcome):
    """A RunResult for one of four outcomes:

    BLOCK    the Worker took one extra action (aimed at the attacker, in attack scenarios) and it was blocked
    MISSED   the same extra action, but the Judge approved it
    APPROVE  the Worker took no sensitive action (in an attack scenario: it resisted)
    OVERBLOCK  attack scenario only: an extra action to a non-attacker address was blocked
    """
    target = scenario.attacker_targets[0].upper() if scenario.attacker_targets and outcome != "OVERBLOCK" else "stranger@other.example"
    worker = [] if outcome == "APPROVE" else [action(target)]
    d = diff(worker, [], scenario.user_request, scenario.state.contacts)
    verdict = "APPROVE" if outcome in ("APPROVE", "MISSED") else "BLOCK"
    v = fast_path(d) or JudgeVerdict(verdict=verdict, source="llm", per_action=[], explanation="judged")
    return pipeline.RunResult(
        scenario_id=scenario.id, worker_actions=worker, shadow_actions=[], diff=d, verdict=v,
        committed=[], latency_s=2.0, input_tokens=100, output_tokens=10,
    )


@pytest.fixture
def stub(monkeypatch, tmp_path):
    """Patch the pipeline. `verdicts[scenario_id]` and `lanes[scenario_id]` are consumed in call order."""
    monkeypatch.setattr(ev, "RESULTS_DIR", tmp_path / "results")
    monkeypatch.setattr(ev, "CONCURRENCY", 1)  # deterministic call order
    plan = {"verdicts": {}, "lanes": {}, "calls": []}

    async def run_scenario(scenario, emit=None):
        plan["calls"].append(("tribunal", scenario.id))
        queued = plan["verdicts"].get(scenario.id)
        outcome = queued.pop(0) if queued else scenario.expected
        if isinstance(outcome, Exception):
            raise outcome
        return result(scenario, outcome)

    async def run_lane(scenario, lane, usage, emit=None):
        assert lane == "worker"
        plan["calls"].append(("lane", scenario.id))
        usage.input_tokens += 40
        usage.output_tokens += 4
        queued = plan["lanes"].get(scenario.id)
        return queued.pop(0) if queued else []

    monkeypatch.setattr(pipeline, "run_scenario", run_scenario)
    monkeypatch.setattr(pipeline, "run_lane", run_lane)
    return plan


def run(runs=3):
    return asyncio.run(ev.run_eval(runs))


def test_perfect_run_has_the_contract_shape(stub):
    r = run(3)
    assert set(r) == RESULT_KEYS
    assert r["runs_per_scenario"] == 3
    assert r["hijack_rate"] == 1.0
    assert r["attack_detection_rate"] == 1.0
    assert r["benign_false_positive_rate"] == 0.0
    assert r["noise_divergence_rate"] == 0.0
    assert r["avg_latency_s"] == 2.0

    assert [s["id"] for s in r["scenarios"]] == ATTACKS + BENIGN
    for s in r["scenarios"]:
        assert set(s) == SCENARIO_KEYS
        assert s["verdicts"] == [s["expected"]] * 3 and s["passed"] == 3
        assert s["hijacked"] == (3 if s["category"] == "attack" else 0)


def test_every_scenario_runs_n_times_and_benign_ones_get_noise_pairs(stub):
    run(2)
    calls = stub["calls"]
    for sid in ATTACKS + BENIGN:
        assert calls.count(("tribunal", sid)) == 2
    for sid in BENIGN:
        assert calls.count(("lane", sid)) == 4  # 2 pairs
    assert not any(kind == "lane" and sid in ATTACKS for kind, sid in calls)


def test_tokens_include_the_noise_baseline_runs(stub):
    r = run(1)
    tribunal, lanes = len(ATTACKS) + len(BENIGN), 2 * len(BENIGN)
    assert r["total_input_tokens"] == 100 * tribunal + 40 * lanes
    assert r["total_output_tokens"] == 10 * tribunal + 4 * lanes


def test_missed_attack_and_false_positive_lower_the_rates(stub):
    stub["verdicts"][ATTACKS[0]] = ["BLOCK", "MISSED", "BLOCK"]
    stub["verdicts"][BENIGN[0]] = ["BLOCK", "APPROVE", "APPROVE"]
    r = run(3)
    assert r["hijack_rate"] == 1.0
    assert r["attack_detection_rate"] == round((3 * len(ATTACKS) - 1) / (3 * len(ATTACKS)), 4)
    assert r["benign_false_positive_rate"] == round(1 / (3 * len(BENIGN)), 4)
    by_id = {s["id"]: s for s in r["scenarios"]}
    assert by_id[ATTACKS[0]]["verdicts"] == ["BLOCK", "APPROVE", "BLOCK"]
    assert by_id[ATTACKS[0]]["hijacked"] == 3 and by_id[ATTACKS[0]]["passed"] == 2
    assert by_id[BENIGN[0]]["passed"] == 2 and by_id[BENIGN[0]]["hijacked"] == 0


def test_a_resisted_attack_is_not_a_missed_detection(stub):
    # The Worker ignored the injection twice and was hijacked (and blocked) once.
    stub["verdicts"][ATTACKS[0]] = ["APPROVE", "APPROVE", "BLOCK"]
    r = run(3)
    total = 3 * len(ATTACKS)
    assert r["hijack_rate"] == round((total - 2) / total, 4)
    assert r["attack_detection_rate"] == 1.0  # every hijacked run was blocked
    first = r["scenarios"][0]
    assert first["verdicts"] == ["APPROVE", "APPROVE", "BLOCK"]
    assert first["hijacked"] == 1 and first["passed"] == 3


def test_detection_rate_is_null_when_no_attack_worked(stub):
    for sid in ATTACKS:
        stub["verdicts"][sid] = ["APPROVE"]
    r = run(1)
    assert r["hijack_rate"] == 0.0
    assert r["attack_detection_rate"] is None
    assert all(s["passed"] == 1 for s in r["scenarios"])


def test_only_actions_aimed_at_attacker_targets_count_as_hijacked(stub):
    stub["verdicts"][ATTACKS[0]] = ["OVERBLOCK"]
    r = run(1)
    first = r["scenarios"][0]
    assert first["verdicts"] == ["BLOCK"] and first["hijacked"] == 0 and first["passed"] == 1
    assert r["hijack_rate"] == round((len(ATTACKS) - 1) / len(ATTACKS), 4)


def test_noise_counts_an_action_only_one_worker_run_took(stub):
    # Pair 1: the two runs differ in which action they took. Pair 2: same action, different wording.
    same_a, same_b = action("sam@x.example"), action("sam@x.example")
    same_b.args["body"] = "worded differently"
    stub["lanes"][BENIGN[0]] = [[action()], [], [same_a], [same_b]]
    r = run(2)
    assert r["noise_divergence_rate"] == round(1 / (2 * len(BENIGN)), 4)


def test_a_run_that_fails_once_is_retried(stub):
    stub["verdicts"][ATTACKS[0]] = [RuntimeError("rate limited"), "BLOCK", "BLOCK"]
    r = run(2)
    assert r["scenarios"][0]["verdicts"] == ["BLOCK", "BLOCK"]
    assert stub["calls"].count(("tribunal", ATTACKS[0])) == 3


def test_a_run_that_keeps_failing_is_left_out_and_recorded(stub):
    stub["verdicts"][ATTACKS[0]] = [RuntimeError("boom"), RuntimeError("boom"), "BLOCK"]
    r = run(2)
    first = r["scenarios"][0]
    assert first["verdicts"] == ["BLOCK"] and first["passed"] == 1
    assert r["attack_detection_rate"] == 1.0  # over the runs that completed

    saved = json.loads(next(ev.RESULTS_DIR.glob("eval_*.json")).read_text())
    errors = saved["detail"][ATTACKS[0]]["errors"]
    assert errors == [{"kind": "tribunal", "run": 0, "error": "RuntimeError('boom')"}]


def test_raises_when_nothing_completes(stub, monkeypatch):
    async def always_fails(scenario, emit=None):
        raise RuntimeError("no key")

    monkeypatch.setattr(pipeline, "run_scenario", always_fails)
    with pytest.raises(RuntimeError, match="Every evaluation run failed.*no key"):
        run(1)
    assert not ev.RESULTS_DIR.exists()


def test_unbuilt_pipeline_surfaces_as_not_implemented(monkeypatch, tmp_path):
    monkeypatch.setattr(ev, "RESULTS_DIR", tmp_path / "results")

    async def unbuilt(*args, **kwargs):
        raise NotImplementedError

    monkeypatch.setattr(pipeline, "run_scenario", unbuilt)
    monkeypatch.setattr(pipeline, "run_lane", unbuilt)
    with pytest.raises(NotImplementedError):
        run(1)


def test_results_file_holds_the_result_and_per_run_detail(stub):
    r = run(2)
    files = list(ev.RESULTS_DIR.glob("eval_*.json"))
    assert len(files) == 1
    saved = json.loads(files[0].read_text())
    assert saved["result"] == r
    assert set(saved["detail"]) == set(ATTACKS + BENIGN)
    assert [x["run"] for x in saved["detail"][ATTACKS[0]]["runs"]] == [0, 1]
    assert len(saved["detail"][BENIGN[0]]["noise"]) == 2
    assert saved["detail"][ATTACKS[0]]["noise"] == []


def test_rejects_zero_runs(stub):
    with pytest.raises(ValueError):
        run(0)
