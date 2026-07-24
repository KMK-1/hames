---
description: Safety gates, overwrite blocking, metadata rules, and workspace integrity checks.
globs:
alwaysApply: true
---

## Module Relationship

- GATES_ALL: this module is the final execution gate.
- OVERRIDES: when another module conflicts with safety, this module wins.
- ENFORCED_BY: Claude Code PreToolUse/PostToolUse hooks in `.claude/settings.json`
- REFERENCES: `arsenal/CLAUDE.md`

---

# HARNESS ENGINEERING

## [1] DEFINED_CRITICAL_ACTIONS

The following actions require explicit user approval before execution:

`DELETE_FILE` / `OVERWRITE_EXISTING` / `SEND_EMAIL` / `DEPLOY_CODE` / `EXECUTE_SHELL` / `MOVE_FILE`

### CEO 명시 승인 우회 (Bash hook 한정)

CEO 가 명시적으로 위험 명령 실행을 지시한 경우, Bash 명령 본문에 `CEO:OK` 토큰을 포함시켜 `compliance_auditor` 차단을 우회한다.

- **형식:** `rm important.md  # CEO:OK` 또는 `mv a b  # CEO:OK`
- **토큰 인식:** `\bCEO:OK\b` 정규식 일치 (대소문자 구분, 공백/구두점 경계)
- **감사 추적:** 우회 발생 시 `.claude/workspace_audit.log` 에 `{result: "BYPASS", bypass_reason: "CEO:OK_token", matched_pattern: ...}` 기록 — 차단 안 하지만 흔적은 남음
- **사용 원칙:** CEO 가 직접 "삭제해/지워/옮겨" 등 명시 지시한 경우에만 토큰 부착. 모델 자율 판단으로 토큰 부착 금지

### 자동 카브아웃 (토큰 불필요)

- `git rm`, `git mv` — git history 로 복구 가능하므로 위험 목록에서 자동 제외. BYPASS 감사 로그는 동일하게 기록

## [2] HARD ENFORCEMENT

Rules:

- `Write` may create a new file, but must not overwrite an existing file.
- `Edit` must be surgical and targeted.
- dangerous overwrite-style Bash patterns are blocked.
- oversized `Edit` rewrites are guarded in two stages: `compliance_auditor.js` (PreToolUse) blocks an over-large `old_string` *before* the write; `verify_edit_surgery.js` (PostToolUse) detects an over-large *after-diff* (e.g. a tiny `old_string` expanded into a huge `new_string`) *after* the write and signals the model to self-correct.

These rules are enforced by hook scripts, not just by documentation.

## [3] WORKSPACE INTEGRITY

Harness protects the actual source workspace.

That means:

- final outputs belong in the active workspace
- naming and metadata must follow workspace rules
- AI_COMM handoff files do not replace workspace outputs

## [4] AI_COMM BOUNDARY

AI_COMM is not exempt from harness rules.

However, AI_COMM has a narrower role:

- store handoff context
- store result summaries
- preserve model continuity

AI_COMM should not silently become a high-privilege execution layer.

## [5] PRE-OUTPUT CHECKLIST

Before saving a final workspace output, confirm:

- the active workspace is correct
- the chosen agent team matches the task
- the output path belongs to the workspace
- naming and metadata are valid
- critical actions were not bypassed
- the right Arsenal tool was used when needed

## [6] METADATA AND NAMING

For workspace markdown outputs:

- use the workspace destination path
- use the required naming scheme
- use valid frontmatter fields and tags

Exceptions remain governed by the verifier scripts.

## [7] ENFORCEMENT SCRIPTS & SKILLS

Primary scripts (located in `arsenal/`):

- `compliance_auditor.js` — 전역 규정 준수 감사
- `verify_tasks.js` — 워크스페이스 산출물 검증
- `verify_edit_surgery.js` — 파일 수정 수술 적합성 검토
- `update_arsenal_permissions.js` — 도구 권한 자동 업데이트
- `task_contract.js` — 작업 계약 생성·상태 전환·검증
- `task_contract_guard.js` — 활성 계약의 파일 도구 쓰기 범위 집행
- `task_contract_evidence.js` — 세션에 연결된 ACTIVE/REVIEW 계약의 도구 결과 증거 기록

`verify_tasks.js`, `verify_edit_surgery.js`, `update_arsenal_permissions.js`는 PostToolUse hook으로 자동 실행되며 (`compliance_auditor.js`는 PreToolUse), 별도 슬래시 커맨드는 두지 않습니다. 시스템 무결성 점검은 `/doctor`, 콘텐츠·인덱스 감사는 `/index`로 통합되어 있습니다.

## [7.5] TASK CONTRACT ENFORCEMENT

- 작업 계약의 정본은 워크스페이스 내 `.hames/contracts/_Active/<task-id>/contract.json`이다. `plan.md`, 증거, 결과 파일은 권한 정보가 아니다.
- `task_contract_guard.js`는 `ACTIVE` 계약이 있을 때 Write/Edit/MultiEdit/NotebookEdit 대상을 승인된 파일 범위와 대조한다. Bash 검사는 문자열·경로 패턴 기반의 **best-effort**이며 완전한 sandbox로 설명하지 않는다.
- 활성 계약이 없으면 작업 계약 훅은 legacy-pass하고 기존 workspace lock·compliance·frontmatter·verifier 규칙만 적용한다.
- `/go`는 현재 사용자의 명시적인 요청, `READY` 상태, 정본 명세 해시, 승인 출처 구조가 모두 유효할 때만 현재 런타임 세션에 활성화한다. 출처는 감사 메타데이터이며 사용자 인증을 대체하지 못한다.
- 정의된 검증이 성공해야 `REVIEW`로 이동할 수 있다. `REVIEW`는 기술적 검토 대기 상태이며 사용자 인수를 의미하지 않는다.
- `/accept`는 현재 사용자의 별도 인수 요청으로만 수행한다. `/archive`는 보관 전환이며 삭제가 아니며, 패키지는 워크스페이스 내에서 복구 가능해야 한다.
- 작업 계약은 [1] `DEFINED_CRITICAL_ACTIONS`의 명시적 사용자 승인을 대체하거나 완화하지 못한다.

## [8] DESIGN INTENT

Hames harness exists to keep the system:

- safe
- auditable
- workspace-consistent
- resistant to accidental overwrite or uncontrolled drift

**우선순위:** 하네스 무결성 > 토큰 절약. 하네스가 무너질 위험을 감수하느니 토큰을 더 쓰더라도 시스템 완성도·집행력을 우선한다. enforcement를 우회하는 방식의 "최적화"는 금지 — 풀어야 하면 우회 말고 좁은 grace로 설계.

## [9] WORKSPACE LOCK

파일 쓰기를 활성 워크스페이스로 강제하는 실시간 차단 레이어.

**관련 파일:**
- `.claude/.workspace_lock` — 현재 잠금 상태 (`{"workspace": "MyDomain", "locked": true}`)
- `.claude/workspace_paths.json` — 워크스페이스 이름 → 절대경로 매핑
- `.claude/hooks/workspace_guard.js` — PreToolUse 집행 스크립트
- `.claude/workspace_audit.log` — 차단/허용 이력 (런타임)

**동작 원칙:**
- Lock OFF: 모든 쓰기 통과
- Lock ON: 활성 워크스페이스 외부 Write/Edit/MultiEdit/NotebookEdit 차단
- 읽기(Read/Glob/Grep)는 lock 상태와 무관하게 항상 통과
- SYSTEM_ADMIN 경로(`arsenal/`, `ai_comm/`, `.claude/`)는 lock 무관 항상 허용
- Bash: 외부 워크스페이스 절대경로 + 쓰기 패턴 동시 탐지 시 차단 (best-effort)

**활성화:** `/lock <workspace>` 슬래시 커맨드
**해제:** "고정 해제" / "lock 해제" / "unlock" → 에이전트가 `.workspace_lock`을 `{"workspace": null, "locked": false}`로 업데이트

## [10] NEGATIVE CLAIM VERIFICATION

모델이 "변경 없음 / 비어있음 / 깨끗함 / 이상 없음 / 통과 / 일치 / 누락 없음" 같은 **부정형 결론**을 내릴 때 적용되는 글로벌 룰.

**원칙:** 부정형 주장은 모델이 가장 쉽게 hallucination으로 만드는 카테고리. 모델 자체 판단을 신뢰하지 않는다.

**규칙:**

1. 부정형 결론을 내리기 직전, 그 결론의 근거가 되는 명령(또는 스크립트)의 **raw 출력을 화면에 그대로 표시**한다.
2. 요약·재해석·줄임 금지. 원본 출력을 사용자가 동시에 눈으로 확인할 수 있게 한다.
3. raw 출력이 진짜로 비어있을 때만 부정형 결론을 낸다.
4. 외부 스크립트(`/doctor`, `/index`, `/handoff` 등)의 결과를 보고할 때도 동일 — 스크립트 raw 출력을 최소 1회 그대로 표시한 뒤에 요약한다.

**적용 대상:** 모든 슬래시 커맨드, 모든 검증 단계, 모든 단계별 분기 결정 지점.

**근거:** 본 모듈 [8] DESIGN INTENT — "resistant to accidental overwrite or uncontrolled drift". 부정형 거짓 보고는 silent drift의 가장 흔한 진입로.

## [11] SCOPE DISCIPLINE — 자의적 사이드 액션 금지

CEO가 승인한 작업 범위 밖에서 에이전트가 "안전을 위해" 또는 "정리 차원에서" 자의적으로 추가하는 사이드 액션은 금지된다.

**대표적 금지 사례:**
- 백업 브랜치/태그 생성 (특히 원격 push) — 명시 요청 없이 절대 금지
- 결정 보류용으로 별도 산출물(.md, .txt, .json 등) 미리 만들어두기
- 한 옵션 선택 직후 "혹시 모르니" 다른 옵션도 함께 준비
- 정리·리팩토링·주석 추가·관련 파일 자동 갱신 등 task 범위 외 변경
- 산출물 페이지별/항목별 검토 중 묻지 않은 추가 수정 제안, 또는 같은 결함의 전체 일괄(replace_all) 치환 — 검토 중인 **그 페이지만** 고치고 CEO 페이스를 따른다.

**원칙:**
1. 명시 승인 범위 안에서만 동작한다.
2. 추가 안전 조치(백업 등)가 필요하다고 판단되면 **실행 전** 1줄로 보고하고 승인을 받는다.
3. 사후 보고("이미 해뒀어요")는 위반으로 간주한다.
4. `prompt_engineering.md` [1] CODING_DISCIPLINE("task가 요구하지 않은 기능·추상화·리팩토링 금지")의 연장선.

**근거 [8]:** 에이전트 자의적 추가 액션은 drift의 한 형태.

## [12] GIT RESET PRE-FLIGHT — CWD 검증 의무

`git reset`, `git checkout <SHA>`, `git rebase`, `git clean` 같은 **HEAD/working tree를 비가역적으로 이동시키는 명령** 실행 직전에 다음 3줄을 raw로 출력해 확인한다 (요약·생략 금지):

```bash
pwd
git log -1 --oneline
git rev-parse --abbrev-ref HEAD
```

**원칙:**

1. **CWD 묵시 가정 금지** — "당연히 여기일 것"이라는 추정으로 `git reset HEAD~1` 류를 실행하지 않는다. 직전에 `cd`했더라도 다시 `pwd`로 raw 확인.
2. **서브모듈 cascade 인지** — 루트에서 `git reset --hard <SHA>`를 실행하면 등록된 서브모듈 HEAD가 부모 커밋의 gitlink SHA로 끌려갈 수 있다. 부모 reset 직후 서브모듈 `git reflog`를 raw로 확인하기 전에는 서브모듈에서 추가 reset/rebase 금지.
3. **reflog 기반 정확 SHA 복원** — 복원 시 `HEAD~N` shorthand 금지. `git reflog`로 확인한 **정확한 SHA**로 복원한다.
4. **부정형 결론 안전장치 연장 ([10])** — "이미 복원됐다 / 손실 없다 / 동기화 완료"는 reflog와 `git diff <기준SHA>..HEAD --stat` raw 출력을 화면에 박은 뒤에만 낸다.

**근거 [8]:** reset류는 drift의 가장 비가역적인 진입로.

## [13] DEBUGGING TRIPWIRE — 근본원인 우선 & 3-실패 재검토

버그·테스트 실패·예상 외 동작에 대응할 때 적용되는 모델 자체 행동 규율.

1. **근본원인 우선** — 수정 시도 전 에러 메시지 raw 확인 + 재현 + 최근 변경 추적으로 원인을 먼저 특정한다. 증상만 덮는 수정은 실패로 간주.
2. **단일 가설 검증** — 한 번에 하나의 가설만 최소 변경으로 테스트한다. 산탄총식 동시 수정 금지.
3. **3-실패 트립와이어** — 동일 증상(같은 에러 메시지 또는 같은 테스트의 실패)에 대한 수정이 3회 실패하면 멈춘다. 4번째 시도 대신 아키텍처·전제 자체를 의심하고 CEO에게 보고한다. "한 번만 더"는 위반 신호.
4. **부정형 연계 ([10])** — "고쳐졌다 / 통과한다"는 결론은 테스트 raw 출력을 표시한 뒤에만 낸다.

**근거 [8]:** 반복 헛발질은 토큰을 태우는 silent drift.

## [14] FACT GROUNDING — 근거 없는 사실·제품 날조 금지

산출물(전략·발표·보고)에 **소스(제품자료·검증된 사실)에 없는 제품·수치·주장을 지어내지 않는다.** 특히 존재가 확인 안 된 미래 제품/로드맵을 사실처럼 제시 금지.

- 넣는 제품·수치·주장은 소스에 있거나 검증된 것만. 추측은 `[추정]` 라벨 + 단정 금지, 또는 삭제.
- **원문 오독 주의:** 소스의 약점/부정형 주장은 실제 텍스트를 추출·정독해 확인한 뒤 쓴다(기억·인상으로 단정 금지).
- [10] 부정형 검증의 긍정형 짝. 대외 산출물은 지어낸 항목 하나가 전체 신뢰를 깬다.

## [15] SECRET HANDLING — API 키 노출 금지

API 키·시크릿은 `.env` 파일에만 보관한다. 핸드오프 파일·CLAUDE.md·스크립트·마크다운 등 **어떤 파일에도 키 값을 직접 기재하지 않는다.** 파일에서 키를 언급할 땐 변수명만(`OPENAI_API_KEY=` 형태).

**근거:** 핸드오프·설정 파일은 gitignore 대상이 아닐 수 있어 git에 그대로 올라간다. 한 번 커밋된 키는 history에 남는다.

## [16] GIT CWD & SYNC DISCIPLINE — cd 의존 금지 · 미push 확인

[12]와 같은 계열의 drift 방지.

1. **CWD 묵시 가정 금지:** 서브모듈/멀티스텝 git은 `git -C <절대경로>` 또는 같은 명령줄(`cd <root> && git …`)에서 루트 복귀를 명시한다. 단계 전환 직전 `pwd` raw 확인.
2. **`git status`만으로 완료 판정 금지:** `git status`는 "커밋 안 된 변경"만 보여주고 "커밋됐지만 미push인 커밋"은 못 본다. save/동기화 판정 시 `git rev-list --left-right --count origin/<branch>...HEAD`까지 확인한 raw 출력 위에서만 "동기화 완료" 결론. [10]의 git 버전.
