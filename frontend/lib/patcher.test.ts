import { afterEach, describe, expect, it, vi } from "vitest";
import * as mock from "./mock";
import { autoBlockedBy, deriveCardStatuses, initialRunState, phaseOf, runReducer } from "./runReducer";
import type { Rule, RunEvent } from "./types";

const rule: Rule = {
  id: 1,
  pattern_description: "Newsletter asks to forward bank mail.",
  match_terms: ["forward", "verification"],
  blocked_tool: "forward_email",
  source_scenario: "inbox_exfil",
  source_email_id: "e2",
};

function play(events: RunEvent[]) {
  let s = runReducer(initialRunState, { type: "start", emails: [] });
  for (const ev of events) s = runReducer(s, { type: "event", ev });
  return s;
}

/** Resolve a mock call whose result waits on (fake) timers. */
async function settle<T>(p: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return p;
}

/** Collect every event the mock streams for one run of `scenario_id`. */
async function mockRun(scenario_id: string): Promise<RunEvent[]> {
  const { run_id } = await settle(mock.startRun({ scenario_id }));
  const events: RunEvent[] = [];
  mock.openRunStream(run_id, (ev) => events.push(ev));
  await vi.runAllTimersAsync();
  return events;
}

describe("Patcher events", () => {
  it("keeps the learned rule from rule_created", () => {
    const s = play([{ event: "rule_created", data: { rule } }, { event: "end", data: {} }]);
    expect(s.ruleCreated).toEqual(rule);
    expect(autoBlockedBy(s)).toBeNull();
  });

  it("recognises an auto-blocked run, with empty lanes and no cards", () => {
    const empty = { matched: [], worker_only: [], shadow_only: [], arg_mismatch: [] };
    const s = play([
      { event: "lane_done", data: { lane: "worker", actions: [] } },
      { event: "lane_done", data: { lane: "shadow", actions: [] } },
      { event: "diff", data: empty },
      {
        event: "verdict",
        data: {
          verdict: "BLOCK", source: "rule", rule_id: 3, per_action: [],
          serves_user_request: null, introduces_new_goal_or_recipient: null,
          culprit_email_id: "e2", culprit_quote: "x", explanation: "matched rule #3",
        },
      },
      { event: "committed", data: { actions: [] } },
      { event: "end", data: {} },
    ]);
    expect(autoBlockedBy(s)).toBe(3);
    expect(phaseOf(s)).toBe("done");
    expect(s.steps).toEqual({ worker: [], shadow: [] });
    expect(deriveCardStatuses(s)).toEqual({});
  });
});

describe("mock Patcher", () => {
  afterEach(async () => {
    await settle(mock.clearRules());
    vi.useRealTimers();
  });

  it("learns a rule from a block, auto-blocks the rerun, and forgets on clear", async () => {
    vi.useFakeTimers();
    const first = await mockRun("inbox_exfil");
    const learned = first.find((e) => e.event === "rule_created");
    expect(learned).toBeDefined();
    expect(first.at(-1)?.event).toBe("end");

    expect(await settle(mock.getRules())).toHaveLength(1);

    const rerun = await mockRun("inbox_exfil");
    expect(rerun.some((e) => e.event === "step")).toBe(false);
    expect(autoBlockedBy(play(rerun))).toBe(1);

    await settle(mock.clearRules());
    const again = await mockRun("inbox_exfil");
    expect(again.some((e) => e.event === "step")).toBe(true);
  });

  it("learns nothing from an approval", async () => {
    vi.useFakeTimers();
    const events = await mockRun("legit_reply");
    expect(events.some((e) => e.event === "rule_created")).toBe(false);
  });
});
