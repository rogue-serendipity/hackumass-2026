"use client";

import { useEffect, useState } from "react";

/**
 * Date.now(), re-read every `ms` while `active`, so elapsed timers tick.
 * Starts at 0 rather than reading the clock during render: the page is
 * prerendered at build time, and Next.js fails the build on Date.now() there.
 * Callers only use the value while `active`, by which point it has ticked.
 */
export function useNow(active: boolean, ms = 250): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, ms);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [active, ms]);
  return now;
}

/** "4s" under ten seconds shows one decimal only once finished: "5.8s". */
export function seconds(ms: number, precise = false): string {
  const s = Math.max(0, ms) / 1000;
  return precise ? `${s.toFixed(1)}s` : `${Math.floor(s)}s`;
}
