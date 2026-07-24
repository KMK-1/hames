---
name: "source-command-archive"
description: "인수된 작업 계약을 삭제하지 않고 복구 가능하게 보관할 때 사용"
---

# source-command-archive

Use this skill when the current user invokes `/archive <task-id>` for an accepted contract.

```bash
node arsenal/task_contract.js archive --workspace "<workspace-path>" --task-id "<task-id>"
```

The helper moves the package from `.hames/contracts/_Active/` to the same workspace's `.hames/contracts/_Archive/` and records `ARCHIVED`. This is a separate, recoverable archive transition, not deletion. Report the archived path. Do not commit, push, or deploy automatically.
