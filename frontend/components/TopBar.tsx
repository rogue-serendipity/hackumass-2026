import { PlayIcon } from "@phosphor-icons/react";
import { Tag } from "./Tag";
import type { ScenarioSummary } from "@/lib/types";

export type Tab = "tribunal" | "metrics";

interface Props {
  tab: Tab;
  onTab: (tab: Tab) => void;
  scenarios: ScenarioSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRun: () => void;
  running: boolean;
  canRun: boolean;
  mock: boolean;
}

export function TopBar({
  tab,
  onTab,
  scenarios,
  selectedId,
  onSelect,
  onRun,
  running,
  canRun,
  mock,
}: Props) {
  const selected = scenarios.find((s) => s.id === selectedId);
  const groups = [
    { label: "Attacks", items: scenarios.filter((s) => s.category === "attack") },
    { label: "Benign", items: scenarios.filter((s) => s.category === "benign") },
  ];

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-ink">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-5 gap-y-3 px-6 py-3">
        <div className="mr-auto flex items-baseline gap-3">
          <h1 className="text-xl font-semibold tracking-tight">
            Shadow Agent Tribunal
          </h1>
          {mock && (
            <Tag tone="hollow">mock data</Tag>
          )}
        </div>

        <nav className="flex rounded-xs border border-line p-0.5 text-sm" aria-label="View">
          {(["tribunal", "metrics"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onTab(t)}
              aria-current={tab === t ? "page" : undefined}
              className={`rounded-xs px-3 py-1.5 font-medium capitalize transition-colors ${
                tab === t ? "bg-raised text-text" : "text-dim hover:text-text"
              }`}
            >
              {t}
            </button>
          ))}
        </nav>

        {tab === "tribunal" && (
          <div className="flex items-center gap-3">
            {selected && (
              <Tag tone={selected.category === "attack" ? "hollow" : "solid"}>
                {selected.category}
              </Tag>
            )}
            <label className="sr-only" htmlFor="scenario">
              Scenario
            </label>
            <select
              id="scenario"
              value={selectedId ?? ""}
              onChange={(e) => onSelect(e.target.value)}
              disabled={scenarios.length === 0}
              className="h-10 max-w-[22rem] rounded-xs border border-line bg-panel px-3 text-sm outline-none focus:border-worker disabled:opacity-50"
            >
              {scenarios.length === 0 && <option value="">No scenarios</option>}
              {groups.map(
                (g) =>
                  g.items.length > 0 && (
                    <optgroup key={g.label} label={g.label}>
                      {g.items.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.id} · {s.title}
                        </option>
                      ))}
                    </optgroup>
                  ),
              )}
            </select>
            <button
              type="button"
              onClick={onRun}
              disabled={!canRun || running}
              className="flex h-10 min-w-28 items-center justify-center gap-2 rounded-xs bg-worker px-5 text-sm font-semibold text-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {running ? (
                "Running…"
              ) : (
                <>
                  Run <PlayIcon weight="fill" aria-hidden />
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
