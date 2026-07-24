---
name: "source-command-go"
description: "READY 작업을 현재 사용자의 명시적 요청으로 실행할 때 사용"
---

# source-command-go

Use this skill only when the current user explicitly invokes `/go <task-id>`. Do not infer go from earlier approval or invoke it autonomously.

```bash
node arsenal/task_contract.js activate --workspace "<workspace-path>" --task-id "<task-id>" --session "<current-session-id>" --approval "current-user:/go <task-id>"
```

Proceed only after the helper validates `READY`, the canonical spec hash, and the recorded provenance structure and transitions the contract to `ACTIVE`. Provenance is audit metadata, not authentication; the current user's explicit `/go` remains mandatory.

- Obey `contract.json` scope and invariants; `plan.md` is guidance only.
- Run the defined checks after implementation.
- Transition to `REVIEW` only after validation succeeds:

```bash
node arsenal/task_contract.js review --session "<current-session-id>"
```

`REVIEW` is not user acceptance. This skill never creates a branch/worktree, commits, pushes, deploys, or waives the separate approval required for a critical action.
