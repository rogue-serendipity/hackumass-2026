import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "../components/Markdown";
import { describeError } from "./errors";
import { initialRunState, runReducer } from "./runReducer";
import { seconds } from "./useNow";

const md = (text: string) => renderToStaticMarkup(createElement(Markdown, { text }));

describe("Markdown", () => {
  it("renders the bold, code, lists and tables the real models write", () => {
    const html = md(
      "\n\n**Summary:** sent to `a@b.example`\n\n- one\n- two\n\n| From | Status |\n|---|---|\n| x | ok |",
    );
    expect(html).toContain("<strong");
    expect(html).toContain("<code");
    expect(html).toContain("<li");
    expect(html).toContain("<table");
    expect(html).not.toContain("**");
    expect(html).not.toContain("`");
  });

  it("never renders a clickable link, a fetched image or raw HTML", () => {
    const html = md('[click](https://evil.example) ![x](https://evil.example/p.png) <img src="https://evil.example/q.png">');
    expect(html).not.toContain("<a");
    expect(html).not.toContain("<img");
    expect(html).toContain("click");
  });
});

describe("run timing", () => {
  it("records when the run started, each lane finished and the run ended", () => {
    let s = runReducer(initialRunState, { type: "start", emails: [], at: 1000 });
    s = runReducer(s, { type: "event", ev: { event: "lane_done", data: { lane: "shadow", actions: [] } }, at: 4000 });
    s = runReducer(s, { type: "event", ev: { event: "end", data: {} }, at: 9000 });
    expect([s.startedAt, s.laneDoneAt.shadow, s.laneDoneAt.worker, s.endedAt]).toEqual([1000, 4000, null, 9000]);
  });

  it("keeps the first error, which is the cause", () => {
    let s = runReducer(initialRunState, { type: "start", emails: [] });
    s = runReducer(s, { type: "event", ev: { event: "error", data: { message: "RateLimitError: 429" } } });
    s = runReducer(s, { type: "event", ev: { event: "error", data: { message: "Lost the connection to the backend mid-run." } } });
    expect(s.error).toBe("RateLimitError: 429");
  });

  it("formats elapsed time", () => {
    expect(seconds(4321)).toBe("4s");
    expect(seconds(5849, true)).toBe("5.8s");
  });
});

describe("describeError", () => {
  it.each([
    ["Can't reach the backend at http://localhost:8000. Is it running?", "Can't reach the backend"],
    ["AuthenticationError: Error code: 401 - Invalid API key", "rejected the API key"],
    ["RateLimitError: Error code: 429 - too many requests", "rate-limiting"],
    ["APITimeoutError: Request timed out.", "too long"],
    ["RuntimeError: Missing WORKER_MODEL: set it in backend/.env (see backend/.env.example)", "missing configuration"],
    ["ValueError: something odd", "didn't finish"],
  ])("%s", (raw, title) => {
    expect(describeError(raw).title).toContain(title);
  });
});
