# GitHub Copilot Windows 403 Fix + Plan-based Model List

## TL;DR

> **Quick Summary**: Windows에서 GitHub Copilot API 403 에러를 수정하고, Copilot plan별 모델 목록을 자동 반영한다. 핵심은 OAuth token → Copilot session token 교환 단계 추가 및 session token 기반 API 호출로 전환. Windows CORS 문제 시 Rust backend 완전 이전까지 Plan B 포함.
>
> **Deliverables**:
> - `src-tauri/src/lib.rs`: `copilot_exchange_token` Rust command 추가
> - `src/utils/providers.ts`: session token 관리 로직 + config 필드 분리
> - `src/components/SettingsWindow.tsx`: githubToken(gho_) 분리 저장 + session token config 반영
> - (Plan B) `src-tauri/src/lib.rs`: `copilot_models`, `copilot_chat` Rust commands
>
> **Estimated Effort**: Medium  
> **Parallel Execution**: YES - 2 waves  
> **Critical Path**: Task 1 (Rust exchange) → Task 2 (providers.ts 수정) → Task 3 (SettingsWindow 수정) → Task 4 (Plan B Rust commands)

---

## Context

### Original Request
Windows에서 GitHub Copilot 인증은 성공하지만 실제 LLM API call 시 `api.githubcopilot.com/models`와 `/chat/completions` 모두 403. 또한 모델 목록이 사용자 Copilot plan(Individual/Business/Enterprise)에 따라 자동 반영되어야 함.

### Interview Summary
**Key Discussions**:
- Windows 403 원인: OAuth token (gho_...)을 Copilot API에 직접 사용. 실제로는 `api.github.com/copilot_internal/v2/token`을 통해 session token으로 교환 후 사용해야 함
- token 교환: Rust backend `copilot_exchange_token` command로 처리 (Windows WebView2 CORS 우회)
- session token 저장: `config.githubToken`에 gho_ 원본, `config.apiKey`에 session token — 필드 분리
- Plan B: token exchange 후에도 WebView2 CORS가 남아있을 경우 `buildRequest`도 Rust command로 이전
- 모델 권한: Copilot `/models` API의 `model_picker_enabled: true` 필터가 plan별 자동 처리 (기존 `fetchModels` 로직은 올바름, session token만 수정)

**Research Findings**:
- `api.github.com/copilot_internal/v2/token`: `Authorization: token gho_...` 헤더, GET 요청, 응답에 `token` + `expires_at` 포함
- session token 만료: 1시간, 만료 시 재교환 필요
- `COPILOT_API_VERSION = "2026-06-01"`: 현재 날짜(2026-06-30) 기준 유효. 유지.
- Windows WebView2: macOS WKWebView와 달리 외부 도메인 CORS preflight를 더 엄격하게 처리 가능

### Metis Review
**Identified Gaps** (addressed):
- session token 저장 전략 미결정 → config 필드 분리 방식으로 결정
- 동시 exchange 방지(race condition) → TypeScript Promise 캐싱으로 처리
- Plan B CORS 대안 미준비 → Rust copilot_models + copilot_chat commands 포함
- gho_ token 만료/revoke 시 에러 메시지 → "Re-authenticate" 에러로 구분
- fetchModels session token 전달 불일치 → config.apiKey를 session token으로 덮어써서 기존 인터페이스 유지

---

## Work Objectives

### Core Objective
Windows에서 GitHub Copilot 403 에러를 수정한다. OAuth token → session token 교환을 Rust backend에서 처리하고, session token을 config.apiKey에 저장하여 기존 fetchModels/buildRequest 인터페이스를 유지한다. WebView2 CORS가 문제인 경우를 대비해 Rust API proxy commands도 준비한다.

### Concrete Deliverables
- `src-tauri/src/lib.rs`: `copilot_exchange_token(github_token: String)` command
- `src-tauri/src/lib.rs` (Plan B): `copilot_models(session_token: String)`, `copilot_chat(session_token, model, system_prompt, user_message)` commands
- `src/utils/providers.ts`: session token 캐시 + 자동 재교환 로직
- `src/components/SettingsWindow.tsx`: OAuth 로그인 완료 시 githubToken + apiKey(session) 분리 저장

### Definition of Done
- [ ] Windows에서 GitHub Copilot 선택 후 모델 목록 로드 성공 (response.ok)
- [ ] Windows에서 AI 쿼리 실행 시 response.status === 200
- [ ] macOS 기존 동작 regression 없음
- [ ] session token 만료 후 자동 재교환 동작

### Must Have
- OAuth flow 완료 후 즉시 session token 교환 실행
- session token 만료(1시간) 자동 감지 및 재교환
- Plan B: WebView2 CORS 문제 시 Rust commands로 fallback 경로 준비
- Copilot /models API plan별 자동 모델 목록 (기존 fetchModels + session token)

### Must NOT Have (Guardrails)
- 자동 재로그인 플로우 구현 금지 (만료/실패 시 에러 throw만)
- session token을 localStorage에 영속화 금지 (메모리 캐시만)
- 다른 provider(openai, anthropic, gemini 등) buildRequest 수정 금지
- ProviderDef 인터페이스 시그니처 구조 변경 금지 (fetchModels 파라미터 변경 금지)
- 스트리밍(stream: true) 추가 금지
- AI slop: 과도한 추상화, 불필요한 유틸리티 레이어 추가 금지

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: NO (테스트 파일 없음)
- **Automated tests**: None
- **Agent-Executed QA**: MANDATORY - curl + Bash로 API 응답 검증

### QA Policy
모든 task는 agent-executed QA scenarios 포함. API 응답은 Bash(curl)로, UI 동작은 코드 리뷰 + 런타임 로그로 검증.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately - 병렬 가능):
├── Task 1: Rust copilot_exchange_token command [quick]
└── Task 2: Rust Plan B commands (copilot_models, copilot_chat) [quick]

Wave 2 (After Wave 1 - frontend 수정):
├── Task 3: providers.ts session token 관리 로직 [unspecified-high]
└── Task 4: SettingsWindow.tsx githubToken/apiKey 분리 [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews):
├── Task F1: Plan Compliance Audit (oracle)
├── Task F2: Code Quality Review (unspecified-high)
├── Task F3: Real Manual QA (unspecified-high)
└── Task F4: Scope Fidelity Check (deep)
```

### Dependency Matrix
- **Task 1**: None → 3
- **Task 2**: None → 3 (Plan B fallback path)
- **Task 3**: 1, 2 → F1-F4
- **Task 4**: 1 → F1-F4

### Agent Dispatch Summary
- Wave 1: T1 → `quick`, T2 → `quick`
- Wave 2: T3 → `unspecified-high`, T4 → `quick`
- Final: F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [ ] 1. Rust `copilot_exchange_token` command 추가

  **What to do**:
  - `src-tauri/src/lib.rs`에 새 Tauri command `copilot_exchange_token(github_token: String) -> Result<CopilotTokenResponse, String>` 추가
  - 요청: `GET https://api.github.com/copilot_internal/v2/token`
  - 헤더: `Authorization: token {github_token}`, `Accept: application/json`
  - 응답 구조체 `CopilotTokenResponse`: `token: String`, `expires_at: String` (ISO8601) 필드
  - 에러 처리: HTTP 401/403 → `Err("Authentication failed: re-authenticate required")`, 네트워크 에러 → `Err("Token exchange failed: {error}")`, 기타 비-200 → `Err("Token exchange failed: HTTP {status}")`
  - `invoke_handler!` 목록에 `copilot_exchange_token` 추가
  - reqwest는 이미 Cargo.toml에 있음 (`features = ["json"]`)

  **Must NOT do**:
  - token을 Rust 측에서 파일/DB/환경변수에 저장하지 않음
  - 다른 기존 command 수정 금지
  - POST 메서드 사용 금지 (GET이 맞음)

  **Recommended Agent Profile**:
  > - **Category**: `quick`
  >   - Reason: 단일 파일, Rust async function 추가, 패턴이 기존 copilot_device_code/copilot_poll_token과 동일
  > - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Task 3, Task 4
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src-tauri/src/lib.rs:22-38` — `copilot_device_code` 함수 패턴 (reqwest GET, error handling, 구조체 반환)
  - `src-tauri/src/lib.rs:47-65` — `copilot_poll_token` 함수 패턴 (인수 받기, json 파싱)

  **External References**:
  - GitHub Copilot Internal Token API: `GET https://api.github.com/copilot_internal/v2/token`
    Headers: `Authorization: token GHO_TOKEN`, `Accept: application/json`
    Response: `{ "token": "tid_v2_...", "expires_at": "2026-06-30T10:00:00Z", ... }`

  **Acceptance Criteria**:

  ```
  Scenario: Rust 컴파일 성공
    Tool: Bash
    Steps:
      1. cd /Users/seongheon/code/bootcamp/dadumi/src-tauri && cargo check
    Expected Result: "Finished" 출력, 에러 없음
    Evidence: .sisyphus/evidence/task-1-cargo-check.txt

  Scenario: copilot_exchange_token 함수 시그니처 존재
    Tool: Bash
    Steps:
      1. grep -n "copilot_exchange_token" /Users/seongheon/code/bootcamp/dadumi/src-tauri/src/lib.rs
    Expected Result: async fn 정의 + invoke_handler 등록 라인 2개 이상 출력
    Evidence: .sisyphus/evidence/task-1-function-exists.txt
  ```

  **Evidence to Capture**:
  - [ ] task-1-cargo-check.txt
  - [ ] task-1-function-exists.txt

  **Commit**: YES (groups with Task 2, 3, 4)

---

- [ ] 2. Rust Plan B commands: `copilot_models` + `copilot_chat`

  **What to do**:
  - `src-tauri/src/lib.rs`에 두 command 추가:

  **`copilot_models(session_token: String) -> Result<String, String>`**
  - `GET https://api.githubcopilot.com/models`
  - 헤더: `Authorization: Bearer {session_token}`, `X-GitHub-Api-Version: 2026-06-01`, `Editor-Version: vscode/1.85.0`, `Copilot-Integration-Id: vscode-chat`
  - 성공 시 response body를 그대로 String으로 반환 (JSON string)
  - 실패 시 `Err("Models fetch failed: HTTP {status}")`

  **`copilot_chat(session_token: String, model: String, system_prompt: String, user_message: String) -> Result<String, String>`**
  - `POST https://api.githubcopilot.com/chat/completions`
  - 동일 헤더 + `Content-Type: application/json`
  - Body: `{"model": model, "messages": [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_message}]}`
  - 성공 시 response body String 반환
  - 실패 시 `Err("Chat failed: HTTP {status}")`
  - `invoke_handler!`에 두 command 추가

  **Must NOT do**:
  - streaming 처리 금지 (non-streaming only)
  - 응답 JSON 파싱 금지 (raw string 반환, parsing은 frontend에서)

  **Recommended Agent Profile**:
  > - **Category**: `quick`
  >   - Reason: Task 1과 동일 패턴, 두 함수 추가
  > - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 3
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src-tauri/src/lib.rs:22-38` — GET 요청 패턴
  - `src-tauri/src/lib.rs:386-395` — `invoke_handler!` 등록 목록

  **Acceptance Criteria**:

  ```
  Scenario: 두 command 컴파일 성공
    Tool: Bash
    Steps:
      1. cd /Users/seongheon/code/bootcamp/dadumi/src-tauri && cargo check 2>&1
    Expected Result: "Finished" 출력
    Evidence: .sisyphus/evidence/task-2-cargo-check.txt

  Scenario: command 시그니처 존재 확인
    Tool: Bash
    Steps:
      1. grep -n "copilot_models\|copilot_chat" /Users/seongheon/code/bootcamp/dadumi/src-tauri/src/lib.rs
    Expected Result: 각 함수 정의 + invoke_handler 등록 4개 이상 라인 출력
    Evidence: .sisyphus/evidence/task-2-functions-exist.txt
  ```

  **Evidence to Capture**:
  - [ ] task-2-cargo-check.txt
  - [ ] task-2-functions-exist.txt

  **Commit**: YES (groups with Task 1, 3, 4)

---

- [ ] 3. `providers.ts` session token 관리 로직 전면 수정

  **What to do**:
  - 파일 상단에 session token 캐시 변수 추가:
    ```typescript
    interface CopilotSessionCache {
      token: string        // session token (tid_v2_...)
      expiresAt: number    // Unix timestamp (ms)
    }
    let copilotSessionCache: CopilotSessionCache | null = null
    let exchangeInProgress: Promise<string> | null = null  // race condition 방지
    ```
  - `getCopilotSessionToken(githubToken: string): Promise<string>` 함수 추가:
    1. `exchangeInProgress` 가 있으면 그것을 반환 (동시 호출 방지)
    2. 캐시가 있고 `expiresAt - Date.now() > 5 * 60 * 1000` (5분 마진) 이면 캐시 반환
    3. 아니면 exchange: `invokeCmd("copilot_exchange_token", { githubToken })` 호출
    4. 응답에서 `token`과 `expires_at`(ISO8601 → Date.parse → ms) 파싱
    5. `copilotSessionCache` 업데이트, `exchangeInProgress = null`
    6. 실패 시 `exchangeInProgress = null` 후 throw `new Error("Copilot authentication expired. Please re-authenticate.")`
  - `fetchCopilotModels(githubToken: string)` 수정: 내부에서 `await getCopilotSessionToken(githubToken)` 호출 후 session token으로 /models fetch
  - `copilot.fetchModels(config)`: `config.githubToken`이 없으면 `return copilot.models` (fallback)
  - `copilot.buildRequest`: 
    1. 1차 시도: `await getCopilotSessionToken(config.githubToken)` 로 session token fetch 후 `Authorization: Bearer SESSION_TOKEN`으로 요청
    2. response.status === 403 이면 Plan B: `invokeCmd("copilot_chat", { sessionToken, model, systemPrompt: systemPrompt, userMessage })` 호출 후 해당 응답을 Response-like 객체로 래핑
  - `parseProviderResponse`에서 `github-copilot`은 OpenAI 포맷 (choices[0].message.content) — 변경 불필요

  **Must NOT do**:
  - `localStorage`에 session token 저장 금지
  - 다른 provider buildRequest 수정 금지
  - `ProviderDef` 인터페이스 타입 시그니처 변경 금지
  - 자동 재로그인 (OAuth device flow 재시작) 구현 금지
  - streaming 추가 금지

  **Recommended Agent Profile**:
  > - **Category**: `unspecified-high`
  >   - Reason: 비동기 캐싱, race condition 처리, Plan B fallback 분기, 기존 코드와 인터페이스 호환성 유지 필요
  > - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (with Task 4, but Task 3 is more complex)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 1, Task 2

  **References**:

  **Pattern References**:
  - `src/utils/providers.ts:303-316` — `fetchCopilotModels` 현재 구현 (수정 대상)
  - `src/utils/providers.ts:318-358` — `copilot` ProviderDef 전체 (수정 대상)
  - `src/utils/providers.ts:247-249` — COPILOT_BASE_URL, COPILOT_API_VERSION 상수
  - `src/utils/tauriBridge.ts:10-35` — `invokeCmd` 사용 패턴

  **API References**:
  - Task 1의 `copilot_exchange_token` Rust command: `invokeCmd("copilot_exchange_token", { githubToken: string })` → `{ token: string, expires_at: string }`
  - Task 2의 `copilot_chat` Rust command: `invokeCmd("copilot_chat", { sessionToken, model, systemPrompt, userMessage })` → `string` (JSON body)
  - Plan B Response 래핑 패턴: `new Response(jsonBody, { status: 200 })`

  **Acceptance Criteria**:

  ```
  Scenario: getCopilotSessionToken 함수 존재 및 캐시 로직
    Tool: Bash
    Steps:
      1. grep -n "copilotSessionCache\|exchangeInProgress\|getCopilotSessionToken" \
           /Users/seongheon/code/bootcamp/dadumi/src/utils/providers.ts
    Expected Result: 3개 변수/함수 모두 출력
    Evidence: .sisyphus/evidence/task-3-cache-logic.txt

  Scenario: Plan B fallback 코드 존재 확인
    Tool: Bash
    Steps:
      1. grep -n "copilot_chat\|status.*403\|Plan B" \
           /Users/seongheon/code/bootcamp/dadumi/src/utils/providers.ts
    Expected Result: 403 감지 + copilot_chat 호출 코드 라인 출력
    Evidence: .sisyphus/evidence/task-3-plan-b.txt

  Scenario: localStorage 저장 금지 확인
    Tool: Bash
    Steps:
      1. grep -n "localStorage.*session\|localStorage.*tid_" \
           /Users/seongheon/code/bootcamp/dadumi/src/utils/providers.ts
    Expected Result: 아무것도 출력되지 않음 (빈 결과)
    Evidence: .sisyphus/evidence/task-3-no-localstorage.txt

  Scenario: TypeScript 타입 에러 없음
    Tool: Bash
    Steps:
      1. cd /Users/seongheon/code/bootcamp/dadumi && npx tsc --noEmit 2>&1 | head -30
    Expected Result: 에러 출력 없음 (또는 기존 에러만 있고 신규 에러 없음)
    Evidence: .sisyphus/evidence/task-3-tsc.txt

  Scenario: githubToken 없을 때 graceful fallback
    Tool: Bash
    Steps:
      1. grep -n "githubToken\|return copilot.models\|return \[\]" \
           /Users/seongheon/code/bootcamp/dadumi/src/utils/providers.ts
    Expected Result: config.githubToken 체크 + fallback return 코드 존재
    Evidence: .sisyphus/evidence/task-3-fallback.txt
  ```

  **Evidence to Capture**:
  - [ ] task-3-cache-logic.txt
  - [ ] task-3-plan-b.txt
  - [ ] task-3-no-localstorage.txt
  - [ ] task-3-tsc.txt
  - [ ] task-3-fallback.txt

  **Commit**: YES (groups with Task 1, 2, 4)

---

- [ ] 4. `SettingsWindow.tsx` OAuth 완료 시 githubToken + sessionToken 분리 저장

  **What to do**:
  - `handleCopilotLogin` 함수에서 token 저장 방식 수정:
    - 현재: `setConfigField("apiKey", token)` — gho_ token을 apiKey에 저장
    - 변경: `setConfigField("githubToken", token)` — gho_ token을 githubToken 필드에 저장
    - **apiKey 필드는 비워두거나 건드리지 않음** (session token은 런타임에 getCopilotSessionToken이 채움)
  - `persistConfigField()` 호출은 유지
  - `copilot.fields` 정의를 `providers.ts`에서 수정하여 `githubToken` 필드 추가 (hidden type 또는 password):
    ```typescript
    { key: "githubToken", label: "GitHub OAuth Token", type: "password", placeholder: "Managed by OAuth login" }
    ```
  - 기존 `apiKey` 필드는 copilot provider에서 **제거** (UI에 노출 불필요 — session token은 런타임 관리)
  - `SettingsWindow.tsx`의 "GitHub Authentication" 섹션 동작 변경 없음 (UI는 동일)
  - `copilot.fetchModels(config)` 내부에서 `config.githubToken` 사용하도록 Task 3에서 처리됨

  **Must NOT do**:
  - UI 레이아웃/스타일 변경 금지
  - 다른 provider 설정 섹션 수정 금지
  - apiKey 필드를 copilot에서 완전히 삭제하지 않음 — session token용으로 유지하되 UI에서 숨김

  **Recommended Agent Profile**:
  > - **Category**: `quick`
  >   - Reason: 단일 라인 수정 (setConfigField 키 변경) + providers.ts fields 배열 수정
  > - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Task 3과 병렬 가능하나 Task 3 완료 후 통합 확인 권장)
  - **Parallel Group**: Wave 2
  - **Blocks**: F1-F4
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/components/SettingsWindow.tsx:70-92` — `handleCopilotLogin` 함수 (수정 대상: line 85)
  - `src/utils/providers.ts:318-332` — `copilot.fields` 배열 (수정 대상)
  - `src/components/SettingsWindow.tsx:275-289` — apiKey 필드 렌더링 제외 로직 (github-copilot && apiKey 필터)

  **Acceptance Criteria**:

  ```
  Scenario: githubToken 필드 저장 코드 확인
    Tool: Bash
    Steps:
      1. grep -n "githubToken\|setConfigField" \
           /Users/seongheon/code/bootcamp/dadumi/src/components/SettingsWindow.tsx
    Expected Result: setConfigField("githubToken", token) 라인 존재
    Evidence: .sisyphus/evidence/task-4-github-token.txt

  Scenario: providers.ts githubToken 필드 정의 확인
    Tool: Bash
    Steps:
      1. grep -n "githubToken" /Users/seongheon/code/bootcamp/dadumi/src/utils/providers.ts
    Expected Result: copilot fields 배열에 githubToken key 존재
    Evidence: .sisyphus/evidence/task-4-fields.txt

  Scenario: TypeScript 컴파일 성공
    Tool: Bash
    Steps:
      1. cd /Users/seongheon/code/bootcamp/dadumi && npx tsc --noEmit 2>&1 | head -20
    Expected Result: 에러 없음
    Evidence: .sisyphus/evidence/task-4-tsc.txt
  ```

  **Evidence to Capture**:
  - [ ] task-4-github-token.txt
  - [ ] task-4-fields.txt
  - [ ] task-4-tsc.txt

  **Commit**: YES (groups with Task 1, 2, 3)
  - Message: `fix(copilot): add session token exchange and plan-based model list`
  - Files: `src-tauri/src/lib.rs`, `src/utils/providers.ts`, `src/components/SettingsWindow.tsx`
  - Pre-commit: `cd src-tauri && cargo check`

---

## Final Verification Wave (MANDATORY) (MANDATORY)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file). For each "Must NOT Have": search codebase for forbidden patterns. Check that session token is NOT in localStorage. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `cargo check` in src-tauri. Review all changed files for: `unwrap()` panics, missing error handling, unused imports, `as any` casts. Check that concurrent exchange protection exists in providers.ts.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Read all modified files. Trace the full code path: OAuth login → exchange → fetchModels → buildRequest. Verify Plan B fallback path is reachable. Check session token expiry logic with mock dates.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual implementation. Verify 1:1 — nothing beyond spec was built. Check other providers untouched. Detect any ProviderDef interface changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

- **Wave 1+2**: `fix(copilot): add session token exchange and plan-based model list`
  - Files: `src-tauri/src/lib.rs`, `src/utils/providers.ts`, `src/components/SettingsWindow.tsx`

---

## Success Criteria

### Verification Commands
```bash
# Rust compile check
cd src-tauri && cargo check  # Expected: Finished (no errors)

# Session token exchange endpoint (manually with real gho_ token)
curl -s -H "Authorization: token GHO_TOKEN" \
  "https://api.github.com/copilot_internal/v2/token" \
  | jq '{token_prefix: .token[0:20], expires_at: .expires_at}'
# Expected: {"token_prefix": "tid_v2_...", "expires_at": "..."}

# Copilot models with session token
curl -s -H "Authorization: Bearer SESSION_TOKEN" \
  -H "X-GitHub-Api-Version: 2026-06-01" \
  "https://api.githubcopilot.com/models" \
  | jq '[.data[] | select(.model_picker_enabled) | .id]'
# Expected: [...list of enabled model IDs...]
```

### Final Checklist
- [ ] session token exchange Rust command 구현됨
- [ ] Plan B Rust commands 구현됨
- [ ] providers.ts session token 캐시 + 재교환 로직 구현됨
- [ ] SettingsWindow.tsx githubToken 분리 저장 구현됨
- [ ] 다른 provider 코드 미변경
- [ ] session token localStorage 저장 없음
