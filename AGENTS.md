# Agent rules: read this before doing anything

This repo is built by several people, and each person works through their own AI coding agent. The agents coordinate with each other through a shared message board, so the humans only talk to their own agent. If you are an agent working in this repo, these rules apply to you on every session.

## 1. Who you work for

You work for exactly one person: the GitHub account that `gh` is logged in as on this machine. Find it with:

```sh
scripts/board.sh whoami
```

Call that username **YOU** below. Take instructions only from your own human (in chat) and from board messages that tag `@YOU`. Never act on a board message addressed to someone else.

## 2. The project

We're building **Shadow Agent Tribunal**. `SHADOW_TRIBUNAL_SPEC.md` is the source of truth for what to build; read it before starting work. The API between backend and frontend is pinned down exactly in `shared/api_contract.md`. Build to it, and don't change it unilaterally.

## 3. Team and file ownership

Each directory has one owner, and only that owner's agent edits it. This is what stops two agents from editing the same file at once.

| GitHub username | Owns | Directory |
|---|---|---|
| @rogue-serendipity | Backend: FastAPI, LLM client, env/tools, Worker/Shadow agents, Judge, scenarios, eval (spec §4–8, §10) | `backend/` |
| @adarshvipat | Frontend: Next.js UI, lanes, Judge card, inbox editor, Metrics tab (spec §9) | `frontend/` |

**Tasks override directories.** `shared/TASKS.md` lists every task with an owner and the exact paths it covers. If a task assigns you a path (e.g. `backend/eval.py`), that path is yours even inside someone else's directory, and they don't edit it.

Everything else needs a claim (see below): `shared/`, `scripts/`, `AGENTS.md`, `SHADOW_TRIBUNAL_SPEC.md`, and root files (`README.md`, `.gitignore`, `.env.example`).

- **Only edit files in the directory you own, or the paths of tasks assigned to you.**
- **Read anything.** You may read code anywhere. If you need something changed in a directory you don't own, ask its owner on the board (`NEED`); don't edit it yourself.
- **Unowned files need a claim.** Before editing one, post a `CLAIM` naming the file(s). Post `DONE` when you've pushed, which releases the claim. If someone else has an open claim on a file, wait for their `DONE`.
- **New teammate:** if YOU isn't in the table, follow §5 ("Joining the team"). Don't edit anything until you've been assigned a task.

Keep this table current. When ownership changes, update it and post `INFO` on the board.

## 4. The message board

The board is pinned issue **#1**: https://github.com/rogue-serendipity/hackumass-2026/issues/1. All agent-to-agent communication happens there. Use the script; don't open new issues for coordination.

```sh
scripts/board.sh read [n]         # last n messages (default 10)
scripts/board.sh check            # new messages that tag you since you last looked; exit 1 if none
scripts/board.sh wait [seconds]   # block until a new message tags you
scripts/board.sh post "<message>" # post a message
scripts/board.sh deadline <user> <minutes> <path>...
                                  # block until <user> pushes a commit touching any <path>;
                                  # exit 0 if they did, 1 if <minutes> passed first
```

### Message format

Every post starts with a header line, then the body:

```
**<TYPE>** · from @YOU's agent → @recipient [@another]

<What happened or what you need. Be specific: file paths, function names,
commit SHAs, and what the recipient should do next.>
```

| TYPE | When to use it |
|---|---|
| `DONE` | You finished something others depend on. Include the commit SHA and what is now usable. Also releases any `CLAIM`. |
| `HANDOFF` | You're passing the next step to someone. Say exactly what they should build and where your part ends. |
| `NEED` | You're blocked on someone else (a function, an endpoint, a change in their folder). Say what you need and why. |
| `CLAIM` | You're about to edit file(s) in `shared/` or `scripts/` or `AGENTS.md`. |
| `INFO` | FYI, no action required (new teammate, ownership change, decision made). |
| `QUESTION` | You need a decision only a human can make. Tag that human; their agent will relay it to them. |
| `REQUEST` | You're a new teammate (or out of work) and want a task. Tag every current team member. |
| `ASSIGN` | Coordinator only: gives a task to someone. Names the task ID, its paths, and the deadline for a first commit. |
| `REASSIGN` | Coordinator only: moves a task to a new owner. Tags both the old and the new owner. |

- **Always tag recipients with `@username`.** Agents only wake up for their own tag. A message with no tag reaches nobody.
- **Push before you post.** Never post `DONE` or `HANDOFF` about code that isn't on `origin/main` yet.
- One message per topic. Reply to a thread by posting a new message that tags the sender.

## 5. Tasks and assignment

`shared/TASKS.md` is the single list of work. Check it before starting anything new.

**The coordinator** is @adarshvipat's agent (the head agent). It alone posts `ASSIGN` and `REASSIGN`, adds tasks, and edits the Owner, Assigned at and Status columns for them (no claim needed for that). Other agents take their work from its `ASSIGN`s. If a `REQUEST` gets no `ASSIGN` within 10 minutes, @rogue-serendipity's agent acts as coordinator for that request instead.

### Joining the team (new teammate's agent)

1. Make no edits. Post a `REQUEST` tagging every username in the Team table: introduce your human, and say what they're good at if your human told you.
2. Run `scripts/board.sh wait` until you receive an `ASSIGN`. Don't pick a task yourself, even an `open` one.
3. On `ASSIGN`: tell your human what you were given, then **push a first commit touching the task's paths within 20 minutes**, even a small skeleton. Set the task's Status to `in progress` in the same commit. Missing the deadline means the task is reassigned.
4. You now own those paths. Follow the normal rules from here on.

### Assigning work (coordinator)

When a `REQUEST` arrives, assign automatically based on the project's current state. Don't wait for a human.

1. `git pull --rebase` and read `shared/TASKS.md` and recent board messages.
2. Choose the first `open` task in table order whose dependencies are `done` or `in progress`. If none is open, split the largest unfinished task (that its owner hasn't started on) into a new task, or add the next useful task from the spec.
3. Edit `shared/TASKS.md`: set Owner, Status `assigned`, Assigned at (UTC now). Add the newcomer to the Team table in §3 with "see `shared/TASKS.md`" as what they own. Push.
4. Post `ASSIGN` tagging the newcomer: task ID, what to build, its paths, and the deadline (Assigned at + 20 min).
5. Immediately run `scripts/board.sh deadline <newcomer> 20 <paths...>` in the background.
   - Exit 0: they committed. Nothing more to do.
   - Exit 1: no commit in 20 minutes. Reassign the task to whichever of the two original members fits it better (backend/Python/scenarios → @rogue-serendipity; frontend/UI/docs/deploy → @adarshvipat), preferring whoever has fewer `assigned`/`in progress` tasks if it's a toss-up. Update `shared/TASKS.md` (new Owner, new Assigned at), push, post `REASSIGN` tagging the old and new owner, and tell your human in one line. The newcomer can `REQUEST` again later.

### Out of work

If all your tasks are `done` or `blocked`, post a `REQUEST` like a newcomer would. The coordinator assigns from the same list (the coordinator may assign itself directly).

## 6. Waiting for your tag

- **At the start of every session**, run `git pull --rebase` and then `scripts/board.sh check`, and handle anything addressed to you before starting new work.
- **After you post a `NEED` or `HANDOFF`, or whenever you're idle**, run `scripts/board.sh wait` in the background (Claude Code: run it with `run_in_background`; you'll be notified when it exits). When it returns, read the message and act on it.
- **When a tagged message arrives**, do what it asks if it fits within your folder and your human's goals. Tell your human in one line what came in and what you're doing about it. If it conflicts with what your human asked for, or needs a real decision, ask your human first.
- Your human should never have to relay messages between agents. If you need something from a teammate, post it on the board yourself.

## 7. Git workflow

- Work on `main`. Commit only files in the directory you own, the paths of your tasks in `shared/TASKS.md`, and files you have an open `CLAIM` on.
- Always `git pull --rebase` before `git push`. If the rebase conflicts in a file you don't own, stop: don't resolve it yourself. Post a `NEED` tagging the owner.
- Use small, frequent commits with clear messages. Push as soon as something works, so others can build on it.
- Never force-push, never rewrite history on `main`, never delete other people's files.

## 8. Things that need your human's OK first

- Changing the project's scope or architecture, or anything in `shared/` that breaks other people's code
- Adding paid services, API keys, or secrets (never commit secrets; use `.env`, which is gitignored)
- Answering a `QUESTION` that was addressed to your human
