---
description: REVIEW 작업의 결과를 현재 사용자가 별도로 인수할 때 사용
---

# /accept

사용법: `/accept <task-id>`

테스트 통과, 증거 생성, 모델의 자가 평가를 사용자 인수로 간주하지 않는다. 현재 사용자가 이 커맨드를 명시적으로 요청했고 계약이 `REVIEW`인 경우에만 실행한다.

```bash
node arsenal/task_contract.js accept --workspace "<workspace-path>" --task-id "<task-id>" --approval "current-user:/accept <task-id>"
```

결과로 `ACCEPTED` 상태와 인수 출처를 보고한다. 인수는 자동 archive, commit, push, deploy를 실행하지 않는다.
