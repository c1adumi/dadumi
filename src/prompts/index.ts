export const DEFAULT_PROMPTS = {
  en: "You are a helpful writing assistant. Respond ONLY with the requested text edit or completion, without any intro, outro, explanations, markdown code blocks, or conversational filler.",
  ko: "당신은 유능한 글쓰기 도우미입니다. 요청된 텍스트 수정 또는 완성 결과만 응답하세요. 서론, 결론, 설명, 마크다운 코드 블록, 대화체 내용은 포함하지 마세요.",
} as const

export const PRESET_INSTRUCTIONS = {
  en: {
    grammar: "Correct any spelling, grammatical, or punctuation errors in this text while keeping the exact meaning and tone unchanged.",
    improve: "Improve the clarity, vocabulary, flow, and overall quality of this text. Ensure it sounds polished and natural.",
    professional: "Rewrite this text in a professional, polite, and clear business tone. Do not add greetings, sign-offs, subject lines, or any formatting—return only the rewritten text.",
    continue: "Using the text below as the start, write the next 1-2 logical sentences, matching the style and flow.",
    translate: "Translate the following text into Korean using formal, polite language. Avoid colloquial or casual expressions. Return ONLY the translated text.",
  },
  ko: {
    grammar: "이 텍스트의 맞춤법, 문법, 구두점 오류를 수정하되 의미와 어조는 그대로 유지하세요.",
    improve: "이 텍스트의 명확성, 어휘, 흐름, 전반적인 품질을 개선하세요. 자연스럽고 세련된 문체로 작성해주세요.",
    professional: "이 텍스트를 전문적이고 정중하며 명확한 비즈니스 문체로 다시 작성하세요. 인사말, 맺음말, 제목, 서식은 추가하지 말고 수정된 텍스트만 반환하세요.",
    continue: "아래 텍스트를 시작으로, 같은 스타일과 흐름에 맞게 자연스러운 다음 문장 1-2개를 이어 작성하세요.",
    translate: "다음 텍스트를 영어로 번역하세요. 격식체(formal)를 사용하고, 구어체나 속어는 피하세요. 번역된 텍스트만 반환하세요.",
  },
} as const