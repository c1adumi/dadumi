export type Language = "en" | "ko"

export const translations = {
  en: {
    presets: {
      grammar: "Fix Grammar",
      improve: "Improve Writing",
      professional: "Professional Tone",
      continue: "Continue Writing",
      translate: "Translate to Korean",
    },
    settings: {
      title: "Configuration",
      provider: "AI Provider",
      model: "Model",
      systemPrompt: "System Instructions",
      systemPromptPlaceholder: "Enter system instructions...",
      translatePrompt: "Translate to Korean",
      language: "Language",
      confirm: "Confirm",
      loadingModels: "Loading models...",
      translating: "Translating...",
      insertShortcut: "Insert Shortcut",
      insertShortcutDesc: "Key to press with Ctrl (Win) / Cmd (Mac)",
      insertShortcutPlaceholder: "e.g. Enter, z, j",
      triggerMode: "Trigger Mode",
      triggerModeDesc: "Auto: runs AI immediately on hotkey. Manual: select a preset first.",
      triggerManual: "Manual",
      triggerAuto: "Auto",
    },
    main: {
      customPlaceholder: "Custom instruction...",
      configureSettings: "Configure Settings",
      aiOutput: "AI Output",
      stop: "Stop",
      copy: "Copy",
      copied: "Copied!",
      insertReplace: "Insert\n(Replace)",
    },
  },
  ko: {
    presets: {
      grammar: "문법 수정",
      improve: "글 다듬기",
      professional: "전문적 말투",
      continue: "이어 쓰기",
      translate: "영어로 번역",
    },
    settings: {
      title: "설정",
      provider: "AI 공급자",
      model: "모델",
      systemPrompt: "시스템 지침",
      systemPromptPlaceholder: "시스템 지침을 입력하세요...",
      translatePrompt: "영어로 번역",
      language: "언어",
      confirm: "확인",
      loadingModels: "모델 불러오는 중...",
      translating: "번역 중...",
      insertShortcut: "삽입 단축키",
      insertShortcutDesc: "Ctrl (Win) / Cmd (Mac) 과 함께 누를 키",
      insertShortcutPlaceholder: "예) Enter, z, j",
      triggerMode: "실행 모드",
      triggerModeDesc: "자동: 단축키 누르면 바로 AI 실행. 수동: 프리셋 먼저 선택.",
      triggerManual: "수동",
      triggerAuto: "자동",
    },
    main: {
      customPlaceholder: "직접 입력...",
      configureSettings: "설정",
      aiOutput: "AI 출력",
      stop: "중지",
      copy: "복사",
      copied: "복사됨!",
      insertReplace: "삽입 / 교체",
    },
  },
} as const

export type T = typeof translations.en | typeof translations.ko

export function t(lang: Language): T {
  return translations[lang]
}
