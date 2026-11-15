"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { HudActivity, HudBreach, HudPill } from "@/components/hud/HudPill";
import { HudBlockCard } from "@/components/hud/HudBlockCard";
import { menuBarTitle, pillStatus } from "@/lib/hud";
import { decideCheck, useHud } from "@/lib/useHud";

// The Hermes HUD, shown by the Electron app in hermes/hud/. Live: follows the guard's event stream.
// /hud?mock=1 plays a scripted run instead. /hud?menubar=1 is the macOS menu bar mode: the menu bar
// item replaces the pill, and this page is the dropdown (block card, or recent activity).


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
  const [state, dispatch] = useHud();
  const [open, setOpen] = useState(false);
  // Read from the URL after hydration (false on the server), without a setState in an effect.
  const menubar = useSyncExternalStore(noSubscribe, isMenubarUrl, () => false);

  // A transparent page, so only the pill shows in the transparent window.
  useEffect(() => {
    document.documentElement.classList.add("hud");
    document.title = "Tribunal";
    return () => document.documentElement.classList.remove("hud");
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
        <HudBlockCard
          blocked={state.blocked}
          onDismiss={dismiss}
          onDecide={(d, remember) =>
            state.blocked && decideCheck(dispatch, state.sessionId, state.blocked.check_id, d, remember)
          }
        />
      ) : open || menubar ? (
        <HudActivity state={state} />
      ) : null}
    </main>
  );
}

const noSubscribe = () => () => {};
const isMenubarUrl = () => new URLSearchParams(window.location.search).has("menubar");
