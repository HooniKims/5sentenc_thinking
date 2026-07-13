export type ServerHelpStep = 1 | 2 | 3 | 4 | 5;

export type ServerHelpDetailKind = "scene" | "sense" | "action" | "change";

export type ServerDraftLength = "empty" | "short" | "developing";

export interface ServerHelpGuidanceInput {
  readonly step: ServerHelpStep;
  readonly confirmedSentenceCount: number;
  readonly draftLength: ServerDraftLength;
  readonly detailKinds: readonly ServerHelpDetailKind[];
  readonly repeatsKnownWords: boolean;
}

const safeHelpQuestions = [
  [
    "출발할 때 가장 먼저 보거나 들은 것은 무엇이었나요?",
    "그 길을 떠올리면 가장 먼저 생각나는 색은 무엇인가요?",
    "그 장면을 한 장의 사진으로 찍는다면 무엇이 담길까요?"
  ],
  [
    "첫 문장에 없던 색, 소리, 사람 중 무엇을 하나 더 발견할 수 있을까요?",
    "가까이 있던 것과 멀리 있던 것을 하나씩 떠올려 볼까요?",
    "첫 문장을 새로 고친다면 어느 말을 더 또렷하게 만들고 싶나요?"
  ],
  [
    "두 문장에는 없던 소리나 몸의 느낌을 하나 골라 볼까요?",
    "공기의 온도나 냄새는 어땠나요?",
    "발걸음이나 주변의 소리 중 하나가 내 생각을 어떻게 바꿨나요?"
  ],
  [
    "그 길에서 스쳐 간 사람의 표정이나 행동을 떠올려 볼까요?",
    "그 길에서 곁에 함께한 사람이 있었는지만 떠올려 볼까요?",
    "그때 내가 한 행동 하나를 더하면 이야기가 어떻게 달라질까요?"
  ],
  [
    "처음 문장과 달라진 생각을 한 가지 골라 적어 볼까요?",
    "그 길에서 가장 기억하고 싶은 장면은 무엇인가요?",
    "다음에 같은 길을 간다면 무엇을 더 살펴보고 싶나요?"
  ]
] as const;

export function questionForVariant(step: ServerHelpStep, variant: 0 | 1 | 2): string {
  const questions = safeHelpQuestions[step - 1] ?? safeHelpQuestions[0];
  return questions?.[variant] ?? questions?.[0] ?? "지금 장면에서 하나 더 떠오르는 것은 무엇인가요?";
}

export function buildGuidancePrompt(input: ServerHelpGuidanceInput): string {
  const detailLabels: Readonly<Record<ServerHelpDetailKind, string>> = {
    scene: "장면",
    sense: "감각",
    action: "행동",
    change: "관점 변화"
  };
  const details = input.detailKinds.map((kind) => detailLabels[kind]).join(", ") || "아직 뚜렷하지 않음";

  return [
    "당신은 중학생의 생각을 넓히는 수업 동반자 디디입니다.",
    "학생 원문과 개인정보는 받지 않았습니다. 아래의 비식별 작성 신호만 보고 선택하세요.",
    `현재 단계: ${input.step} / 5`,
    `확정 문장 수: ${input.confirmedSentenceCount}`,
    `초안 길이: ${input.draftLength}`,
    `드러난 관찰 범주: ${details}`,
    `앞 문장과 겹치는 말이 있는지: ${input.repeatsKnownWords ? "있음" : "없음"}`,
    "0, 1, 2 중 하나만 답하세요. 다른 글자나 문장, 예시는 절대 쓰지 마세요.",
    "0은 장면, 1은 감각·관찰, 2는 행동·관점으로 생각을 넓히는 질문을 뜻합니다."
  ].join("\n");
}
