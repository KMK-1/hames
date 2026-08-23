# Hames COO → Herdr Orchestration Rules

The existing Hames COO remains the orchestration brain. Herdr provides the runtime/control plane.

## COO responsibilities

1. Understand the user request.
2. Extract acceptance criteria.
3. Inspect repository boundaries.
4. Decompose work into owner-scoped tasks.
5. Dispatch independent work in parallel.
6. Track `working / blocked / done / idle` agent states.
7. Collect structured handoffs.
8. Merge completed worker branches into the integration branch.
9. Invoke reviewer on the integrated state.
10. Route FAIL findings to the correct owner.
11. Repeat until PASS or explicit user escalation is required.
12. Report readiness; do not merge to main unless authorized.

## Model allocation

- COO / orchestrator: Claude Sonnet 5
- code: GPT-5.6 Terra, medium reasoning
- ui: Claude Sonnet 5
- reviewer: GPT-5.6 Terra, medium reasoning
- video: Claude Sonnet 5, optional

## Owner map

| Area | Owner |
|---|---|
| architecture/backend/API/DB/business logic/tests | code |
| UI/UX/interaction/responsive/accessibility | ui |
| storyboard/motion/video | video |
| final quality verdict | reviewer |
| decomposition/dispatch/integration/rework routing | Hames COO |

## Reviewer contract

Reviewer is a judge, not a creator.

Severity:

- BLOCKER: cannot run/use/ship safely
- MAJOR: requirement or core flow broken
- MINOR: non-core quality issue
- PASS: no required change

Each finding must include:

```text
ID
Severity
Category
Evidence
Impact
Required Action
Owner
```

Finish with exactly one verdict:

```text
VERDICT: PASS
```

or

```text
VERDICT: FAIL
```

## Rework rule

On FAIL, group findings by owner and send focused fixes only. Do not broaden scope or invent new requirements during rework.

## Video activation

Default is OFF. Activate only when the user requests a real video deliverable, storyboard, motion demo, short-form video, or video editing.

When video requires Remotion/FFmpeg or other implementation code:

```text
video creative spec → code implementation → video verification → reviewer
```

## Main protection

- no worker commits directly to main
- no worker merges directly to main
- reviewer does not alter main
- COO reports `READY_FOR_MERGE` after PASS
- final main merge remains approval-gated by existing Hames rules
