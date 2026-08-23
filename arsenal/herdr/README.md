# Hames + Herdr Multi-Agent Runtime

Hames keeps its existing **COO Router** as the orchestration brain. Herdr is used as the execution/runtime layer for parallel specialist agents.

## Runtime topology

```text
User
  ↓
Hames COO Router
  ↓
Herdr runtime
  ├─ code     → GPT-5.6 Terra / medium
  ├─ ui       → Claude Sonnet 5
  ├─ reviewer → GPT-5.6 Terra / medium
  └─ video    → Claude Sonnet 5 [optional]
```

## Ownership

- `code`: architecture, backend, API, DB, logic, tests
- `ui`: information architecture, interaction, visual hierarchy, responsive/accessibility
- `reviewer`: independent quality gate; no feature creation
- `video`: storyboard/motion/video only when explicitly needed
- `Hames COO`: decomposition, dispatch, integration, rework routing, final reporting

## Recommended flow

```text
UNDERSTAND
  ↓
DECOMPOSE
  ↓
DISPATCH code/ui[/video] in parallel
  ↓
WAIT + COLLECT handoffs
  ↓
INTEGRATE worker branches
  ↓
REVIEW integrated state
  ↓
PASS → ready for merge
FAIL → route findings to owner → re-review
```

## Branch model

For task id `dashboard-20260823`:

```text
main
├─ agent/dashboard-20260823/integration
├─ agent/dashboard-20260823/code
├─ agent/dashboard-20260823/ui
└─ agent/dashboard-20260823/video   # optional
```

Reviewer runs inside the integration worktree as a read-only quality gate.

## Bootstrap

PowerShell:

```powershell
.\arsenal\herdr\bootstrap_agents.ps1 -TaskId dashboard-20260823 -Base main
```

With video:

```powershell
.\arsenal\herdr\bootstrap_agents.ps1 -TaskId contest-demo -Base main -Video
```

## Worker handoff contract

```yaml
STATUS: DONE | BLOCKED | FAILED
OWNER: code | ui | video
BRANCH: agent/<task-id>/<owner>
COMMIT: <sha-or-none>

SUMMARY:
  - ...

FILES:
  - ...

TESTS:
  - command: ...
    result: PASS | FAIL

RISKS:
  - ...

NEEDS:
  - ...
```

## Safety

This runtime does not replace Hames harness/enforcement rules.

- main stays protected
- worker branches must not merge directly to main
- reviewer must not modify files unless explicitly requested
- merge conflicts are routed back to the responsible owner
- existing Hames approval rules still apply to shell/write/deploy actions
