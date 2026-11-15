// State for the Hermes HUD (/hud): a pill at the top of the screen that watches Hermes
// through the Tribunal guard. Contract: shared/hermes_contract.md.

export type GuardSource = "skip" | "code" | "llm" | "error" | "user" | "tamper";

export interface Culprit {
  source: string;
  observation_id: string;
  quote: string | null;
}

export interface BlockedInfo {
  check_id: string;
  tool_name: string;
  summary: string;
  shadow_summary: string | null;
  reason: string;
  explanation: string;
  culprit: Culprit | null;
  source: GuardSource;
  // Hold-and-ask (H12): the guard is waiting for the user's Block / Allow once until decideBy (epoch ms).
  awaitingUser: boolean;
  decideBy: number | null;
  userDecision: { decision: "allow" | "block"; by: "user" | "timeout"; remember?: boolean } | null;
  remembered: boolean; // blocked automatically because the user chose "Don't ask again" earlier
}

export interface CheckRow {
  check_id: string;
  tool_name: string;
  summary: string;
  decision: "allow" | "block" | "pending";
  source?: string;
  remembered?: boolean; // decided by an earlier "Don't ask again"
}

export interface HudState {
  connection: "connecting" | "live" | "offline";
  sessionId: string | null;
  task: string;
  observed: number;
  untrusted: string[]; // sources of untrusted content Hermes has read, deduped
  checks: CheckRow[];
  blocked: BlockedInfo | null; // the block being shown; null once dismissed
  blocks: Record<string, BlockedInfo>; // every block this session, by check_id (the live feed shows them all)
  timeline: TimelineItem[]; // what Hermes read and tried, in order
  sinkHits: number;
  sinkPreview: string | null;
}

export type TimelineItem =
  | { kind: "observed"; observation_id: string; tool_name: string; source: string; trusted: boolean }
  | { kind: "check"; check_id: string };

export const initialHud: HudState = {
  connection: "connecting",
  sessionId: null,
  task: "",
  observed: 0,
  untrusted: [],
  checks: [],
  blocked: null,
  blocks: {},
  timeline: [],
  sinkHits: 0,
  sinkPreview: null,
};

// The snapshot from GET /hermes/state.
export interface GuardState {
  sessions: {
    session_id: string;
    task: string;
    observations: { observation_id: string; tool_name: string; source: string; trusted: boolean }[];
    checks: {
      check_id: string;
      tool_name: string;
      summary: string;
      decision: "allow" | "block" | "pending";
      source: string;
      reason?: string;
      culprit?: Culprit | null;
    }[];
  }[];
  sink_hits: number;
}

export type HudAction =
  | { type: "connection"; value: HudState["connection"] }
  | { type: "snapshot"; state: GuardState }
  | { type: "event"; event: string; data: Record<string, unknown> }
  | { type: "dismiss" };

const str = (v: unknown): string => (typeof v === "string" ? v : "");

function addUntrusted(list: string[], source: string): string[] {
  return list.includes(source) ? list : [...list, source];
}

function upsertCheck(checks: CheckRow[], row: CheckRow): CheckRow[] {
  const i = checks.findIndex((c) => c.check_id === row.check_id);
  if (i === -1) return [...checks, row];
  const next = checks.slice();
  next[i] = { ...next[i], ...row };
  return next;
}

function withCheckInTimeline(s: HudState, checkId: string): TimelineItem[] {
  return s.timeline.some((t) => t.kind === "check" && t.check_id === checkId)
    ? s.timeline
    : [...s.timeline, { kind: "check", check_id: checkId }];
}

/** Follow the newest session: an event from a new session starts a fresh pill. */
function forSession(state: HudState, sessionId: unknown): HudState {
  const id = str(sessionId);
  if (!id || id === state.sessionId) return state;
  return { ...initialHud, connection: state.connection, sinkHits: state.sinkHits, sinkPreview: state.sinkPreview, sessionId: id };
}

export function hudReducer(state: HudState, action: HudAction): HudState {
  switch (action.type) {
    case "connection":
      return { ...state, connection: action.value };
    case "dismiss":
      return { ...state, blocked: null, sinkPreview: null };
    case "snapshot": {
      const s = action.state.sessions.at(-1);
      const base: HudState = { ...initialHud, connection: state.connection, sinkHits: action.state.sink_hits };
      if (!s) return base;
      const untrusted = s.observations.filter((o) => !o.trusted).map((o) => o.source);
      return {
        ...base,
        sessionId: s.session_id,
        task: s.task,
        observed: s.observations.length,
        untrusted: [...new Set(untrusted)],
        checks: s.checks.map(({ check_id, tool_name, summary, decision, source }) => ({
          check_id, tool_name, summary, decision, source,
        })),
        blocks: Object.fromEntries(
          s.checks
            .filter((c) => c.decision === "block")
            .map((c) => [c.check_id, {
              check_id: c.check_id, tool_name: c.tool_name, summary: c.summary, shadow_summary: null,
              reason: cleanReason(c.reason ?? ""), explanation: cleanReason(c.reason ?? ""),
              culprit: c.culprit ?? null, source: (c.source || "llm") as GuardSource,
              awaitingUser: false, decideBy: null, userDecision: null, remembered: false,
            }]),
        ),
        // The snapshot doesn't keep the interleaving, so show reads first, then checks.
        timeline: [
          ...s.observations.map((o) => ({ kind: "observed" as const, ...o })),
          ...s.checks.map((c) => ({ kind: "check" as const, check_id: c.check_id })),
        ],
        // Don't re-open an old block on reload; the stream shows new ones.
        blocked: null,
      };
    }
    case "event": {
      const d = action.data;
      switch (action.event) {
        case "reset":
          return { ...initialHud, connection: state.connection };
        case "session_start": {
          const next = { ...initialHud, connection: state.connection, sinkHits: state.sinkHits, sessionId: str(d.session_id) };
          return { ...next, task: str(d.task) };
        }
        case "observed": {
          const s = forSession(state, d.session_id);
          return {
            ...s,
            observed: s.observed + 1,
            untrusted: d.trusted ? s.untrusted : addUntrusted(s.untrusted, str(d.source)),
            timeline: [...s.timeline, {
              kind: "observed", observation_id: str(d.observation_id), tool_name: str(d.tool_name),
              source: str(d.source), trusted: Boolean(d.trusted),
            }],
          };
        }
        case "checking": {
          const s = forSession(state, d.session_id);
          return {
            ...s,
            checks: upsertCheck(s.checks, {
              check_id: str(d.check_id), tool_name: str(d.tool_name), summary: str(d.summary), decision: "pending",
            }),
            timeline: withCheckInTimeline(s, str(d.check_id)),
          };
        }
        case "allowed": {
          const s = forSession(state, d.session_id);
          return {
            ...s,
            checks: upsertCheck(s.checks, {
              check_id: str(d.check_id), tool_name: str(d.tool_name), summary: str(d.summary),
              decision: "allow", source: str(d.source), remembered: Boolean(d.remembered),
            }),
            timeline: withCheckInTimeline(s, str(d.check_id)),
          };
        }
        case "blocked": {
          const s = forSession(state, d.session_id);
          const blocked: BlockedInfo = {
            check_id: str(d.check_id),
            tool_name: str(d.tool_name),
            summary: str(d.summary),
            shadow_summary: typeof d.shadow_summary === "string" ? d.shadow_summary : null,
            reason: cleanReason(str(d.reason)),
            // The footer already says "You chose to always block this action", so don't repeat it here.
            explanation: cleanReason(str(d.explanation) || str(d.reason)).replace(/^You chose to always block this action\.\s*/, ""),
            culprit: (d.culprit as Culprit | null) ?? null,
            source: (str(d.source) || "llm") as GuardSource,
            awaitingUser: Boolean(d.awaiting_user),
            decideBy: typeof d.decide_by === "number" ? d.decide_by : null,
            userDecision: null,
            remembered: Boolean(d.remembered),
          };
          return {
            ...s,
            checks: upsertCheck(s.checks, {
              check_id: blocked.check_id, tool_name: blocked.tool_name, summary: blocked.summary,
              decision: "block", source: blocked.source,
            }),
            blocked,
            blocks: { ...s.blocks, [blocked.check_id]: blocked },
            timeline: withCheckInTimeline(s, blocked.check_id),
          };
        }
        case "decided": {
          const s = forSession(state, d.session_id);
          const id = str(d.check_id);
          const prev = s.blocks[id];
          if (!prev || prev.userDecision) return s; // first decision wins
          const userDecision = {
            decision: d.decision === "allow" ? "allow" : "block",
            by: d.by === "user" ? "user" : "timeout",
            remember: Boolean(d.remember),
          } as const;
          const updated: BlockedInfo = { ...prev, awaitingUser: false, userDecision };
          return {
            ...s,
            blocks: { ...s.blocks, [id]: updated },
            blocked: s.blocked?.check_id === id ? updated : s.blocked,
            checks: userDecision.decision === "allow"
              ? upsertCheck(s.checks, { check_id: id, tool_name: prev.tool_name, summary: prev.summary, decision: "allow", source: "user" })
              : s.checks,
          };
        }
        case "sink_hit":
          return { ...state, sinkHits: state.sinkHits + 1, sinkPreview: str(d.preview) || "(empty)" };
        default:
          return state;
      }
    }
  }
}

/** The guard tells Hermes not to retry; that line is for Hermes, not for people. */
export function cleanReason(reason: string): string {
  return reason.replace(/\s*Do not retry this action[^.]*\.\s*$/i, "").trim();
}

/** "file:/Users/me/tribunal-demo/weather-cli/README.md" → "README.md"; "web:https://x.com/a" → "x.com/a". */
export function sourceLabel(source: string): string {
  const [kind, ...rest] = source.split(":");
  const value = rest.join(":");
  if (kind === "file") return value.split("/").filter(Boolean).at(-1) ?? value;
  if (kind === "web") return value.replace(/^https?:\/\//, "");
  if (kind === "terminal") return `output of \`${value}\``;
  if (kind === "tool") return value;
  if (kind === "email") {
    const from = value.split(" from ")[1];
    return from ? `email from ${from}` : `email ${value}`;
  }
  return source;
}

export type PillTone = "offline" | "idle" | "checking" | "ok" | "blocked" | "breach";

export function pillStatus(s: HudState): { tone: PillTone; text: string } {
  if (s.sinkPreview !== null) return { tone: "breach", text: "Data reached the sink: an attack got through" };
  if (s.blocked?.awaitingUser) return { tone: "blocked", text: `Held: ${s.blocked.summary} (allow once or block?)` };
  if (s.blocked?.userDecision?.decision === "allow") return { tone: "ok", text: `You allowed once: ${s.blocked.summary}` };
  if (s.blocked) return { tone: "blocked", text: `Blocked: ${s.blocked.summary}` };
  if (s.connection === "offline") return { tone: "offline", text: "Tribunal offline: Hermes actions are held" };
  if (s.connection === "connecting") return { tone: "offline", text: "Connecting to the Tribunal…" };
  const pending = s.checks.find((c) => c.decision === "pending");
  if (pending) return { tone: "checking", text: `Checking ${pending.summary}` };
  const done = s.checks.filter((c) => c.decision !== "pending").length;
  const blocks = s.checks.filter((c) => c.decision === "block").length;
  if (!s.sessionId) return { tone: "idle", text: "Tribunal watching Hermes" };
  const parts = [`${done} action${done === 1 ? "" : "s"} checked`];
  if (blocks) parts.push(`${blocks} blocked`);
  if (s.untrusted.length) parts.push(`${s.untrusted.length} untrusted source${s.untrusted.length === 1 ? "" : "s"} read`);
  return { tone: blocks ? "blocked" : "ok", text: parts.join(" · ") };
}

/** The short text beside the menu bar icon (macOS hides items that would fall behind the notch, so keep it tiny). */
export function menuBarTitle(s: HudState): string {
  const { tone } = pillStatus(s);
  if (tone === "breach") return "Leak!";
  if (s.blocked?.awaitingUser) return "Allow?";
  if (tone === "blocked" && s.blocked) return "Blocked";
  if (tone === "offline") return s.connection === "connecting" ? "…" : "Off";
  if (tone === "checking") return "Checking…";
  const done = s.checks.filter((c) => c.decision !== "pending").length;
  const blocks = s.checks.filter((c) => c.decision === "block").length;
  if (blocks) return `✓ ${done - blocks} · ✕ ${blocks}`;
  return done ? `✓ ${done}` : "";
}
