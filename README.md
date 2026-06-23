# Dadumi

**Dadumi**는 백그라운드에서 네이티브로 실행되는 크로스 플랫폼(Windows & macOS & Linux) 데스크탑 글쓰기 어시스턴트입니다.

## 설치

### macOS

터미널에 한 줄 붙여넣기:

```bash
curl -fsSL https://raw.githubusercontent.com/c1adumi/dadumi/main/scripts/install.sh | bash
```

수동 설치가 필요하면 [Releases](https://github.com/c1adumi/dadumi/releases)에서 `.dmg` 파일을 다운로드하세요.

> **주의**: 코드 사이닝이 적용되지 않아 처음 실행 시 "개발자를 확인할 수 없습니다" 경고가 뜹니다.
> Finder에서 앱을 **우클릭 → 열기** 하면 한 번만 허용하면 됩니다.

**macOS 삭제**

```bash
curl -fsSL https://raw.githubusercontent.com/c1adumi/dadumi/main/scripts/uninstall.sh | bash
```

또는 수동으로:

```bash
rm -rf /Applications/Dadumi.app
rm -rf ~/Library/Application\ Support/com.gayeonlee.dadumi
rm -rf ~/Library/Logs/com.gayeonlee.dadumi
rm -rf ~/Library/WebKit/com.gayeonlee.dadumi
```

---

### Windows

PowerShell을 **관리자 권한**으로 열고 한 줄 붙여넣기:

```powershell
irm https://raw.githubusercontent.com/c1adumi/dadumi/main/scripts/install.ps1 | iex
```

수동 설치가 필요하면 [Releases](https://github.com/c1adumi/dadumi/releases)에서 `.msi` 파일을 다운로드하세요.

**Windows 삭제**

```powershell
irm https://raw.githubusercontent.com/c1adumi/dadumi/main/scripts/uninstall.ps1 | iex
```

또는 수동으로:

```powershell
Get-Package -Name "Dadumi" | Uninstall-Package
Remove-Item -Recurse -Force "$env:APPDATA\com.gayeonlee.dadumi"
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\com.gayeonlee.dadumi"
```

---

### Linux

터미널에 한 줄 붙여넣기:

```bash
curl -fsSL https://raw.githubusercontent.com/c1adumi/dadumi/main/scripts/install.sh | bash
```

수동 설치가 필요하면 [Releases](https://github.com/c1adumi/dadumi/releases)에서 `.deb` 또는 `.AppImage` 파일을 다운로드하세요.

**Linux 삭제**

```bash
curl -fsSL https://raw.githubusercontent.com/c1adumi/dadumi/main/scripts/uninstall.sh | bash
```

또는 수동으로:

```bash
# .deb 로 설치한 경우
sudo dpkg -r dadumi

# .AppImage 로 설치한 경우
rm Dadumi_*.AppImage
rm -rf ~/.local/share/com.gayeonlee.dadumi
rm -rf ~/.config/com.gayeonlee.dadumi
rm -rf ~/.cache/com.gayeonlee.dadumi
```

---

## 릴리즈 방법 (개발자용)

```bash
# 1. 3개 파일 버전 통일 (package.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml)
# 2. 커밋
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "chore: bump version to x.y.z"
git push origin main

# 3. 태그 push → GitHub Actions 자동 빌드 + Release 생성
git tag vx.y.z
git push origin vx.y.z
```

---

# In-Line AI: 복사-붙여넣기 없는 사내 AI 통합 글쓰기 어시스턴트

**In-Line AI**는 백그라운드에서 네이티브로 실행되는 크로스 플랫폼(Windows & macOS) 데스크톱 글쓰기 어시스턴트입니다. 사용자가 텍스트 입력이 가능한 모든 환경(Slack, Notion, Chrome, MS Word, 메모장 등)에서 AI를 직접 호출하고, 현재 선택한 텍스트를 읽고, AI 완성을 스트리밍하고, 결과를 자동으로 다시 붙여넣을 수 있도록 하여 수동으로 복사하고 붙여넣는 번거로운 과정을 완전히 없애줍니다.

---

## 1. 핵심 기술 목표
다음 에이전트는 아래와 같이 작동하는 프로토타입을 구축해야 합니다:
1. 전역 단축키(`macOS`에서는 `Option + Space`, `Windows`에서는 `Alt + Space`)를 감지합니다.
2. 현재 활성화된 애플리케이션에서 선택된(블록 지정된) 텍스트를 캡처합니다.
3. 텍스트 커서(캐럿) 바로 아래에 반투명 유리 형태(glassmorphic)의 플로팅 오버레이 메뉴를 띄웁니다.
4. Gemini API(또는 다른 LLM)를 호출하고 응답 텍스트를 실시간으로 스트리밍합니다.
5. 선택된 완성 텍스트를 원래 애플리케이션의 커서 위치에 다시 삽입합니다.

---

## 2. 선택된 기술 스택
- **프레임워크**: Tauri v2 (Rust 백엔드, 웹뷰 기반 프론트엔드).
- **백엔드 (OS 연동)**: Rust (Windows에서는 `windows` / `windows-sys`, macOS에서는 `cocoa` / `objc` 사용).
- **프론트엔드 (오버레이 UI)**: React + TypeScript.
- **스타일링**: Tailwind CSS + Custom CSS (Windows의 경우 Acrylic blur, macOS의 경우 Vibrancy 적용).
- **API**: Gemini API (토큰 스트리밍 지원).

---

## 3. 네이티브 OS 통합 전략

### A. 컨텍스트 읽기 및 쓰기
대상 애플리케이션이 다양하므로(네이티브 앱, Electron 앱, 웹뷰 등), 2단계 접근 방식이 필요합니다:
1. **기본 방식**: 플랫폼 네이티브 접근성 컴포넌트(macOS Accessibility API `AXUIElement` / Windows UI Automation API `UIA`)에 접근하여 텍스트 선택 영역을 가져오고 수정합니다.
2. **안정적인 대체 방식 (데모 구현 필수)**: 클립보드 및 키 입력 에뮬레이션:
   - 사용자의 현재 클립보드 데이터를 임시로 저장합니다.
   - 가상 키보드 이벤트를 통해 `Ctrl + C`(Windows) 또는 `Cmd + C`(macOS)를 전송합니다.
   - 시스템 클립보드에서 복사된 텍스트를 읽어옵니다.
   - AI로 텍스트를 처리합니다.
   - AI 응답을 클립보드에 설정한 다음 `Ctrl + V`(Windows) 또는 `Cmd + V`(macOS)를 보내 붙여넣습니다.
   - 사용자의 원래 클립보드 데이터를 즉시 복원합니다.

### B. 오버레이 메뉴 위치 제어 (캐럿 추적)
- **Windows**: Win32 `GetGUIThreadInfo` API를 사용하여 포커스된 창에서 `rcCaret` 좌표를 검색한 다음, `ClientToScreen`을 사용해 화면 좌표로 매핑합니다. 캐럿 좌표를 사용할 수 없는 경우 마우스 좌표(`GetCursorPos`)를 대안으로 사용합니다.
- **macOS**: `kAXTextBoundsForRangeParameterizedAttribute`와 같은 접근성 API 매개변수를 사용하여 선택한 텍스트 블록의 경계를 찾습니다. 대안으로 마우스 커서 좌표 추적을 사용합니다.

---

## 4. 제안된 프로젝트 구조

이 디렉토리 내에 다음 폴더 구조를 사용하여 프로젝트를 구축합니다:

```
dadumi/
├── src-tauri/                       # Rust 네이티브 백엔드
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs                  # 앱 설정, Tauri 빌더 및 IPC 명령 매핑
│       ├── os_integration/          # OS별 연동 훅
│       │   ├── mod.rs               # 통합 OS 인터페이스
│       │   ├── windows.rs           # Windows Win32 캐럿, SendInput 및 클립보드 훅
│       │   └── macos.rs             # macOS AXUIElement 및 Cocoa API 훅
│       └── llm.rs                   # LLM 클라이언트 및 스트리밍 도우미
│
├── src/                             # React 프론트엔드 UI
│   ├── main.tsx
│   ├── App.tsx                      # 기본 앱 레이아웃 및 키 입력 감지
│   ├── components/
│   │   └── FloatingMenu.tsx         # 유리 형태(glassmorphic)의 플로팅 UI 패널
│   └── styles/
│       └── index.css                # 시각적 테마 토큰 (반투명 블러, 로딩 상태 등)
```

---

## 5. 다음 에이전트를 위한 단계별 구현 가이드

이 프로젝트의 구현을 시작하기 위한 상세 로드맵입니다:

### 1단계: Tauri 프로젝트 초기화
Tauri의 비대화형(non-interactive) 생성기를 사용하여 프로젝트 디렉토리에서 초기화 명령을 실행합니다:
```bash
npx -y create-tauri-app@latest ./ --alpha --template react-ts --manager npm --force
```

### 2단계: Rust OS 핸들러 구현 (`src-tauri/src/os_integration`)
클립보드 프록시 읽기 및 쓰기를 처리할 OS 래퍼를 생성합니다. Rust 함수가 조건부 컴파일(`#[cfg(target_os = "windows")]` 및 `#[cfg(target_os = "macos")]`)되도록 구성합니다.
- `Cargo.toml`에 `arboard`(클립보드 관리용) 및 `enigo`(키보드 에뮬레이션용) 크레이트를 추가합니다.
- 창 정렬을 위한 좌표 오프셋을 계산하는 `get_caret_position`을 구현합니다.

### 3단계: 플로팅 UI 스타일링 구현 (`src/styles/index.css`)
고급스러운 블러 효과 위주의 디자인을 적용합니다.
- Windows: Tauri 플러그인 또는 네이티브 API 바인딩을 사용하여 **Acrylic** 배경을 활성화합니다.
- macOS: 네이티브 창 시각 효과인 Vibrancy를 적용합니다.
- 웹 대체(Fallback): `backdrop-filter: blur(20px)`와 어두운 반투명 오버레이로 카드를 스타일링합니다.

### 4단계: Tauri IPC 명령 연결
React UI를 Tauri 백엔드 이벤트와 연결합니다:
- 전역 단축키가 트리거되면 Tauri 백엔드는 다음을 수행합니다:
  1. 선택된 텍스트와 캐럿 좌표를 가져옵니다.
  2. 오버레이 창을 캐럿 좌표 위치로 이동시킵니다.
  3. 창을 표시하고 React UI에 텍스트를 전달합니다.
- React UI는 LLM 스트리밍 엔드포인트를 호출하여 완성 옵션을 표시하고, 사용자가 선택하면 Tauri IPC 명령을 트리거하여 최종 텍스트를 원래 위치에 붙여넣습니다.
