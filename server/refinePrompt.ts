export interface RefineInput {
  readonly sentences: readonly string[];
}

// 학생 문장을 "의미는 그대로 두고 표현만 유려하게" 다듬도록 요청하는 프롬프트.
// 내용 추가·삭제·창작을 금지하고, 한 문단으로 자연스럽게 잇게 한다.
export function buildRefinePrompt(input: RefineInput): string {
  const numbered = input.sentences.map((sentence, index) => `${index + 1}. ${sentence}`).join("\n");
  return [
    "너는 초등·중학생의 짧은 글을 다듬어 주는 국어 선생님이야.",
    "아래 문장들을 하나의 자연스러운 한 문단으로 이어 줘.",
    "규칙:",
    "- 학생이 쓴 장면·사실·감정·순서를 절대 바꾸거나 새로 지어내지 마.",
    "- 없는 내용을 더하지 말고, 있는 내용을 빼지도 마.",
    "- 어색한 연결을 매끄럽게 하고, 반복을 줄이고, 표현만 조금 더 또렷하게 다듬어.",
    "- 학생의 말투와 눈높이를 살려, 너무 어른스럽거나 화려하게 만들지 마.",
    "- 결과는 다듬은 한 문단만 출력해. 설명이나 따옴표는 붙이지 마.",
    "",
    "학생 문장:",
    numbered
  ].join("\n");
}
