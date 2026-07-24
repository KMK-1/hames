---
name: "source-command-ready"
description: "범위 승인이 필요한 작업을 실행 전 READY 상태로 확정할 때 사용"
---

# source-command-ready

Use this skill when the user asks to run `/ready <task-id>`.

## Workflow

1. 현재 작업 공간과 로컬 규칙을 확정한다.
2. 사용자 요청에서 목표, 승인된 파일 범위, 불변 조건, 인수 기준, 필수 검증, 요청·승인 출처, `plan`을 `arsenal/task_contract.schema.json`에 맞는 입력 JSON으로 구조화한다. 출처는 감사용 메타데이터일 뿐 인증이 아니다.
3. 아래 helper로 `.hames/contracts/_Active/<task-id>/` 패키지를 생성하고 `DRAFT -> READY`로 전환한다. 기존 패키지의 명세를 갱신하는 경우만 `draft`를 사용한다. `DRAFT` 이후의 수정은 `AMENDMENT_PENDING`이 되고 기존 세션 포인터·증거를 무효화한다.

```bash
node arsenal/task_contract.js create --input "<spec-json-path>"
# 기존 초안 갱신 시: node arsenal/task_contract.js draft --input "<spec-json-path>"
node arsenal/task_contract.js ready --workspace "<workspace-path>" --task-id "<task-id>"
```

4. `contract.json` 경로, 상태, 리비전, 명세 해시, 기록된 출처를 보고하고 구현은 시작하지 않는다. 현재 사용자의 별도 `/go <task-id>` 요청을 기다린다.

`contract.json`이 정본이며 `plan.md`는 안내일 뿐이다. 낮은 복잡도 작업은 사용자가 `/ready`를 직접 호출한 경우가 아니면 기존 흐름을 유지한다. 이 스킬은 Git 작업이나 중요 행동 승인을 자동화하지 않는다.
