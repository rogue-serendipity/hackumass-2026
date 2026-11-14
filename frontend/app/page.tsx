"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { InboxEditor } from "@/components/InboxEditor";
import { JudgeCard } from "@/components/JudgeCard";
import { Lane } from "@/components/Lane";
import { Metrics } from "@/components/Metrics";
import { RequestBox } from "@/components/RequestBox";
import { LearnedRule, RulesList } from "@/components/Rules";
import { TopBar, type Tab } from "@/components/TopBar";
import {
  USE_MOCK,
  clearRules,
  getRules,
  getScenario,
  getScenarios,
  openRunStream,
  startRun,
} from "@/lib/api";
import {
  autoBlockedBy,
  deriveCardStatuses,
  initialRunState,
  phaseOf,
  runReducer,
} from "@/lib/runReducer";
import type { Email, Rule, Scenario, ScenarioSummary } from "@/lib/types";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function Home() {
  const [tab, setTab] = useState<Tab>("tribunal");
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [request, setRequest] = useState("");
  const [emails, setEmails] = useState<Email[]>([]);
  const [inboxOpen, setInboxOpen] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [run, dispatch] = useReducer(runReducer, initialRunState);
  const [rules, setRules] = useState<Rule[]>([]);
  const [clearingRules, setClearingRules] = useState(false);

  const closeStream = useRef<(() => void) | null>(null);
  // Bumped whenever the current run or scenario is superseded, so late async
  // results from the previous one are ignored.
  const generation = useRef(0);
  const lanes = useRef<HTMLDivElement>(null);
  const judge = useRef<HTMLDivElement>(null);

  const stopRun = useCallback(() => {
    generation.current++;
    closeStream.current?.();
    closeStream.current = null;
    dispatch({ type: "reset" });
  }, []);

  const selectScenario = useCallback(
    async (id: string) => {
      stopRun();
      const mine = generation.current;
      setSelectedId(id);
      try {
        const loaded = await getScenario(id);
        if (generation.current !== mine) return;
        setScenario(loaded);
        setRequest(loaded.user_request);
        setEmails(loaded.state.inbox);
        setInboxOpen(true);
        setLoadError(null);
      } catch (e) {
        if (generation.current !== mine) return;
        setScenario(null);
        setLoadError(message(e));
      }
    },
    [stopRun],
  );

  const loadScenarios = useCallback(async () => {
    try {
      const list = await getScenarios();
      setScenarios(list);
      setLoadError(null);
      if (list[0]) await selectScenario(list[0].id);
    } catch (e) {
      setLoadError(message(e));
    }
  }, [selectScenario]);

  // The rules list is a side panel: if the backend can't list them, just show none.
  const refreshRules = useCallback(async () => {
    try {
      setRules(await getRules());
    } catch {
      setRules([]);
    }
  }, []);

  async function forgetRules() {
    setClearingRules(true);
    try {
      await clearRules();
    } catch {
      // Refresh below shows whatever the backend still has.
    } finally {
      await refreshRules();
      setClearingRules(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch; state is set after the await
    void loadScenarios();
    void refreshRules();
    return () => closeStream.current?.();
  }, [loadScenarios, refreshRules]);

  // A finished run may have taught the Patcher a rule.
  const runDone = run.status === "done";
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch; state is set after the await
    if (runDone) void refreshRules();
  }, [runDone, refreshRules]);

  /** Back to a clean slate for the next person: no run, original request and inbox. */
  function resetDemo() {
    stopRun();
    void forgetRules();
    if (scenario) {
      setRequest(scenario.user_request);
      setEmails(scenario.state.inbox);
    }
    setInboxOpen(true);
    setTab("tribunal");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleRun() {
    if (!scenario || run.status === "running") return;
    stopRun();
    const mine = generation.current;
    dispatch({ type: "start", emails, at: Date.now() });
    setInboxOpen(false);
    requestAnimationFrame(() =>
      lanes.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
    try {
      const { run_id } = await startRun({
        scenario_id: scenario.id,
        // `emails` replaces the whole inbox, so always send all of them.
        overrides: { user_request: request, emails },
      });
      if (generation.current !== mine) return;
      closeStream.current = openRunStream(run_id, (ev) => {
        if (generation.current === mine) dispatch({ type: "event", ev, at: Date.now() });
      });
    } catch (e) {
      if (generation.current !== mine) return;
      dispatch({ type: "event", ev: { event: "error", data: { message: message(e) } } });
      dispatch({ type: "event", ev: { event: "end", data: {} } });
    }
  }

  // Bring the verdict into view when it lands, keeping the lanes above it.
  const hasVerdict = run.verdict !== null;
  useEffect(() => {
    if (hasVerdict) judge.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [hasVerdict]);

  const statuses = useMemo(
    () => deriveCardStatuses({ diff: run.diff, verdict: run.verdict, committed: run.committed }),
    [run.diff, run.verdict, run.committed],
  );
  const running = run.status === "running";
  const phase = phaseOf(run);
  const canRun = scenario !== null && request.trim() !== "";
  const skippedByRule = autoBlockedBy(run);

  return (
    <>
      <TopBar
        tab={tab}
        onTab={setTab}
        scenarios={scenarios}
        selectedId={selectedId}
        onSelect={selectScenario}
        onRun={handleRun}
        running={running}
        canRun={canRun}
        onReset={resetDemo}
        canReset={scenario !== null}
        mock={USE_MOCK}
      />

      <main className="mx-auto w-full max-w-[1500px] flex-1 px-6 py-5">
        {/* Both tabs stay mounted so an eval result survives switching away. */}
        <div hidden={tab !== "tribunal"} className="flex flex-col gap-4">
          {loadError && (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-3 rounded-xs border border-line bg-raised px-4 py-3 text-sm"
            >
              <span className="mr-auto">Couldn&apos;t load scenarios: {loadError}</span>
              <button
                type="button"
                onClick={loadScenarios}
                className="rounded-xs border border-line px-3 py-1 hover:bg-raised"
              >
                Retry
              </button>
            </div>
          )}

          <RequestBox
            value={request}
            onChange={setRequest}
            disabled={running || !scenario}
            userName={scenario?.state.user.name}
          />

          {scenario && (
            <InboxEditor
              emails={emails}
              original={scenario.state.inbox}
              onChange={setEmails}
              open={inboxOpen}
              onToggle={() => setInboxOpen((o) => !o)}
              disabled={running}
              userEmail={scenario.state.user.email}
            />
          )}

          <div ref={lanes} className="grid scroll-mt-20 gap-4 lg:grid-cols-2">
            <Lane
              lane="worker"
              steps={run.steps.worker}
              statuses={statuses}
              runStatus={run.status}
              done={run.laneDone.worker}
              startedAt={run.startedAt}
              doneAt={run.laneDoneAt.worker}
              skippedByRule={skippedByRule}
            />
            <Lane
              lane="shadow"
              steps={run.steps.shadow}
              statuses={statuses}
              runStatus={run.status}
              done={run.laneDone.shadow}
              startedAt={run.startedAt}
              doneAt={run.laneDoneAt.shadow}
              skippedByRule={skippedByRule}
            />
          </div>

          <div ref={judge} className="scroll-mb-4">
            <JudgeCard
              phase={phase}
              diff={run.diff}
              verdict={run.verdict}
              emails={run.sentEmails}
              run={run}
              onRetry={handleRun}
              canRetry={canRun}
            />
          </div>

          {run.ruleCreated && <LearnedRule rule={run.ruleCreated} />}
          <RulesList rules={rules} onClear={forgetRules} clearing={clearingRules} />
        </div>

        <div hidden={tab !== "metrics"}>
          <Metrics />
        </div>
      </main>
    </>
  );
}
