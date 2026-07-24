---
description: 범위 승인이 필요한 작업을 실행 전 READY 상태로 확정할 때 사용
---

# /ready

사용법: `/ready <task-id>`

고복잡도 작업, 또는 사용자가 명시적으로 `/ready`를 호출한 작업에만 적용한다. 낮은 복잡도의 일반 작업은 기존 흐름을 유지한다.

## 실행

1. 현재 작업 공간과 로컬 규칙을 확정한다.
2. 사용자 요청에서 목표, 승인된 파일 범위, 불변 조건, 인수 기준, 필수 검증, 요청·승인 출처, `plan`을 `arsenal/task_contract.schema.json`에 맞는 입력 JSON으로 구조화한다. 출처는 감사용 메타데이터이며 인증 수단이 아니다.
3. 아래 helper로 `.hames/contracts/_Active/<task-id>/` 패키지를 만들고 `DRAFT -> READY`로 전환한다. 기존 패키지의 명세를 갱신하는 경우만 `draft`를 사용한다. `DRAFT` 이후의 수정은 `AMENDMENT_PENDING`이 되며 기존 세션 포인터·증거를 무효화하므로 다시 ready/go가 필요하다.

```bash
node arsenal/task_contract.js create --input "<spec-json-path>"
# 기존 초안 갱신 시: node arsenal/task_contract.js draft --input "<spec-json-path>"
node arsenal/task_contract.js ready --workspace "<workspace-path>" --task-id "<task-id>"
```

4. `contract.json` 경로, 상태, 리비전, 명세 해시, 기록된 출처를 보고한다. 생성된 `contract.json`이 정본이고 `plan.md`는 실행 안내일 뿐이다. 구현은 시작하지 않고 현재 사용자의 별도 `/go <task-id>` 요청을 기다린다.

`/ready`는 branch, worktree, commit, push를 만들거나 실행하지 않는다. 중요 행동의 명시적 승인 게이트도 대체하지 않는다.
