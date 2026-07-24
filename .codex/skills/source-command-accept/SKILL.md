---
name: "source-command-accept"
description: "REVIEW 작업의 결과를 현재 사용자가 별도로 인수할 때 사용"
---

# source-command-accept

Use this skill only when the current user explicitly invokes `/accept <task-id>`. Tests, evidence, and model self-review do not constitute acceptance.

```bash
node arsenal/task_contract.js accept --workspace "<workspace-path>" --task-id "<task-id>" --approval "current-user:/accept <task-id>"
```

Run only for a `REVIEW` contract. Report the resulting `ACCEPTED` state and acceptance provenance. Do not archive, commit, push, or deploy automatically.
