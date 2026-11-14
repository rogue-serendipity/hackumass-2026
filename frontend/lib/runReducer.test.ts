import { describe, expect, it } from "vitest";
import { MOCK_SCENARIOS } from "./fixtures";
import { splitAroundQuote } from "./highlight";
import {
  cardKey,
  deriveCardStatuses,
  initialRunState,
  phaseOf,
  runReducer,
  type RunState,
} from "./runReducer";
import type { RunEvent } from "./types";

const mock = (id: string) => MOCK_SCENARIOS.find((m) => m.scenario.id === id)!;

function play(events: RunEvent[], until?: RunEvent["event"]): RunState {
  let state = runReducer(initialRunState, { type: "start", emails: [] });
  for (const ev of events) {
    state = runReducer(state, { type: "event", ev });
    if (ev.event === until) break;
  }
  return state;
}

describe("runReducer", () => {
  it("collects steps per lane and finishes on end", () => {
    const { events } = mock("inbox_exfil");
    const state = play(events);
    expect(state.status).toBe("done");
    expect(state.steps.worker.map((s) => s.index)).toEqual(
      state.steps.worker.map((_, i) => i),
    );
    expect(state.steps.shadow.every((s) => s.lane === "shadow")).toBe(true);
    expect(state.verdict?.verdict).toBe("BLOCK");
  });

  it("ignores events once the run is no longer running", () => {
    const { events } = mock("inbox_exfil");
    const done = play(events);
    expect(runReducer(done, { type: "event", ev: events[0] })).toBe(done);
    expect(
      runReducer(initialRunState, { type: "event", ev: events[0] }),
    ).toBe(initialRunState);
  });

  it("reports the phase as the run progresses", () => {
    const { events } = mock("inbox_exfil");
    expect(phaseOf(initialRunState)).toBe("idle");
    expect(phaseOf(play(events, "step"))).toBe("agents");
    expect(phaseOf(play(events.filter((e) => e.event !== "diff"), "lane_done"))).toBe("agents");
    expect(phaseOf(play(events, "diff"))).toBe("judging");
    expect(phaseOf(play(events, "verdict"))).toBe("done");
  });
});

describe("deriveCardStatuses", () => {
  it("marks the worker_only card and attaches the Judge's decision", () => {
    const { events } = mock("inbox_exfil");
    const beforeVerdict = deriveCardStatuses(play(events, "diff"));
    const forward = play(events).steps.worker.find(
      (s) => s.type === "tool_call" && s.data.tool === "forward_email",
    )!;
    const key = cardKey("worker", forward.index);
    expect(beforeVerdict[key]).toMatchObject({ kind: "worker_only" });
    expect(beforeVerdict[key].decision).toBeUndefined();

    const after = deriveCardStatuses(play(events));
    expect(after[key]).toMatchObject({
      kind: "worker_only",
      decision: "BLOCK",
      targetKnown: false,
    });
    expect(Object.keys(after)).toEqual([key]);
  });

  it("keeps a matched pair green in both lanes, with differing fields and the committed flag", () => {
    const state = play(mock("reply_hijack").events);
    const statuses = deriveCardStatuses(state);
    const [pair] = state.diff!.matched;
    const w = statuses[cardKey("worker", pair.worker.step_index)];
    const s = statuses[cardKey("shadow", pair.shadow.step_index)];
    expect(w).toMatchObject({ kind: "matched", fields: ["body"], committed: true });
    expect(s).toMatchObject({ kind: "matched", fields: ["body"] });
    expect(s.committed).toBeUndefined();
    const hijack = state.diff!.worker_only[0];
    expect(statuses[cardKey("worker", hijack.step_index)]).toMatchObject({
      kind: "worker_only",
      decision: "BLOCK",
    });
  });

  it("marks an approved worker_only action as committed", () => {
    const state = play(mock("legit_reply").events);
    const a = state.diff!.worker_only[0];
    expect(deriveCardStatuses(state)[cardKey("worker", a.step_index)]).toMatchObject({
      kind: "worker_only",
      decision: "APPROVE",
      committed: true,
    });
  });

  it("returns nothing before the diff and on the fast path", () => {
    expect(deriveCardStatuses(initialRunState)).toEqual({});
    expect(deriveCardStatuses(play(mock("summarize_only").events))).toEqual({});
  });
});

describe("fixtures follow the contract", () => {
  it.each(MOCK_SCENARIOS.map((m) => [m.scenario.id, m] as const))(
    "%s",
    (_id, m) => {
      const state = play(m.events);
      const { diff, verdict } = state;
      // every diff action points at a sensitive tool_call step in its lane
      const actions = [
        ...diff!.worker_only,
        ...diff!.shadow_only,
        ...diff!.matched.flatMap((p) => [p.worker, p.shadow]),
      ];
      for (const a of actions) {
        const step = state.steps[a.lane].find((s) => s.index === a.step_index);
        expect(step?.type).toBe("tool_call");
        expect(step?.type === "tool_call" && step.data.sensitive).toBe(true);
      }
      // the culprit quote is an exact substring of the culprit email
      if (verdict!.culprit_email_id) {
        const email = m.scenario.state.inbox.find(
          (e) => e.id === verdict!.culprit_email_id,
        )!;
        expect(splitAroundQuote(email.body, verdict!.culprit_quote)).not.toBeNull();
      }
      expect(verdict!.verdict).toBe(m.scenario.expected);
    },
  );
});

describe("splitAroundQuote", () => {
  it("splits around the first occurrence", () => {
    expect(splitAroundQuote("a QUOTE b QUOTE", "QUOTE")).toEqual({
      before: "a ",
      match: "QUOTE",
      after: " b QUOTE",
    });
  });
  it("returns null when the quote is missing or empty", () => {
    expect(splitAroundQuote("abc", "zzz")).toBeNull();
    expect(splitAroundQuote("abc", null)).toBeNull();
    expect(splitAroundQuote("abc", "")).toBeNull();
  });
});
