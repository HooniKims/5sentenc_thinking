import { isSingleSentence } from "./sentences";
import { containsPersonalInformation } from "./helpGuidance";

// 확장 모델: 씨앗 한 문장에서 출발해, 그 "같은 순간"을 다시 보며 알아챈 것을 한 문장씩 더한다.
// 중1 사용성: 추상("무엇을 놓쳤나") 금지, 구체·감각 질문 하나만.
// 문장 시작 예시("창밖으로 ___")는 항상 보여주지 않는다 — 먼저 스스로 써 보게 하고,
// 막혀서 '도움'을 누르면 그때 디디가 예시를 건넨다(먼저 생각하기 철학).
export const guideQuestions = [
  "오늘 여기까지 어떻게 왔는지, 떠오르는 대로 한 문장만 써 볼까요?",
  "그 순간으로 다시 가 볼게요. 그때 눈앞에 뭐가 보였어요?",
  "그 자리에서 무슨 소리가 들렸어요? 냄새나 바람은요?",
  "그때 곁에 누가 있었어요? 그 사람은 뭘 하고 있었나요?",
  "그 순간, 내 마음은 어땠어요?"
] as const;

// '도움' 버튼을 눌렀을 때만 디디가 건네는 문장 시작 예시(차원별). 항상 노출하지 않는다.
export const helpStarterExamples = [
  "이렇게 시작해도 좋아요: “나는 ___를 타고 왔어요.”",
  "이렇게 시작해도 좋아요: “창밖으로 ___이 보였어요.”",
  "이렇게 시작해도 좋아요: “___ 소리가 들렸어요.”",
  "이렇게 시작해도 좋아요: “옆에는 ___가 있었어요.”",
  "이렇게 시작해도 좋아요: “나는 조금 ___한 마음이었어요.”"
] as const;

export const openingDidiSpeech = "너무 어렵게 생각하지 마세요. 이곳까지 어떻게 왔는지 간단하게 써도 좋아요.";

export const guideCopies = [
  "정답보다 내 생각이 먼저예요. 가장 먼저 떠오른 대로 한 문장만 적어 보세요.",
  "그 순간을 다시 떠올려, 눈에 보였던 것을 한 문장 더해 보세요.",
  "이번엔 소리나 냄새, 바람처럼 그때 느낀 것을 한 문장 더해 보세요.",
  "그 자리에 있던 사람이나 그 사람의 모습을 한 문장 더해 보세요.",
  "그때 내 마음이 어땠는지 한 문장 더해 보세요. 떠오르면 계속 이어가도 좋아요."
] as const;

export type ActivityStep = 1 | 2 | 3 | 4 | 5;

export const maximumStudentSentenceLength = 280;

// 기본 목표는 5문장. 채우면 마무리할 수 있고, 원하면 이어서 더 넓힐 수 있다(안전 상한 12).
export const targetSentences = 5;
export const maximumExpansionSentences = 12;
// 5문장을 채우면 "충분히 훌륭"으로 인정하고 마무리 버튼을 연다(강제 종료는 아님).
export const gentleMilestoneSentences = 5;

// 씨앗(1) 이후에는 차원 질문(2~5: 본 것·소리·사람·마음)을 순환한다. step은 질문/예시 선택용으로 1~5 유지.
export function stepForSentenceCount(sentenceCount: number): ActivityStep {
  if (sentenceCount <= 0) {
    return 1;
  }
  return (((sentenceCount - 1) % 4) + 2) as ActivityStep;
}

export function draftValidationMessage(draft: string): string | null {
  if (draft.trim().length === 0) {
    return "문장을 한 개 입력하면 저장할 수 있어요.";
  }

  if (!isSingleSentence(draft)) {
    return "한 번에 한 문장만 입력해 주세요.";
  }

  if (draft.trim().length > maximumStudentSentenceLength) {
    return `문장은 ${maximumStudentSentenceLength}자 안으로 적어 주세요.`;
  }

  return containsPersonalInformation(draft)
    ? "이름, 연락처, 학교·학급, 주소처럼 개인정보로 보이는 내용은 빼고 적어 주세요."
    : null;
}
