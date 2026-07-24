---
description: READY 작업을 현재 사용자의 명시적 요청으로 실행할 때 사용
---

# /go

사용법: `/go <task-id>`

이 커맨드 호출 자체를 현재 사용자의 go 요청으로 기록한다. 모델이 자율적으로 호출하거나 예전 승인을 재사용하면 안 된다.

```bash
node arsenal/task_contract.js activate --workspace "<workspace-path>" --task-id "<task-id>" --session "<current-session-id>" --approval "current-user:/go <task-id>"
```

helper가 `READY` 상태, `contract.json` 명세 해시, 기록된 승인 출처 구조를 검증해 `ACTIVE`로 전환한 경우에만 실행한다. `--approval`은 현재 `/go`의 감사 기록이지 인증 수단이 아니다. 실행 중에는:

- `contract.json`의 파일 범위와 불변 조건을 지킨다.
- `plan.md`를 실행 안내로만 사용한다.
- 정의된 검증을 실행하고 성공한 경우에만 helper의 review 전환을 수행한다.

```bash
node arsenal/task_contract.js review --session "<current-session-id>"
```

`REVIEW`는 검토 대기이며 사용자 인수가 아니다. `/go`는 Git 작업이나 중요 행동 승인을 포함하지 않는다.
