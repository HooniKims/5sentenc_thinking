export type HelpStep = 1 | 2 | 3 | 4 | 5;

export const helpDetailKinds = ["scene", "sense", "action", "change"] as const;
export type HelpDetailKind = (typeof helpDetailKinds)[number];

export type DraftLength = "empty" | "short" | "developing";

export interface HelpGuidanceInput {
  readonly step: HelpStep;
  readonly confirmedSentenceCount: number;
  readonly draftLength: DraftLength;
  readonly detailKinds: readonly HelpDetailKind[];
  readonly repeatsKnownWords: boolean;
}

const detailPatterns: Readonly<Record<HelpDetailKind, RegExp>> = {
  scene: /(?:보|빛|색|창|길|하늘|앞|뒤|주변)/u,
  sense: /(?:소리|들리|냄새|차갑|따뜻|바람|비|느낌)/u,
  action: /(?:타|걷|뛰|멈추|인사|들고|앉|내리)/u,
  change: /(?:그래서|하지만|그러나|처음|달라|생각|기억)/u
};

function koreanWords(text: string): readonly string[] {
  return text.match(/[가-힣]{2,}/gu) ?? [];
}

function draftLengthFor(draft: string): DraftLength {
  const length = draft.trim().length;
  if (length === 0) {
    return "empty";
  }

  return length < 18 ? "short" : "developing";
}

export function createHelpGuidanceInput(
  step: HelpStep,
  sentences: readonly string[],
  draft: string
): HelpGuidanceInput {
  const fullText = [...sentences, draft].join(" ");
  const knownWords = new Set(koreanWords(sentences.join(" ")));
  const draftWords = koreanWords(draft);

  return {
    step,
    confirmedSentenceCount: sentences.length,
    draftLength: draftLengthFor(draft),
    detailKinds: helpDetailKinds.filter((kind) => detailPatterns[kind].test(fullText)),
    repeatsKnownWords: draftWords.some((word) => knownWords.has(word))
  };
}

export const safeHelpQuestions = [
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

export function fallbackHelpQuestion(step: HelpStep, variation: number): string {
  const questions = safeHelpQuestions[step - 1] ?? safeHelpQuestions[0];
  return questions[variation % questions.length] ?? questions[0];
}

export function questionForVariant(step: HelpStep, variant: 0 | 1 | 2): string {
  return fallbackHelpQuestion(step, variant);
}

export function isSingleThinkingQuestion(question: string): boolean {
  const trimmed = question.trim();
  const questionMarkCount = [...trimmed].filter((character) => character === "?").length;
  const answerOrWritingPattern = /(?:답|정답|예시|문장 예시|고친 문장|이렇게|다음처럼|쓰면|쓰세요|써 보세요|적으면|적으세요|고치면|고쳐|바꾸면|바꿔|작성|평가|(?:라고|다고)\s*(?:적|써|쓰))/u;
  const personalInformationSeekingPattern = /(?:이름|성명|별명|별칭|닉네임|연락처|전화(?:번호)?|휴대폰|주소|학교|학년|학급|몇\s*반|반\s*(?:은|이|을|에|에서|번호)|사진|비밀번호|암호|기록|성적|평가|생일|생년|출생|태어났|나이|몇\s*살|누구|누가|선생님\s*(?:은|는|이|가)?\s*(?:어떤\s*분|무슨\s*분)|(?:어느|무슨)\s*(?:동네|지역|곳)|어디(?:에|에서)\s*(?:살|살았|지내)|(?:동네|지역|주소)\s*(?:는|은|이)|집(?:은|이)?\s*어디|\b(?:name|nickname|alias|contact|phone|address|school|class|grade|photo|password|record|evaluation|birthday|birthdate|age|residence|neighborhood|location)\b)/iu;
  return (
    trimmed.length > 0 &&
    trimmed.length <= 120 &&
    /[가-힣]/u.test(trimmed) &&
    questionMarkCount === 1 &&
    trimmed.endsWith("?") &&
    !trimmed.includes("\n") &&
    !/[.!…]\s+/.test(trimmed) &&
    !answerOrWritingPattern.test(trimmed) &&
    !personalInformationSeekingPattern.test(trimmed)
  );
}

const personalInformationPatterns = [
  /\b\d{6}-?[1-4]\d{6}\b/u,
  /\b\d{2,3}[-\s]?\d{3,4}[-\s]?\d{4}\b/u,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /(?:제|내)\s*이름은?\s*[가-힣]{2,4}/u,
  /홍길동/u,
  /\b[A-Z][A-Za-z'-]{1,30}(?:\s+[A-Z][A-Za-z'-]{1,30})?\b/u,
  /[가-힣]{2,}(?:초등학교|중학교|고등학교|대학교)/u,
  /\d{1,2}학년\s*\d{1,2}반/u,
  /(?:생일|생년월일|출생(?:일|년도)?)[^\n]{0,20}(?:19|20)\d{2}년\s*\d{1,2}월\s*\d{1,2}일/u,
  /(?:제|내)\s*나이는?\s*(?:만\s*)?\d{1,2}살/u,
  /(?:서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|제주특별자치도|[가-힣]{2,}(?:특별시|광역시|특별자치시|도))\s+[가-힣]+(?:구|시|군|읍|면|동)(?:에|에서)?\s*(?:살|거주)/u,
  /(?:서울|부산|대구|인천|광주|대전|울산)\s+[가-힣]+(?:구|시|군|읍|면|동)(?:에|에서)?\s*(?:살|거주)/u,
  /(?:집|우리\s*집)은?\s*(?:서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치도|[가-힣]{2,}(?:특별시|광역시|특별자치시|도))\s+[가-힣]+(?:구|시|군|읍|면|동)(?:예요|이에요|입니다)/u,
  /[가-힣]{2,}(?:로|길)\s*\d{1,4}(?:번지)?(?:에|에서)?\s*(?:살|거주)/u
] as const;

export function containsPersonalInformation(text: string): boolean {
  return personalInformationPatterns.some((pattern) => pattern.test(text));
}

export function buildGuidancePrompt(input: HelpGuidanceInput): string {
  const detailLabels: Readonly<Record<HelpDetailKind, string>> = {
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
