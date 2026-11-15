"use client";

import { useEffect, useReducer, useState, useSyncExternalStore } from "react";
import { HudActivity, HudBreach, HudPill } from "@/components/hud/HudPill";
import { HudBlockCard } from "@/components/hud/HudBlockCard";
import type { GuardState } from "@/lib/hud";
import { hudReducer, initialHud, menuBarTitle, pillStatus } from "@/lib/hud";
import { hudMockScript } from "@/lib/hudMock";

// The Hermes HUD, shown by the Electron app in hermes/hud/. Live: follows the guard's event stream.
// /hud?mock=1 plays a scripted run instead. /hud?menubar=1 is the macOS menu bar mode: the menu bar
// item replaces the pill, and this page is the dropdown (block card, or recent activity).

const GUARD = (process.env.NEXT_PUBLIC_GUARD_BASE ?? "http://127.0.0.1:8100").replace(/\/$/, "");
const EVENTS = ["session_start", "observed", "checking", "allowed", "blocked", "sink_hit", "reset"];

// Set by the Electron shell's preload script so the window can grow when the pill expands.
declare global {
  interface Window {
    tribunalHud?: {
      setExpanded: (expanded: boolean) => void;
      setStatus?: (status: { title: string; tone: string; text: string }) => void;
    };
  }
}

export default function HudPage() {
  const [state, dispatch] = useReducer(hudReducer, initialHud);
  const [open, setOpen] = useState(false);
  // Read from the URL after hydration (false on the server), without a setState in an effect.
  const menubar = useSyncExternalStore(noSubscribe, isMenubarUrl, () => false);

  // A transparent page, so only the pill shows in the transparent window.
  useEffect(() => {
    document.documentElement.classList.add("hud");
    document.title = "Tribunal";
    return () => document.documentElement.classList.remove("hud");
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has("mock") ? playMock(dispatch) : followGuard(dispatch);
  }, []);

  const expanded = state.blocked !== null || state.sinkPreview !== null || open;
  useEffect(() => {
    window.tribunalHud?.setExpanded(expanded);
  }, [expanded]);

  // The menu bar item's text and color.
  const status = pillStatus(state);
  const title = menuBarTitle(state);
  useEffect(() => {
    window.tribunalHud?.setStatus?.({ title, tone: status.tone, text: status.text });
  }, [title, status.tone, status.text]);

  const dismiss = () => {
    dispatch({ type: "dismiss" });
    setOpen(false);
  };

  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-col gap-2 p-2">
      {!menubar && (
        <HudPill state={state} open={expanded} onToggle={() => (state.blocked ? dismiss() : setOpen((o) => !o))} />
      )}
      {state.sinkPreview !== null ? (
        <HudBreach preview={state.sinkPreview} onDismiss={dismiss} />
      ) : state.blocked ? (
        <HudBlockCard blocked={state.blocked} onDismiss={dismiss} />
      ) : open || menubar ? (
        <HudActivity state={state} />
      ) : null}
    </main>
  );
}

type Dispatch = (a: Parameters<typeof hudReducer>[1]) => void;

const noSubscribe = () => () => {};
const isMenubarUrl = () => new URLSearchParams(window.location.search).has("menubar");

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
