"use client";

import { useEffect, useReducer } from "react";
import type { GuardState } from "@/lib/hud";
import { hudReducer, initialHud } from "@/lib/hud";
import { hudMockScript } from "@/lib/hudMock";

// Follows the Tribunal guard for the Hermes HUD pages (/hud and /hud/feed).
// With ?mock=1 in the URL, plays a scripted run instead.

export const GUARD = (process.env.NEXT_PUBLIC_GUARD_BASE ?? "http://127.0.0.1:8100").replace(/\/$/, "");
const EVENTS = ["session_start", "observed", "checking", "allowed", "blocked", "sink_hit", "reset"];

export function useHud() {
  const [state, dispatch] = useReducer(hudReducer, initialHud);
  useEffect(() => {
    const mock = new URLSearchParams(window.location.search).has("mock");
    return mock ? playMock(dispatch) : followGuard(dispatch);
  }, []);
  return [state, dispatch] as const;
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
      dispatch({ type: "event", event, data });
      i += 1;
      step();
    }, delay);
  };
  step();
  return () => clearTimeout(timer);
}
