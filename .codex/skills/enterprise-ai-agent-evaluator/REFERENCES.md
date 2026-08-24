# References

이 스킬은 특정 프레임워크 하나를 그대로 복제하지 않고, 사내 AI 업무 Agent 평가 목적에 맞게 아래 공신력 있는 기준을 조합해 재구성했다.

## 1. ISO/IEC 25010:2023 — Product Quality Model

공식 페이지:
https://www.iso.org/standard/78176.html

활용 영역:
- 전체 소프트웨어 품질 프레임
- 기능 적합성
- 성능 효율성
- 신뢰성
- 사용성 관련 품질
- 유지보수성

본 스킬에서는 일반 소프트웨어 품질의 뼈대로 사용하되, 사내 AI Agent 특성상 업무성과와 Agent execution에 가중치를 더 높였다.

---

## 2. Microsoft Foundry Agent Evaluators

공식 문서:
https://learn.microsoft.com/en-us/azure/foundry/concepts/built-in-evaluators

Agent evaluator 문서:
https://learn.microsoft.com/en-us/azure/foundry/concepts/evaluation-evaluators/agent-evaluators

활용 영역:
- Task Completion
- Task Adherence
- Intent Resolution
- Task Navigation Efficiency
- Tool Call Accuracy
- Tool Selection
- Tool Input Accuracy
- Tool Output Utilization
- Tool Call Success

특히 이 스킬의 `Agent 실행 능력` 영역은 Microsoft Foundry의 **System evaluation + Process evaluation** 구분을 강하게 참고했다.

사내 Azure 기반 환경에서 실제 자동화 평가로 연결하기 가장 현실적인 기준이다.

---

## 3. NIST AI Risk Management Framework (AI RMF 1.0)

공식 페이지:
https://www.nist.gov/itl/ai-risk-management-framework

공식 문서:
https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-ai-rmf-10

활용 영역:
- AI 신뢰성
- 리스크 기반 평가
- Human oversight
- 측정 가능한 평가체계
- 배포 전 Gate 개념

본 스킬에서는 보안/거버넌스의 점수 비중은 낮췄지만, 치명적 Agent 행동을 총점과 별도 Gate로 처리하는 원칙에 참고했다.

---

## 4. Nielsen Norman Group — 10 Usability Heuristics

공식 페이지:
https://www.nngroup.com/articles/ten-usability-heuristics/

활용 영역:
- Visibility of system status
- Match between system and real world
- User control and freedom
- Consistency and standards
- Error prevention
- Recognition rather than recall
- Flexibility and efficiency of use
- Minimalist design
- Error recovery
- Help/documentation

본 스킬에서는 특히 다음을 중요하게 반영한다.
- Agent 현재 상태 가시성
- 사용자 취소/수정/복구
- 오류 예방과 복구
- 한눈에 업무 파악

---

## 5. Google People + AI Guidebook (PAIR)

공식 사이트:
https://pair.withgoogle.com/guidebook/

활용 영역:
- Human-AI interaction
- 사용자 기대치 설정
- AI의 한계 전달
- 피드백과 통제
- 신뢰 형성

본 스킬의 `Human–AI Control`과 AI 행동/상태 설명성 설계에 참고한다.

---

## 6. OWASP GenAI / LLM Application Security

공식 프로젝트:
https://genai.owasp.org/

활용 영역:
- Prompt Injection
- Sensitive Information Disclosure
- Excessive Agency
- Agent 행동 범위
- 고영향 Action 통제

사내망과 Azure 공통 보안통제가 존재한다는 전제를 둘 수 있으므로 본 스킬에서 네트워크/인프라 보안 비중은 작다.

단, **Agent가 권한 밖 Action을 수행하거나 사용자 승인 없이 고영향 Write Action을 실행하는 문제는 인프라 보안과 별개**이므로 Mandatory Gate에 남긴다.

---

## 7. OpenAI Evals

GitHub:
https://github.com/openai/evals

활용 영역:
- 반복 가능한 evaluation dataset
- test case 기반 평가
- 모델/버전 간 비교
- 평가 자동화 개념

본 스킬의 대표 Task Set, Golden Dataset, regression evaluation 방식에 참고한다.

---

# Mapping

| Rubric Domain | Main References |
|---|---|
| 업무 성과 / 효율성 | ISO/IEC 25010 + 자체 업무 KPI baseline |
| AI 결과 신뢰성 | Microsoft Foundry + NIST AI RMF + OpenAI Evals |
| Agent 실행 능력 | Microsoft Foundry Agent Evaluators |
| Human–AI Control | Google PAIR + Nielsen + NIST AI RMF |
| UX / 업무 가시성 | Nielsen Heuristics + ISO/IEC 25010 |
| Agent Control / Governance | NIST AI RMF + OWASP GenAI |
| 성능 / 안정성 | ISO/IEC 25010 + operational metrics |
| 확장성 / 지속사용성 | ISO/IEC 25010 + operational maintainability |

# Design Note

이 루브릭의 가중치 자체는 국제표준에서 직접 제공하는 숫자가 아니다.

가중치는 **사내 AI Agent 업무효율화 서비스**라는 사용 목적에 맞춰 설계한 것이다.

따라서 외부 발표 시에는 아래와 같이 표현한다.

> "ISO/IEC 25010, Microsoft Foundry Agent Evaluators, NIST AI RMF, Nielsen usability heuristics 등 공인/산업 표준 프레임워크를 참고하여 사내 업무 Agent 목적에 맞게 가중치를 재설계한 평가체계"

`국제표준이 이 100점 배점을 직접 정의한다`고 표현해서는 안 된다.
