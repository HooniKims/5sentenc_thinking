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
