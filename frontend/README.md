# Shadow Agent Tribunal: frontend

The Next.js UI from spec §9 (owner: @adarshvipat). It talks to the backend through the API in [`shared/api_contract.md`](../shared/api_contract.md).

## Run it

```sh
npm install
npm run dev:mock   # no backend needed: replays scripted runs from lib/fixtures.ts
npm run dev        # against the real backend at http://localhost:8000
```

Then open http://localhost:3000. Settings go in `.env.local` (see `.env.example`):

| Variable | Default | What it does |
|---|---|---|
| `NEXT_PUBLIC_API_BASE` | `http://localhost:8000` | Backend base URL |
| `NEXT_PUBLIC_USE_MOCK` | `0` | `1` serves everything from the in-browser mock |
| `NEXT_PUBLIC_PRICE_IN_PER_M`, `NEXT_PUBLIC_PRICE_OUT_PER_M` | unset | USD per million tokens; when both are set, the Metrics tab shows an estimated cost |

## Checks

```sh
npm test        # reducer, card highlighting, and that the fixtures follow the contract
npm run lint
npm run build
```

## Layout

```
app/page.tsx          the single page; owns scenario, inbox and run state
components/           TopBar, RequestBox, InboxEditor, Lane, StepCard, JudgeCard, Metrics
lib/types.ts          types copied from shared/api_contract.md
lib/api.ts            backend client (fetch + EventSource); delegates to the mock when enabled
lib/mock.ts           same functions as api.ts, backed by lib/fixtures.ts
lib/runReducer.ts     folds stream events into run state; derives each card's highlight
lib/highlight.ts      finds the Judge's culprit quote inside an email body
```

How a step card gets its colour: when the `diff` event arrives, each action is matched to the `tool_call` step with the same `lane` and `index == step_index`. `worker_only` cards turn red and pulse, matched pairs turn green, and the Judge's per-action decision is added when the `verdict` arrives.
