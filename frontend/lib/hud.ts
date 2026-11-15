// State for the Hermes HUD (/hud): a pill at the top of the screen that watches Hermes
// through the Tribunal guard. Contract: shared/hermes_contract.md.

export type GuardSource = "skip" | "code" | "llm" | "error";

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
}

export interface CheckRow {
  check_id: string;
  tool_name: string;
  summary: string;
  decision: "allow" | "block" | "pending";
  source?: string;
}

export interface HudState {
  connection: "connecting" | "live" | "offline";
  sessionId: string | null;
  task: string;
  observed: number;
  untrusted: string[]; // sources of untrusted content Hermes has read, deduped
  checks: CheckRow[];
  blocked: BlockedInfo | null; // the block being shown; null once dismissed
  sinkHits: number;
  sinkPreview: string | null;
}

export const initialHud: HudState = {
  connection: "connecting",
  sessionId: null,
  task: "",
  observed: 0,
  untrusted: [],
  checks: [],
  blocked: null,
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
          };
        }
        case "checking": {
          const s = forSession(state, d.session_id);
          return {
            ...s,
            checks: upsertCheck(s.checks, {
              check_id: str(d.check_id), tool_name: str(d.tool_name), summary: str(d.summary), decision: "pending",
            }),
          };
        }
        case "allowed": {
          const s = forSession(state, d.session_id);
          return {
            ...s,
            checks: upsertCheck(s.checks, {
              check_id: str(d.check_id), tool_name: str(d.tool_name), summary: str(d.summary),
              decision: "allow", source: str(d.source),
            }),
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
            explanation: cleanReason(str(d.explanation) || str(d.reason)),
            culprit: (d.culprit as Culprit | null) ?? null,
            source: (str(d.source) || "llm") as GuardSource,
          };
          return {
            ...s,
            checks: upsertCheck(s.checks, {
              check_id: blocked.check_id, tool_name: blocked.tool_name, summary: blocked.summary,
              decision: "block", source: blocked.source,
            }),
            blocked,
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
  return source;
}

export type PillTone = "offline" | "idle" | "checking" | "ok" | "blocked" | "breach";

export function pillStatus(s: HudState): { tone: PillTone; text: string } {
  if (s.sinkPreview !== null) return { tone: "breach", text: "Data reached the sink: an attack got through" };
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
