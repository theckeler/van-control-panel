---
name: van-case-study
description: Keep the Van Control Panel case study up to date. Append a session entry to case-study/log.md, record decisions, capture before and after screenshots and numbers. Use at the end of every working session, when a notable decision or result happens, or when Todd asks for case study material or a draft.
---

# Van Control Panel case study

Read first: `case-study/README.md` (the angle and the publishing rules), then the latest entry in `case-study/log.md` and the Proposed rows in `case-study/decisions.md`.

## Timing
Hold the log, decisions and doc updates while work is in progress. When Todd says to PR, or asks to doc something, write them and include them in that commit. Todd decides when anything is committed.

## At the end of every session
Append one entry to `case-study/log.md`, newest last, in this shape:

```
## YYYY-MM-DD: Session N, short title

**Asked for:** what Todd wanted, in his words where possible.

**Done**
- ...

**Found**
- things that surprised us, or that were wrong. Say "first guess" when a diagnosis wasn't confirmed.

**Not checked**
- what was not verified, and why. Hardware-only behavior goes here.

**Next:** ...
```

Bump `**Last updated:**` at the top of the file.

## Decisions
Every decision Todd and Claude discuss goes in `case-study/decisions.md`, including tooling and workflow choices, not only design. One row: date, decision, options considered, why, status.
- **Agreed (Todd)** only when Todd said it. Quote or paraphrase his words in "Why" when that's the evidence.
- **Proposed** for Claude's own calls and for anything Todd only partly said.
- **Superseded** when a later row replaces it. Say by what.
- If a doc and the table disagree, the table wins; fix the doc and tell Todd.
- In the drift pass before a PR, sweep for built work still marked Proposed and ask Todd.

## Before and after
- `case-study/baseline.md` is frozen. Never overwrite it. Add a dated file such as `results-2026-12-01.md` using the same measures and screenshot names.
- Screenshots: demo mode only, 375px and 1280px, 2x, saved under `case-study/assets/before-<date>/` or `after-<date>/` with matching file names.
- Numbers come with how they were measured. Hardware or Pi-side numbers (Lighthouse on the real Pi, phone latency) are taken by Todd or marked as not measured.
- Say which things were measured before claiming a change.

## Privacy
Nothing is cleared for publishing until Todd says so in `case-study/README.md`. Keep out of every entry: the van's location and routes, Tailscale addresses and hostnames, WiFi network names and passwords, API keys, camera frames and the photos folder. Link to a source file instead of copying a sensitive value.

## What makes a good entry
The case study is about the workspace as much as the app. Capture:
- where a guardrail, skill or doc changed what happened (or failed to);
- what Claude got wrong and what showed it (the playbook's "treat a diagnosis as a guess" lesson);
- time and effort, roughly, for the redo compared with building the original screens;
- what Todd changed by hand after review, and what that says about the conventions.

## Also feed the playbook
If something here is a lesson that carries to other projects, add it as a row to `Ai-Workspace-Playbook/playbook/client-onboarding.md` (Lessons table) as Proposed, with where it came from. That repo is edited on `main`, uncommitted, like this one.
