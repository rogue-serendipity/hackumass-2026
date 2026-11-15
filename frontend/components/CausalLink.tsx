"use client";

import { useEffect, useState } from "react";

interface Geometry {
  d: string;
  start: [number, number];
  end: [number, number];
  label: [number, number];
}

/** The red card the Judge blocked, and the highlighted culprit sentence. */
const FROM = '[data-divergent][data-decision="BLOCK"]';
const TO = "mark[data-culprit]";

/** Center of `el` if it's on screen and not scrolled out of its lane. */
function visibleBox(el: Element | null): DOMRect | null {
  if (!el) return null;
  const box = el.getBoundingClientRect();
  if (box.height === 0) return null;
  const cy = box.top + box.height / 2;
  const lane = el.closest("ol");
  if (lane) {
    const clip = lane.getBoundingClientRect();
    if (cy < clip.top || cy > clip.bottom) return null;
  }
  return cy > 0 && cy < window.innerHeight ? box : null;
}

function measure(): Geometry | null {
  const card = visibleBox(document.querySelector(FROM));
  const mark = document.querySelector(TO);
  // A quote can wrap: aim at its first line.
  const line = mark?.getClientRects()[0];
  if (!card || !line || !visibleBox(mark)) return null;

  const start: [number, number] = [card.right, card.top + card.height / 2];
  const end: [number, number] = [line.left, line.top + line.height / 2];
  // Leave the card sideways, arrive at the sentence from the left.
  const bend = Math.max(80, Math.abs(end[0] - start[0]) / 2);
  const c1: [number, number] = [start[0] + bend, start[1]];
  const c2: [number, number] = [end[0] - bend, end[1]];
  const d = `M ${start[0]} ${start[1]} C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${end[0]} ${end[1]}`;
  // Bezier midpoint (t = 0.5), for the label.
  const label: [number, number] = [
    (start[0] + 3 * c1[0] + 3 * c2[0] + end[0]) / 8,
    (start[1] + 3 * c1[1] + 3 * c2[1] + end[1]) / 8,
  ];
  return { d, start, end, label };
}

const same = (a: Geometry | null, b: Geometry | null) => a?.d === b?.d;

/**
 * After a BLOCK, draws a line from the Worker's blocked action to the sentence
 * that caused it: the cause and the effect, on screen at once. Follows both ends
 * through lane scrolling and page scrolling, and hides when either is off screen.
 */
export function CausalLink({ active }: { active: boolean }) {
  const [geo, setGeo] = useState<Geometry | null>(null);

  useEffect(() => {
    if (!active) return;
    let frame = 0;
    let last: Geometry | null = null;
    const tick = () => {
      const next = measure();
      if (!same(next, last)) setGeo((last = next));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      setGeo(null);
    };
  }, [active]);

  if (!active || !geo) return null;
  return (
    <svg aria-hidden className="pointer-events-none fixed inset-0 z-10 h-full w-full overflow-visible">
      <path d={geo.d} className="causal-glow" pathLength={1} />
      <path d={geo.d} className="causal-line" pathLength={1} />
      <circle cx={geo.start[0]} cy={geo.start[1]} r={5} className="causal-dot" />
      <circle cx={geo.end[0]} cy={geo.end[1]} r={5} className="causal-dot causal-dot-end" />
      <text x={geo.label[0]} y={geo.label[1] - 10} textAnchor="middle" className="causal-label">
        caused by this sentence
      </text>
    </svg>
  );
}
