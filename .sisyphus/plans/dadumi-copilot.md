# GitHub Copilot Provider 연동

## TL;DR

> **Quick Summary**: dadumi Tauri 앱에 GitHub Copilot을 모델 서플라이어로 추가한다. OAuth Device Flow 인증 + 동적 모델 로딩 + chat completions API 연동이 핵심이다.
>
> **Deliverables**:
> - `src/utils/providers.ts` — `github-copilot` ProviderDef 추가 (OAuth Device Flow + fetchModels + buildRequest)
> - `src-tauri/` — `plugin-shell` 추가 (Cargo.toml, tauri.conf.json)
> - `src/components/SettingsWindow.tsx` — Copilot 전용 OAuth 로그인 UI (조건부 렌더링)
> - `src/utils/settings.ts` — `ProviderID`에 `"github-copilot"` 추가
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 (Tauri shell) → Task 2 (providers.ts) → Task 3 (SettingsWindow UI)

---

## Context

### Original Request
dadumi에 GitHub Copilot 모델 서플라이어를 추가한다. `/Users/seongheon/code/opencode`를 참고하되, dadumi의 기존 provider 패턴에 맞게 구현한다.

### Key Decisions
- **CLIENT_ID**: dadumi 전용 GitHub OAuth App 등록 필요 — 플랜 Task 1에서 placeholder 처리, 실제 등록은 사용자가 직접
- **브라우저 열기**: `@tauri-apps/plugin-shell` 사용 (`open()` API)
- **인증 방식**: OAuth Device Flow (opencode 참고)
- **토큰 저장**: 기존과 동일하게 `localStorage` → `config.apiKey` key 이름으로 저장
- **응답 파싱**: Copilot은 OpenAI-compatible → 기존 fallback `choices[0].message.content` 그대로 사용 (분기 추가 불필요)
- **ProviderDef 인터페이스 변경 없음**: 기존 interface 유지, Copilot 로직은 내부에 캡슐화

### Research Findings (opencode 참고)
- 인증 엔드포인트: `https://github.com/login/device/code`, `https://github.com/login/oauth/access_token`
- Chat API: `https://api.githubcopilot.com/chat/completions` (OpenAI-compatible)
- 모델 목록: `GET https://api.githubcopilot.com/models` (Bearer token)
- 필수 헤더: `Authorization: Bearer {token}`, `Editor-Version: vscode/1.85.0`, `Copilot-Integration-Id: vscode-chat`, `X-GitHub-Api-Version: 2026-06-01`
- scope: `read:user`

### Metis Review — Identified Gaps (resolved)
- **CLIENT_ID 소유권**: dadumi 전용 OAuth App 등록으로 해결 (placeholder `DADUMI_GITHUB_CLIENT_ID` 사용)
- **브라우저 열기**: shell 플러그인으로 해결
- **`fetchModels` 트리거**: Copilot 토큰을 `config.apiKey` key로 저장하여 기존 `!config.apiKey` 조건과 호환
- **`parseProviderResponse`**: OpenAI fallback이 그대로 동작 → 분기 추가 불필요
- **ProviderDef 인터페이스 불변**: 필드 타입에 OAuth 버튼 없음 → SettingsWindow에서 조건부 렌더링으로 처리
- **폴링 AbortController**: useEffect cleanup에서 중단

---

## Work Objectives

### Core Objective
dadumi의 기존 `ProviderDef` 패턴을 유지하면서 GitHub Copilot provider를 추가한다. 사용자가 Settings에서 OAuth 로그인 → 모델 선택 → 채팅 사용까지 전체 흐름이 동작해야 한다.

### Concrete Deliverables
- `src/utils/providers.ts` — `github-copilot` provider 구현체
- `src-tauri/Cargo.toml` — plugin-shell 의존성
- `src-tauri/tauri.conf.json` — shell 플러그인 허용 설정
- `src/components/SettingsWindow.tsx` — OAuth 로그인 버튼 UI (조건부)
- `src/utils/settings.ts` — ProviderID union 업데이트

### Definition of Done
- [ ] `github-copilot` provider가 PROVIDERS 배열에 포함됨
- [ ] Settings에서 "GitHub Copilot" 탭이 나타남
- [ ] "Login with GitHub" 버튼 클릭 시 device_code flow 시작
- [ ] user_code가 UI에 표시되고, 브라우저가 verification_uri로 열림
- [ ] GitHub 인증 완료 후 토큰 저장 및 모델 목록 로딩
- [ ] 모델 선택 후 chat completions API 호출이 정상 동작

### Must Have
- OAuth Device Flow 전체 흐름 (device_code → polling → token 저장)
- 동적 모델 목록 fetch (`GET /models`)
- `buildRequest`가 Copilot chat completions API 호출
- Settings 창에서 OAuth 버튼 (토큰 없을 때: "Login", 있을 때: "Re-authenticate")
- Device Flow 폴링이 Settings 창 닫힐 때 중단
- Tauri shell 플러그인으로 OS 기본 브라우저 열기

### Must NOT Have (Guardrails)
- `ProviderDef` 인터페이스 수정 금지 (fields/models/fetchModels?/buildRequest 구조 유지)
- `SettingsContext.tsx`의 `fetchModels` 트리거 조건(`!config.apiKey`) 수정 금지
- `parseProviderResponse`에 `github-copilot` 분기 추가 금지 (OpenAI fallback 사용)
- 기존 5개 provider (openai/anthropic/gemini/bedrock/openrouter/custom) 코드 수정 금지
- 스트리밍(SSE) 구현 금지
- `localStorage` 저장 방식 변경 금지 (암호화, Tauri store 등)
- 다중 GitHub 계정 지원 금지
- Settings 창 크기 변경 금지 (`420×500`)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: NO
- **Automated tests**: None
- **Agent-Executed QA**: ALWAYS (mandatory for all tasks)

### QA Policy
- **UI**: Playwright — 브라우저에서 Settings 창 열기, 버튼 클릭, 상태 확인
- **API/Network**: Bash (curl) — 실제 Copilot API 헤더/응답 검증
- **Build**: Bash — `npm run build` 통과 여부

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (독립적으로 동시 실행):
├── Task 1: Tauri shell 플러그인 설정 [quick]
└── Task 2: providers.ts + settings.ts — Copilot provider 구현 [unspecified-high]

Wave 2 (Wave 1 완료 후):
└── Task 3: SettingsWindow.tsx — OAuth 로그인 UI 추가 [unspecified-high]
         (depends: Task 1 shell API, Task 2 provider 타입)

Wave FINAL (구현 완료 후):
├── F1: Build 검증 + 타입체크 [quick]
└── F2: 코드 품질 리뷰 [oracle]
```

### Dependency Matrix
- **Task 1**: 독립 → blocks Task 3 (shell import 사용)
- **Task 2**: 독립 → blocks Task 3 (ProviderID 타입, provider 객체)
- **Task 3**: depends Task 1, Task 2
- **F1, F2**: depends Task 3

### Agent Dispatch
- Wave 1: 2 tasks (quick + unspecified-high) — 동시 실행
- Wave 2: 1 task (unspecified-high)
- Final: 2 tasks (quick + oracle)

---

## TODOs

- [ ] 1. Tauri shell 플러그인 설치 및 설정

  **What to do**:
  - `src-tauri/Cargo.toml`의 `[dependencies]` 섹션에 `tauri-plugin-shell = "2"` 추가
  - `src-tauri/src/lib.rs`의 `tauri::Builder::default()` 체인에 `.plugin(tauri_plugin_shell::init())` 추가 (`.plugin(tauri_plugin_global_shortcut::Builder::new()...` 앞에 삽입)
  - `lib.rs` 상단에 `use tauri_plugin_shell::ShellExt;` 추가 (open_url 호출용)
  - `src-tauri/capabilities/default.json`의 `permissions` 배열에 `"shell:allow-open"` 추가
  - `src/utils/tauriBridge.ts`에 `openUrl(url: string)` 함수 추가:
    ```ts
    export async function openUrl(url: string): Promise<void> {
      if (!isTauri()) { window.open(url, "_blank"); return; }
      const { open } = await import("@tauri-apps/plugin-shell");
      await open(url);
    }
    ```
  - `npm install @tauri-apps/plugin-shell` 실행 (`package.json`에 추가)

  **Must NOT do**:
  - `lib.rs`의 기존 command handler 목록(`invoke_handler`) 수정 금지 — shell 플러그인은 자동 등록됨
  - Rust에서 별도 `open_url` command 추가 금지 — JS SDK가 직접 처리

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 파일 3개 수정, npm install 1개, 패턴이 명확함
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (Task 2와 동시)
  - **Blocks**: Task 3 (SettingsWindow에서 `openUrl` import)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src-tauri/src/lib.rs:199-251` — 기존 plugin 등록 패턴 (`tauri_plugin_global_shortcut::Builder`)
  - `src-tauri/capabilities/default.json` — permission 추가 위치
  - `src/utils/tauriBridge.ts` — 기존 `isTauri()` 함수 패턴 참고, 같은 파일에 `openUrl` 추가

  **External References**:
  - https://tauri.app/plugin/shell/ — Tauri v2 shell 플러그인 공식 docs (open API)

  **Acceptance Criteria**:

  **QA Scenarios**:
  ```
  Scenario: npm build 통과
    Tool: Bash
    Steps:
      1. npm run build 실행
    Expected Result: exit code 0, TypeScript 에러 없음
    Evidence: .sisyphus/evidence/task-1-build.txt

  Scenario: tauriBridge.ts에 openUrl 존재
    Tool: Bash
    Steps:
      1. grep "openUrl" src/utils/tauriBridge.ts
    Expected Result: 함수 정의 1개 이상 매칭
    Evidence: .sisyphus/evidence/task-1-openurl.txt
  ```

  **Commit**: YES (Task 2와 함께)
  - Message: `feat(tauri): add shell plugin for browser open`
  - Files: `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`, `src/utils/tauriBridge.ts`, `package.json`

---

- [ ] 2. providers.ts + settings.ts — GitHub Copilot ProviderDef 구현

  **What to do**:

  **`src/utils/settings.ts`**:
  - `ProviderID` union에 `"github-copilot"` 추가

  **`src/utils/providers.ts`**:
  - `ProviderID` union에 `"github-copilot"` 추가 (settings.ts와 동일하게)
  - 상수 추가:
    ```ts
    const COPILOT_CLIENT_ID = "DADUMI_GITHUB_CLIENT_ID" // TODO: dadumi 전용 OAuth App 등록 후 교체
    const COPILOT_DEVICE_CODE_URL = "https://github.com/login/device/code"
    const COPILOT_TOKEN_URL = "https://github.com/login/oauth/access_token"
    const COPILOT_BASE_URL = "https://api.githubcopilot.com"
    const COPILOT_API_VERSION = "2026-06-01"
    const COPILOT_POLL_SAFETY_MARGIN_MS = 3000
    ```
  - `copilotOAuthFlow()` 헬퍼 함수 구현 (아래 참고):
    - POST `COPILOT_DEVICE_CODE_URL` → `{ device_code, user_code, verification_uri, interval }` 반환
    - 반환값: `{ userCode, verificationUri, poll: () => Promise<string | null> }`
    - `poll()` 내부: POST `COPILOT_TOKEN_URL` polling, `authorization_pending` → 대기, `slow_down` → 간격 증가, `access_token` → 반환, 에러 → null 반환
    - polling 간격: `interval * 1000 + COPILOT_POLL_SAFETY_MARGIN_MS`
    - poll은 AbortSignal 파라미터 받아서 abort 시 null 반환
  - `fetchCopilotModels(token: string)` 함수: GET `${COPILOT_BASE_URL}/models` → `ModelDef[]` 반환
    - response가 ok가 아니면 빈 배열 반환
    - 응답 파싱: `data.data` 배열에서 `model_picker_enabled: true`인 항목만 필터
    - `ModelDef` 형태: `{ id: item.id, label: item.name }`
  - `copilot: ProviderDef` 구현:
    ```ts
    export const copilot: ProviderDef = {
      id: "github-copilot",
      label: "GitHub Copilot",
      fields: [
        // apiKey key 이름 필수 — SettingsContext fetchModels 트리거 조건과 호환
        { key: "apiKey", label: "Access Token", type: "password", placeholder: "Managed by OAuth login" }
      ],
      models: [
        // fallback 모델 (fetchModels 실패 시)
        { id: "gpt-4o", label: "GPT-4o (fallback)" },
        { id: "claude-3.5-sonnet", label: "Claude 3.5 Sonnet (fallback)" },
      ],
      async fetchModels(config) {
        if (!config.apiKey) return copilot.models
        return fetchCopilotModels(config.apiKey)
      },
      buildRequest(config, model, systemPrompt, userMessage, signal) {
        return fetch(`${COPILOT_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${config.apiKey}`,
            "Editor-Version": "vscode/1.85.0",
            "Copilot-Integration-Id": "vscode-chat",
            "X-GitHub-Api-Version": COPILOT_API_VERSION,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userMessage },
            ],
          }),
          signal,
        })
      },
    }
    ```
  - `PROVIDERS` 배열에 `copilot` 추가 (기존 `custom` 앞에)
  - `copilotOAuthFlow` export (SettingsWindow에서 import해서 사용)

  **Must NOT do**:
  - `ProviderDef` 인터페이스 구조 변경 금지
  - `parseProviderResponse`에 `github-copilot` 분기 추가 금지
  - 기존 provider 객체 수정 금지

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: OAuth polling 로직, AbortSignal 처리, 모델 파싱 등 복합 구현
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (Task 1과 동시)
  - **Blocks**: Task 3 (ProviderID 타입, copilotOAuthFlow 함수)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/utils/providers.ts:159-199` — `bedrock` provider의 `fetchModels` 패턴 (동적 모델 로딩 참고)
  - `src/utils/providers.ts:38-68` — `openai` buildRequest 패턴 (headers 구조)
  - `src/utils/providers.ts:297-315` — `parseProviderResponse` — copilot 분기 추가하지 말 것, OpenAI fallback이 그대로 동작

  **opencode 참고**:
  - `/Users/seongheon/code/opencode/packages/opencode/src/plugin/github-copilot/copilot.ts:234-335` — Device Flow 전체 구현 (device_code 요청 → polling → token 반환)
  - `/Users/seongheon/code/opencode/packages/opencode/src/plugin/github-copilot/copilot.ts:308-331` — `slow_down` / `authorization_pending` 처리 패턴
  - `/Users/seongheon/code/opencode/packages/opencode/src/plugin/github-copilot/models.ts:201-243` — `/models` 엔드포인트 응답 파싱 (`model_picker_enabled` 필터링)

  **Acceptance Criteria**:

  **QA Scenarios**:
  ```
  Scenario: ProviderID에 github-copilot 포함
    Tool: Bash
    Steps:
      1. grep '"github-copilot"' src/utils/providers.ts
    Expected Result: 1개 이상 매칭
    Evidence: .sisyphus/evidence/task-2-providerid.txt

  Scenario: PROVIDERS 배열에 copilot 등록
    Tool: Bash
    Steps:
      1. node -e "import('./src/utils/providers.ts').then(m => console.log(m.PROVIDERS.map(p=>p.id)))"
         또는 grep으로 "PROVIDERS" 배열에 copilot 있는지 확인
    Expected Result: "github-copilot" 포함
    Evidence: .sisyphus/evidence/task-2-providers-array.txt

  Scenario: TypeScript 타입 에러 없음
    Tool: Bash
    Steps:
      1. npm run build
    Expected Result: exit 0
    Evidence: .sisyphus/evidence/task-2-build.txt

  Scenario: copilotOAuthFlow export 확인
    Tool: Bash
    Steps:
      1. grep "export.*copilotOAuthFlow" src/utils/providers.ts
    Expected Result: export 문 매칭
    Evidence: .sisyphus/evidence/task-2-export.txt
  ```

  **Commit**: YES (Task 1과 함께)
  - Message: `feat(providers): add github-copilot provider with oauth device flow`
  - Files: `src/utils/providers.ts`, `src/utils/settings.ts`

---

- [ ] 3. SettingsWindow.tsx — OAuth 로그인 UI 추가

  **What to do**:
  - `copilotOAuthFlow` import 추가: `import { ..., copilotOAuthFlow } from "../utils/providers";`
  - `openUrl` import 추가: `import { ..., openUrl } from "../utils/tauriBridge";`
  - state 추가:
    ```ts
    const [copilotStatus, setCopilotStatus] = useState<"idle" | "pending" | "success" | "error">("idle")
    const [copilotUserCode, setCopilotUserCode] = useState<string | null>(null)
    const abortRef = useRef<AbortController | null>(null)
    ```
  - `useEffect` cleanup 추가:
    ```ts
    useEffect(() => {
      return () => { abortRef.current?.abort() }
    }, [])
    ```
  - `handleCopilotLogin` 핸들러:
    ```ts
    const handleCopilotLogin = async () => {
      abortRef.current?.abort()
      const abort = new AbortController()
      abortRef.current = abort
      setCopilotStatus("pending")
      try {
        const flow = await copilotOAuthFlow()
        setCopilotUserCode(flow.userCode)
        await openUrl(flow.verificationUri)
        const token = await flow.poll(abort.signal)
        if (!token) { setCopilotStatus("error"); return }
        setConfigField("apiKey", token)
        persistConfigField()
        setCopilotStatus("success")
        setCopilotUserCode(null)
      } catch {
        setCopilotStatus("error")
      }
    }
    ```
  - JSX에 Copilot 전용 섹션 추가 — **기존 `fields.map()` 렌더링 루프 위에** 조건부 렌더링:
    ```tsx
    {settings.activeProvider === "github-copilot" && (
      <div className="settings-section">
        <label className="form-label">GitHub Copilot 인증</label>
        {copilotStatus === "pending" && copilotUserCode && (
          <p className="form-hint">
            브라우저에서 코드를 입력하세요: <strong>{copilotUserCode}</strong>
          </p>
        )}
        {copilotStatus === "error" && (
          <p className="form-hint" style={{ color: "var(--color-error, #f87171)" }}>
            인증에 실패했습니다. 다시 시도해주세요.
          </p>
        )}
        {copilotStatus === "success" && (
          <p className="form-hint" style={{ color: "var(--color-success, #4ade80)" }}>
            인증 완료! 모델 목록을 불러오는 중...
          </p>
        )}
        <button
          className="btn btn-secondary"
          onClick={handleCopilotLogin}
          disabled={copilotStatus === "pending"}
        >
          {copilotStatus === "pending"
            ? "인증 대기 중..."
            : activeProviderSettings.config.apiKey
              ? "Re-authenticate"
              : "Login with GitHub"}
        </button>
      </div>
    )}
    ```
  - **기존 `fields.map()` 렌더링**: Copilot의 `apiKey` 필드는 OAuth로 관리되므로 숨김 처리:
    ```tsx
    {activeProviderDef.fields
      .filter(field => !(settings.activeProvider === "github-copilot" && field.key === "apiKey"))
      .map(field => (
        // 기존 렌더링 코드 그대로
      ))
    }
    ```

  **Must NOT do**:
  - SettingsWindow 창 크기 변경 금지 (420×500)
  - 기존 provider의 fields 렌더링 로직 변경 금지 (filter만 추가)
  - `SettingsContext.tsx` 수정 금지
  - `persistConfigField` 외의 저장 경로 사용 금지

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: async 상태 관리, AbortController cleanup, 조건부 렌더링 복합 구현
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (단독)
  - **Blocks**: Final verification
  - **Blocked By**: Task 1 (openUrl), Task 2 (copilotOAuthFlow, ProviderID)

  **References**:

  **Pattern References**:
  - `src/components/SettingsWindow.tsx:57-84` — `handleTranslate` 패턴 (async 핸들러, isTranslating 상태 관리)
  - `src/components/SettingsWindow.tsx:207-219` — 기존 `fields.map()` 렌더링 (filter 추가할 위치)
  - `src/components/SettingsWindow.tsx:163-176` — provider 탭 렌더링 (조건부 렌더링 위치 참고)
  - `src/utils/tauriBridge.ts` — `isTauri()` 패턴 (openUrl 함수 위치)

  **Type References**:
  - `src/utils/providers.ts:copilotOAuthFlow` — `{ userCode: string, verificationUri: string, poll: (signal: AbortSignal) => Promise<string | null> }` 반환 타입
  - `src/context/SettingsContext.tsx:setConfigField, persistConfigField` — 토큰 저장 방법

  **Acceptance Criteria**:

  **QA Scenarios**:
  ```
  Scenario: GitHub Copilot 탭에서 OAuth 버튼 표시
    Tool: Playwright
    Preconditions: npm run dev 실행, Settings 창 열기
    Steps:
      1. navigate to http://localhost:1420/#/settings (또는 Settings 창)
      2. "GitHub Copilot" provider 탭 클릭 (selector: button.provider-tab:has-text("GitHub Copilot"))
      3. "Login with GitHub" 버튼 존재 확인 (selector: button:has-text("Login with GitHub"))
    Expected Result: 버튼이 DOM에 존재하고 disabled 아님
    Evidence: .sisyphus/evidence/task-3-oauth-button.png

  Scenario: 다른 provider 선택 시 OAuth 버튼 미표시
    Tool: Playwright
    Preconditions: 위와 동일
    Steps:
      1. "OpenAI" provider 탭 클릭
      2. "Login with GitHub" 버튼 없음 확인
    Expected Result: button:has-text("Login with GitHub") 요소가 DOM에 없음
    Evidence: .sisyphus/evidence/task-3-no-oauth-button.png

  Scenario: 토큰 있을 때 "Re-authenticate" 표시
    Tool: Playwright
    Preconditions: localStorage에 dadumi_settings에 github-copilot config.apiKey가 "test-token"으로 저장
    Steps:
      1. Settings 창에서 GitHub Copilot 탭 선택
      2. 버튼 텍스트 확인
    Expected Result: "Re-authenticate" 텍스트
    Evidence: .sisyphus/evidence/task-3-reauth.png

  Scenario: TypeScript 에러 없음
    Tool: Bash
    Steps:
      1. npm run build
    Expected Result: exit 0
    Evidence: .sisyphus/evidence/task-3-build.txt
  ```

  **Commit**: YES
  - Message: `feat(settings): add github copilot oauth login ui`
  - Files: `src/components/SettingsWindow.tsx`
  - Pre-commit: `npm run build`

---

## Final Verification Wave

- [ ] F1. **Build 검증** — `quick`
  `npm run build` 실행 후 TypeScript 에러 0개, build 성공 확인.
  Output: `Build [PASS/FAIL] | TypeErrors [N] | VERDICT`

- [ ] F2. **코드 품질 리뷰** — `oracle`
  변경된 파일 전체 리뷰: ProviderDef 인터페이스 불변 확인, 기존 provider 코드 미변경 확인, `parseProviderResponse` 분기 미추가 확인, AbortController cleanup 존재 확인, `config.apiKey` key 이름 일관성 확인.
  Output: `Guardrails [N/N] | Code Quality [PASS/FAIL] | VERDICT`

---

## Commit Strategy

- **Task 1+2**: `feat(providers): add tauri shell plugin and github-copilot provider`
- **Task 3**: `feat(settings): add github copilot oauth login ui`

---

## Success Criteria

### Verification Commands
```bash
# TypeScript 컴파일 오류 없음
npm run build  # Expected: Build succeeded

# providers.ts에 github-copilot 존재
grep "github-copilot" src/utils/providers.ts  # Expected: match found

# SettingsWindow에 OAuth 버튼 존재
grep "Login with GitHub" src/components/SettingsWindow.tsx  # Expected: match found
```

### Final Checklist
- [ ] `ProviderID`에 `"github-copilot"` 추가됨
- [ ] `PROVIDERS` 배열에 copilot provider 등록됨
- [ ] Tauri shell 플러그인 설치됨 (Cargo.toml + tauri.conf.json)
- [ ] OAuth 버튼이 `settings.activeProvider === "github-copilot"`일 때만 표시됨
- [ ] 폴링 AbortController가 useEffect cleanup에서 abort됨
- [ ] `parseProviderResponse`에 copilot 분기 없음 (OpenAI fallback 사용)
- [ ] 기존 provider 코드 무변경
