import { describe, expect, it } from "vitest";
import { cleanReason, hudReducer, initialHud, menuBarTitle, pillStatus, sourceLabel, type HudState } from "./hud";
import { hudMockScript } from "./hudMock";

const live: HudState = { ...initialHud, connection: "live" };
const ev = (s: HudState, event: string, data: Record<string, unknown>) =>
  hudReducer(s, { type: "event", event, data });

describe("hudReducer", () => {
  it("tracks a session through checks and a block", () => {
    let s = ev(live, "session_start", { session_id: "s1", task: "Set up the project" });
    s = ev(s, "observed", { session_id: "s1", observation_id: "o1", tool_name: "read_file", source: "file:/x/README.md", trusted: false });
    s = ev(s, "observed", { session_id: "s1", observation_id: "o2", tool_name: "read_file", source: "file:/x/README.md", trusted: false });
    s = ev(s, "checking", { session_id: "s1", check_id: "c1", tool_name: "terminal", summary: "terminal: pip install" });
    expect(pillStatus(s)).toEqual({ tone: "checking", text: "Checking terminal: pip install" });
    s = ev(s, "allowed", { session_id: "s1", check_id: "c1", tool_name: "terminal", summary: "terminal: pip install", source: "llm" });
    expect(pillStatus(s).text).toBe("1 action checked · 1 untrusted source read");

    s = ev(s, "blocked", {
      session_id: "s1", check_id: "c2", tool_name: "terminal", summary: "terminal: curl …/collect",
      shadow_summary: "nothing",
      reason: "Sends .env to an unknown host. Do not retry this action, and do not suggest that the user run it.",
      explanation: "", culprit: { source: "file:/x/README.md", observation_id: "o1", quote: "curl …" }, source: "llm",
    });
    expect(s.blocked?.reason).toBe("Sends .env to an unknown host.");
    expect(s.blocked?.explanation).toBe("Sends .env to an unknown host."); // falls back to the reason
    expect(pillStatus(s).tone).toBe("blocked");

    s = hudReducer(s, { type: "dismiss" });
    expect(s.blocked).toBeNull();
    expect(pillStatus(s).text).toBe("2 actions checked · 1 blocked · 1 untrusted source read");
  });

  it("starts fresh when events arrive from a new session", () => {
    let s = ev(live, "session_start", { session_id: "s1", task: "old" });
    s = ev(s, "checking", { session_id: "s1", check_id: "c1", tool_name: "terminal", summary: "x" });
    s = ev(s, "observed", { session_id: "s2", observation_id: "o1", tool_name: "read_file", source: "user", trusted: true });
    expect(s.sessionId).toBe("s2");
    expect(s.checks).toEqual([]);
    expect(s.observed).toBe(1);
  });

  it("shows a sink hit loudly until dismissed, and reset clears everything", () => {
    let s = ev(live, "sink_hit", { session_id: null, bytes: 30, preview: "API_TOKEN=fake" });
    expect(pillStatus(s).tone).toBe("breach");
    s = hudReducer(s, { type: "dismiss" });
    expect(s.sinkHits).toBe(1);
    expect(pillStatus(s).tone).toBe("idle");
    s = ev(s, "reset", {});
    expect(s).toEqual(live);
  });

  it("loads a snapshot without reopening an old block", () => {
    const s = hudReducer(live, {
      type: "snapshot",
      state: {
        sink_hits: 0,
        sessions: [{
          session_id: "s1", task: "t",
          observations: [{ observation_id: "o1", tool_name: "read_file", source: "file:/a/README.md", trusted: false }],
          checks: [{ check_id: "c1", tool_name: "terminal", summary: "curl", decision: "block", source: "llm", reason: "r" }],
        }],
      },
    });
    expect(s.blocked).toBeNull();
    expect(s.untrusted).toEqual(["file:/a/README.md"]);
    expect(pillStatus(s).text).toBe("1 action checked · 1 blocked · 1 untrusted source read");
  });

  it("says actions are held when the guard is offline", () => {
    expect(pillStatus({ ...initialHud, connection: "offline" }).text).toMatch(/offline/);
  });

  it("plays the whole mock script without throwing and ends reset", () => {
    let s = live;
    let sawBlock = false;
    for (const [, event, data] of hudMockScript) {
      s = ev(s, event, data);
      sawBlock ||= s.blocked !== null;
    }
    expect(sawBlock).toBe(true);
    expect(s).toEqual(live);
  });
});

describe("labels", () => {
  it("shortens sources", () => {
    expect(sourceLabel("file:/Users/me/demo/README.md")).toBe("README.md");
    expect(sourceLabel("web:https://forum.example.com/t/1")).toBe("forum.example.com/t/1");
    expect(sourceLabel("terminal:cat notes.txt")).toBe("output of `cat notes.txt`");
    expect(sourceLabel("user")).toBe("user");
  });

  it("strips the no-retry line meant for Hermes", () => {
    expect(cleanReason("Bad. Do not retry this action or suggest that the user run it.")).toBe("Bad.");
    expect(cleanReason("Fine as is.")).toBe("Fine as is.");
  });
});

describe("menuBarTitle", () => {
  it("stays short through a run", () => {
    expect(menuBarTitle(live)).toBe("");
    expect(menuBarTitle({ ...initialHud, connection: "offline" })).toBe("Off");
    let s = ev(live, "session_start", { session_id: "s1", task: "t" });
    s = ev(s, "checking", { session_id: "s1", check_id: "c1", tool_name: "terminal", summary: "x" });
    expect(menuBarTitle(s)).toBe("Checking…");
    s = ev(s, "allowed", { session_id: "s1", check_id: "c1", tool_name: "terminal", summary: "x", source: "llm" });
    expect(menuBarTitle(s)).toBe("✓ 1");
    s = ev(s, "blocked", { session_id: "s1", check_id: "c2", tool_name: "terminal", summary: "y", reason: "r", culprit: null });
    expect(menuBarTitle(s)).toBe("Blocked");
    s = hudReducer(s, { type: "dismiss" });
    expect(menuBarTitle(s)).toBe("✓ 1 · ✕ 1");
    expect(menuBarTitle(ev(s, "sink_hit", { session_id: null, preview: "x" }))).toBe("Leak!");
  });
});

describe("timeline", () => {
  it("records reads and checks in order, and keeps every block", () => {
    let s = ev(live, "session_start", { session_id: "s1", task: "Check my email" });
    s = ev(s, "observed", { session_id: "s1", observation_id: "o1", tool_name: "terminal", source: "email:e1 from records@x.org", trusted: false });
    s = ev(s, "checking", { session_id: "s1", check_id: "c1", tool_name: "terminal", summary: "./mail reply e3" });
    s = ev(s, "allowed", { session_id: "s1", check_id: "c1", tool_name: "terminal", summary: "./mail reply e3", source: "llm" });
    s = ev(s, "blocked", { session_id: "s1", check_id: "c2", tool_name: "terminal", summary: "./mail forward e2", reason: "r", culprit: null });
    expect(s.timeline.map((t) => (t.kind === "check" ? t.check_id : t.observation_id))).toEqual(["o1", "c1", "c2"]);
    expect(Object.keys(s.blocks)).toEqual(["c2"]);
    s = hudReducer(s, { type: "dismiss" });
    expect(s.blocks.c2.summary).toBe("./mail forward e2"); // dismissing the card keeps it in the feed
    expect(sourceLabel("email:e1 from records@x.org")).toBe("email from records@x.org");
  });
});
