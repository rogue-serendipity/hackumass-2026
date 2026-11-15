"use client";

import { useEffect, useReducer } from "react";
import type { GuardState } from "@/lib/hud";
import { hudReducer, initialHud } from "@/lib/hud";
import { hudMockScript } from "@/lib/hudMock";

// Follows the Tribunal guard for the Hermes HUD pages (/hud and /hud/feed).
// With ?mock=1 in the URL, plays a scripted run instead.

export const GUARD = (process.env.NEXT_PUBLIC_GUARD_BASE ?? "http://127.0.0.1:8100").replace(/\/$/, "");
const EVENTS = ["session_start", "observed", "checking", "allowed", "blocked", "decided", "sink_hit", "reset"];

export function useHud() {
  const [state, dispatch] = useReducer(hudReducer, initialHud);
  useEffect(() => {
    const mock = new URLSearchParams(window.location.search).has("mock");
    return mock ? playMock(dispatch) : followGuard(dispatch);
  }, []);
  return [state, dispatch] as const;
}

/**
 * The user's choice on a held block (H12). Live: tells the guard, which emits "decided".
 * Mock: there's no guard, so record the decision locally.
 */
export async function decideCheck(
  dispatch: (a: Parameters<typeof hudReducer>[1]) => void,
  sessionId: string | null,
  checkId: string,
  decision: "allow" | "block",
  remember = false,
): Promise<void> {
  if (new URLSearchParams(window.location.search).has("mock")) {
    dispatch({ type: "event", event: "decided", data: { session_id: sessionId, check_id: checkId, decision, by: "user" } });
    return;
  }
  let ok = false;
  try {
    const res = await fetch(`${GUARD}/hermes/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, check_id: checkId, decision, remember }),
    });
    ok = res.ok; // the guard's "decided" event updates the card
  } catch {
    // Unreachable guard: it blocks when the wait runs out.
  }
  if (!ok) {
    // 409: the wait already ended (timed out or decided elsewhere). Stop offering the buttons;
    // the first decision wins, so this never overrides a real "decided" event.
    dispatch({ type: "event", event: "decided", data: { session_id: sessionId, check_id: checkId, decision: "block", by: "timeout" } });
  }
}

/** Ask the guard to forget everything (it emits "reset", which clears every open HUD). */
export async function resetGuard(): Promise<void> {
  try {
    await fetch(`${GUARD}/hermes/reset`, { method: "POST" });
  } catch {
    // Offline: the HUD already says so.
  }
}

type Dispatch = (a: Parameters<typeof hudReducer>[1]) => void;


function followGuard(dispatch: Dispatch): () => void {
  let source: EventSource | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const connect = async () => {
    try {
      const res = await fetch(`${GUARD}/hermes/state`, { cache: "no-store" });
      if (res.ok) dispatch({ type: "snapshot", state: (await res.json()) as GuardState });
    } catch {
      // The stream's error handler reports offline and retries.
    }
    if (closed) return;
    source = new EventSource(`${GUARD}/hermes/stream`);
    source.onopen = () => dispatch({ type: "connection", value: "live" });
    source.onerror = () => {
      dispatch({ type: "connection", value: "offline" });
      source?.close();
      if (!closed) retry = setTimeout(connect, 2000);
    };
    for (const name of EVENTS) {
      source.addEventListener(name, (e) => {
        try {
          dispatch({ type: "event", event: name, data: JSON.parse((e as MessageEvent).data) });
        } catch {
          // Ignore a malformed event rather than break the pill.
        }
      });
    }
  };

  connect();
  return () => {
    closed = true;
    source?.close();
    if (retry) clearTimeout(retry);
  };
}

function playMock(dispatch: Dispatch): () => void {
  let i = 0;
  let timer: ReturnType<typeof setTimeout>;
  dispatch({ type: "connection", value: "live" });
  const step = () => {
    const [delay, event, data] = hudMockScript[i % hudMockScript.length];
    timer = setTimeout(() => {
      // A held block counts down to the next step (the mock's timeout).
      const next = hudMockScript[(i + 1) % hudMockScript.length];
      const live = event === "blocked" && data.awaiting_user ? { ...data, decide_by: Date.now() + next[0] } : data;
      dispatch({ type: "event", event, data: live });
      i += 1;
      step();
    }, delay);
  };
  step();
  return () => clearTimeout(timer);
}
