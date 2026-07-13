import { isSingleSentence } from "./sentences";
import { containsPersonalInformation } from "./helpGuidance";

export const guideQuestions = [
  "여기에 어떻게 오셨어요? 먼저 떠오르는 장면을 한 문장으로 써 볼까요?",
  "방금 쓴 문장과 다른 장면 하나를 더해 볼까요?",
  "소리나 느낌을 담은 새 문장을 하나 더 만들어 볼까요?",
  "그 길에서 만난 사람이나 내 행동을 한 문장으로 적어 볼까요?",
  "처음과 달라진 생각을 담은 마지막 문장을 써 볼까요?"
] as const;

export const guideCopies = [
  "정답보다 내 생각이 먼저예요. 가장 먼저 떠오른 장면을 한 문장으로 적어 보세요.",
  "앞 문장을 반복하지 않고, 새로 발견한 장면을 두 번째 문장으로 적어 보세요.",
  "생각은 더 자세히 볼수록 자라요. 소리나 느낌을 새 문장에 담아 보세요.",
  "사람, 표정, 행동처럼 처음에 놓친 것을 한 문장으로 적어 보세요.",
  "처음 생각과 달라진 점을 담아 마지막 문장을 완성해 보세요."
] as const;

export type ActivityStep = 1 | 2 | 3 | 4 | 5;

export const maximumStudentSentenceLength = 280;

export function stepForSentenceCount(sentenceCount: number): ActivityStep {
  switch (sentenceCount) {
    case 0:
      return 1;
    case 1:
      return 2;
    case 2:
      return 3;
    case 3:
      return 4;
    default:
      return 5;
  }
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
