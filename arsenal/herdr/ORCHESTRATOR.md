# Hames COO → Herdr Coordination Rules

The existing Hames COO remains the orchestration brain. Herdr provides the runtime/control plane.

## Role model

### Coordinator

- `hames-coo`
- model: Claude Sonnet 5
- responsibilities: decomposition, dispatch, integration, rework routing, final reporting

### Producers

- `code` — GPT-5.6 Terra, medium reasoning
- `ui` — Claude Sonnet 5
- `video` — Claude Sonnet 5, optional

### Quality Gate

- `reviewer` — GPT-5.6 Terra, medium reasoning
- not a producer
- may be started at bootstrap but must remain idle until an integrated state is ready
- judges integrated output and returns PASS/FAIL

## COO responsibilities

1. Understand the user request.
2. Extract acceptance criteria.
3. Inspect repository boundaries.
4. Decompose work into owner-scoped tasks.
5. Dispatch independent producer work in parallel.
6. Track `working / blocked / done / idle` agent states.
7. Collect structured producer handoffs.
8. Merge completed producer branches into the integration branch.
9. Invoke reviewer on the integrated state only after integration is ready.
10. Route FAIL findings to the correct producer owner.
11. Repeat until PASS or explicit user escalation is required.
12. Report readiness; do not merge to main unless authorized.

## Owner map

| Area | Owner |
|---|---|
| architecture/backend/API/DB/business logic/tests | code |
| UI/UX/interaction/responsive/accessibility | ui |
| storyboard/motion/video | video |
| final quality verdict | reviewer |
| decomposition/dispatch/integration/rework routing | hames-coo |

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

- no producer commits directly to main
- no producer merges directly to main
- reviewer does not alter main
- hames-coo reports `READY_FOR_MERGE` after PASS
- final main merge remains approval-gated by existing Hames rules
