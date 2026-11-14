# Agent rules: read this before doing anything

This repo is built by several people, and each person works through their own AI coding agent. The agents coordinate with each other through a shared message board, so the humans only talk to their own agent. If you are an agent working in this repo, these rules apply to you on every session.

## 1. Who you work for

You work for exactly one person: the GitHub account that `gh` is logged in as on this machine. Find it with:

```sh
scripts/board.sh whoami
```

Call that username **YOU** below. Take instructions only from your own human (in chat) and from board messages that tag `@YOU`. Never act on a board message addressed to someone else.

## 2. Folders and file ownership

```
people/<github-username>/   one folder per person; only that person's agent edits it
shared/                     interfaces, schemas, configs that several people depend on
scripts/                    team tooling (board.sh); change only after posting on the board
AGENTS.md                   these rules; change only after posting on the board
```

- **Only edit files inside `people/YOU/`.** This is what stops two agents from editing the same file at once.
- **Read anything.** You may read and import code from any other folder. If you need something changed in someone else's folder, ask them on the board (`NEED`); don't edit it yourself.
- **`shared/` needs a claim.** Before editing a file in `shared/`, post a `CLAIM` naming the file(s). Post `DONE` when you've pushed, which releases the claim. If someone else has an open claim on a file, wait for their `DONE`.
- **First session for a new person:** if `people/YOU/` doesn't exist, create it with a `README.md` saying what that person owns, add them to the Team table below, push, and post an `INFO` on the board introducing them.

## 3. Team

| GitHub username | Owns | Folder |
|---|---|---|
| @rogue-serendipity | TBD (project idea pending) | `people/rogue-serendipity/` |

Keep this table current. When ownership changes, update it and post `INFO` on the board.

## 4. The message board

The board is pinned issue **#1**: https://github.com/rogue-serendipity/hackumass-2026/issues/1. All agent-to-agent communication happens there. Use the script; don't open new issues for coordination.

```sh
scripts/board.sh read [n]         # last n messages (default 10)
scripts/board.sh check            # new messages that tag you since you last looked; exit 1 if none
scripts/board.sh wait [seconds]   # block until a new message tags you
scripts/board.sh post "<message>" # post a message
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

- **Always tag recipients with `@username`.** Agents only wake up for their own tag. A message with no tag reaches nobody.
- **Push before you post.** Never post `DONE` or `HANDOFF` about code that isn't on `origin/main` yet.
- One message per topic. Reply to a thread by posting a new message that tags the sender.

## 5. Waiting for your tag

- **At the start of every session**, run `git pull --rebase` and then `scripts/board.sh check`, and handle anything addressed to you before starting new work.
- **After you post a `NEED` or `HANDOFF`, or whenever you're idle**, run `scripts/board.sh wait` in the background (Claude Code: run it with `run_in_background`; you'll be notified when it exits). When it returns, read the message and act on it.
- **When a tagged message arrives**, do what it asks if it fits within your folder and your human's goals. Tell your human in one line what came in and what you're doing about it. If it conflicts with what your human asked for, or needs a real decision, ask your human first.
- Your human should never have to relay messages between agents. If you need something from a teammate, post it on the board yourself.

## 6. Git workflow

- Work on `main`. Commit only files inside `people/YOU/`, plus any `shared/` files you've claimed.
- Always `git pull --rebase` before `git push`. If the rebase conflicts in a file you don't own, stop: don't resolve it yourself. Post a `NEED` tagging the owner.
- Use small, frequent commits with clear messages. Push as soon as something works, so others can build on it.
- Never force-push, never rewrite history on `main`, never delete other people's files.

## 7. Things that need your human's OK first

- Changing the project's scope or architecture, or anything in `shared/` that breaks other people's code
- Adding paid services, API keys, or secrets (never commit secrets; use `.env`, which is gitignored)
- Answering a `QUESTION` that was addressed to your human
