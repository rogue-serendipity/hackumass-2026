# Hackathon fit: HackUMass XIV

Everything needed to submit and pitch Shadow Agent Tribunal: deadlines, which prizes to enter, a paste-ready Devpost write-up, the demo and video scripts, and answers to the questions judges will ask.

## Deadlines (from hackumass.com, EST)

| When | What |
|---|---|
| **Sun Nov 15, 12:00 AM** | Initial submission deadline: the Devpost project must exist |
| **Sun Nov 15, 9:00 AM** | Final submission deadline: write-up, video, repo link done |
| Sun Nov 15, 12:30 PM | Judging (at least one team member must be present) |
| Sun Nov 15, 4:30 PM | Closing ceremony |

A human has to create the Devpost project; agents can't. It can be edited until 9 AM.

## Which prizes to enter

HackUMass lists 13 HackUMass categories plus sponsor and MLH prizes. A search summary said teams may tag only **one** HackUMass category; check this on the Devpost submission form. Sponsor and MLH prizes are entered separately.

| Prize | Fit | Why |
|---|---|---|
| **Best AI Security Hack** (HackUMass, cybersecurity) | **Enter (our one HackUMass category)** | Defends AI agents against prompt injection. The exact intersection the prize names. |
| Most Secure Hack (cybersecurity) | Strong alternative | Security product, but the prize may mean "built securely" rather than "security tool". |
| Most Impactful AI Hack (AI) | Alternative | Agents reading email is a real, growing risk. |
| **Best Use of Vultr** (MLH) | **Enter** | Every LLM call runs on Vultr Serverless Inference (three models across three roles), and the live site runs on a Vultr Cloud Compute instance. |
| **Best Agentic Hack** (Sentient OS) | **Enter** | Two tool-using agents plus an LLM Judge and a self-patching rule learner. |
| Best UI/UX | Possible | Only if T14 makes the run readable at a glance. |
| Grand prizes | Automatic | Every project is considered. |

Skip: MedTech, hardware, Analog Devices, Nessie, Solana, MongoDB, Gemini (we don't use them).

## What past winners had in common

From the HackUMass IX gallery (the newest one that isn't on Devpost, which blocks automated reading): a concrete, local problem; a demo video; a public GitHub repo; and visible use of sponsor tech, often winning a sponsor prize alongside a category prize. We have all four if we record the video: UMass-flavored scenarios (financial aid, ACM, Maple Ridge, Prof. Chen), a public repo, Vultr everywhere, and a live site.

HackUMass's only published judging text (Analog Devices track) asks teams to "show us how you built your project, including what you tried, what failed, and what you learned". Our challenges section below is built for exactly that.

---

## Devpost write-up (paste-ready)

**Tagline:** AI agents read your email. Attackers write your email. We catch the difference.

### Inspiration

AI assistants now read our inboxes and act on them: they reply, forward, pay and share. Anyone who can send you an email can try to give your assistant orders. Keyword filters and "is this malicious?" classifiers judge the *wording*, so a polite, ordinary-looking request from a lookalike address sails through. We wanted a defense that doesn't care how an attack is worded, only whether it **changed what the agent does**.

### What it does

Every task runs twice, at the same time:

- The **Worker** sees everything.
- The **Shadow** gets the same task and tools, but every external email body is replaced with "[Content withheld]". It can still see senders and subjects.

No sensitive action (send, forward, pay, share) runs immediately; both agents' actions are held. A **Judge** compares them:

1. **Plain code first:** anything the Worker wants to do that the Shadow didn't came from the hidden email content. Moving money or sharing a file with an address the user never mentioned is always blocked, no matter what any model says.
2. **Then an LLM verdict:** for the remaining differences, it decides whether they serve the user's request and quotes the **exact sentence** that caused the hijack, which the UI highlights.

After a block, the **Patcher** turns the attack into a rule. The next time a matching email arrives, the run is blocked instantly, before any agent reads it.

### How we built it

- **Backend:** Python, FastAPI, Server-Sent Events streaming both agents live, Pydantic.
- **Models, all on Vultr Serverless Inference** through its OpenAI-compatible API: `minimax-m3.1-flash` for the Worker and Shadow, `glm-5.3-flash` for the Judge and Patcher. We tested 7 models for tool calling and speed before choosing.
- **Frontend:** Next.js, TypeScript, Tailwind: side-by-side lanes, a Judge card with the culprit sentence highlighted, an editable inbox, a Metrics tab.
- **Deployment:** one Vultr Cloud Compute instance (Ubuntu 24.04) with Caddy, HTTPS, and systemd.
- **Scenarios:** 13 hand-written inboxes: 8 attacks (fake financial-aid office, spoofed club treasurer, lookalike landlord, hidden HTML instruction, 2FA-code leak, payee swap, payroll redirect, fake scholarship) and 5 benign cases that are easy to get wrong.
- **Team workflow:** two humans, each working only through their own AI coding agent. The agents coordinated through a pinned GitHub issue used as a message board, with file ownership rules and a shared API contract.

### Challenges we ran into

- **Our attacks didn't work.** Modern models ignored "assistants should forward…" injections completely. Seven models, five attacks, zero hijacks. We learned real attacks don't announce themselves: they look like ordinary admin email from a lookalike sender, sent to a user who asked their assistant to "take care of" the inbox.
- **The Shadow can be fooled too.** It can't read bodies, but it can see sender addresses. Asked to "pay Sam, he emailed the details", both agents paid the fake Sam's address, so they agreed and the run was approved. Same story for a 2FA leak: both emailed the attacker, but only the Worker's email contained the code. We changed the rule: agreement doesn't count when the destination is unknown and the content differs or money or files move.
- **The Judge was inconsistent** on a hidden-HTML attack where the agent's action half-matched the request. We added a policy: if the destination appears only in a stranger's email, block.
- **Our first Patcher rule flagged an innocent email.** The rule learned from the fake Sam also matched the real Sam (the attack copies his wording, and both use gmail.com). Rules now need an attacker-specific address or domain, and common mail domains never count.

### Accomplishments we're proud of

Measured with our eval script (2 runs of each of the 13 scenarios, the exact demo configuration, Nov 15 00:13 UTC):

- **16 of 16 attack runs hijacked the Worker, and all 16 were blocked.** Every one of the 8 attacks, both times.
- **9 of 10 benign runs approved.** The one block was on `requested_payment`; in earlier testing this was the Worker mistyping Sam's address (`roomate.sam@…`), which the hard rule caught.
- **About 13k tokens and 5.7 s (median) per protected run**, streamed live.
- The whole pipeline (two agents, Judge, Patcher, UI, deploy) was built in one weekend by two people working entirely through AI coding agents that coordinated with each other on a GitHub issue.

### What we learned

Detecting *influence* instead of *wording* works, but "what the agent could see" is never as clean as "trusted vs untrusted": metadata leaks attacker intent too. Strong models resist naive injections, and cheap, fast agent models are the ones that need protecting.

### What's next

Per-action culprit attribution, attachments and web pages as untrusted input, and a "confirm with user" outcome instead of a flat block.

### Built with

python, fastapi, pydantic, server-sent-events, vultr, vultr-serverless-inference, next.js, typescript, tailwind, caddy, ubuntu

### Links

- Live demo: https://45.63.19.56.sslip.io
- Code: https://github.com/rogue-serendipity/hackumass-2026

---

## 60-second demo (live)

1. **Hook:** "AI agents read your email. Attackers write your email." Run **`inbox_exfil`**: a fake financial-aid office asks the assistant to forward your bank statement.
2. The lanes animate. The Worker forwards the bank email; the Shadow, which never saw the body, doesn't. The red line points to the exact sentence. **BLOCK.**
3. **"We don't flag everything":** run **`requested_payment`** ("Pay Sam the $45…"). **APPROVE**, and $45 goes to Sam.
4. **Same request, different inbox:** run **`extra_payee_swap`**. A lookalike "Sam" with a new address. **BLOCK**, by a rule no model can override.
5. **Self-patching:** click Run on `inbox_exfil` again. "Auto-blocked by rule #1" instantly, without running the agents.
6. **Metrics tab:** hijack rate, detection rate on hijacks, benign false positives.

Before judging: click "Reset demo" (clears learned rules), and run each demo scenario once to warm up. Optional, only if a judge asks: "write your own attack". A typed attack only blocks if the Worker actually falls for it.

## Demo video (≈2 minutes, record before 9 AM)

1. 0:00–0:15: The problem, one sentence over the inbox view.
2. 0:15–0:50: `inbox_exfil` full run, pausing on the red line and highlighted sentence.
3. 0:50–1:15: `requested_payment` vs `extra_payee_swap`, side by side.
4. 1:15–1:35: Patcher: rerun, instant auto-block.
5. 1:35–1:50: Metrics tab.
6. 1:50–2:00: "Built on Vultr Serverless Inference and Vultr Cloud Compute." Live link.

## Judge Q&A

- **Why such a weak Worker model?** Cheap, fast models are what's actually deployed in agents, and they're the ones that get hijacked. With a robust model there's nothing to block: the tribunal approves. It doesn't depend on any one model.
- **Isn't the Shadow fooled too?** Yes, by sender addresses and subjects. That's why agreement doesn't count when the destination is unknown and content differs or money and files move. Then the hard rule and the Judge decide.
- **Isn't the Judge injectable?** Detection is plain code first; the hard rule doesn't use a model. The Judge only classifies a difference code already found, and its prompt treats email text as data.
- **What if the model is just random?** Temperature 0, and we measure a noise baseline (two identical Worker runs): two identical Worker runs disagree on 4 of 10 benign pairs, all in two scenarios (`extra_rsvp`, `requested_payment`) where the cheap model is inconsistent. That's why the Judge reviews every difference instead of blocking on difference alone: benign approval stays at 9/10.
- **What about tasks that need the email content?** `legit_reply` and `extra_rsvp`: the Judge approves differences that serve the request, from known contacts.
- **What does it cost?** About 13k tokens per protected run (≈10k in, 3k out) on Vultr's flash models, about 2–3× a single agent run. A Patcher auto-block costs 0 tokens.
- **False positives?** 1 of 10 benign runs in our eval, and that one was the agent mistyping a payee's address, which arguably should be stopped.
