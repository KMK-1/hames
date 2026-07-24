---
description: 인수된 작업 계약을 삭제하지 않고 복구 가능하게 보관할 때 사용
---

# /archive

사용법: `/archive <task-id>`

작업 계약의 보관은 인수와 별도의 전환이다. 현재 사용자가 이 커맨드를 요청한 때만 실행한다.

```bash
node arsenal/task_contract.js archive --workspace "<workspace-path>" --task-id "<task-id>"
```

helper는 패키지를 `.hames/contracts/_Active/`에서 같은 워크스페이스의 `.hames/contracts/_Archive/`로 옮기고 `ARCHIVED`를 기록한다. 삭제, Git commit/push, 배포를 수행하지 않는다. 완료 보고에는 보관 경로와 복구 가능하다는 점을 포함한다.
