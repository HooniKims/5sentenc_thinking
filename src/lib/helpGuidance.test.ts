import { describe, expect, it } from "vitest";
import {
  buildGuidancePrompt,
  containsPersonalInformation,
  createHelpGuidanceInput,
  fallbackHelpQuestion,
  isSingleThinkingQuestion,
  questionForVariant
} from "./helpGuidance";

describe("생각 확장 도움 질문", () => {
  it("학생 원문을 보내지 않고 비식별 작성 신호만 만든다", () => {
    const input = createHelpGuidanceInput(
      3,
      ["버스를 타고 왔어요.", "창밖의 비를 봤어요."],
      "창밖의 비가 차갑게 느껴졌어요."
    );

    expect(input).toMatchObject({
      step: 3,
      confirmedSentenceCount: 2,
      draftLength: "short",
      repeatsKnownWords: true
    });
    expect(input.detailKinds).toEqual(expect.arrayContaining(["scene", "sense"]));
    expect(JSON.stringify(input)).not.toContain("버스를 타고 왔어요");
    expect(JSON.stringify(input)).not.toContain("창밖의 비가 차갑게 느껴졌어요");
  });

  it("Solar에는 원문 대신 숫자 선택만 요구하는 안내를 만든다", () => {
    const prompt = buildGuidancePrompt({
      step: 3,
      confirmedSentenceCount: 2,
      draftLength: "developing",
      detailKinds: ["scene", "sense"],
      repeatsKnownWords: false
    });

    expect(prompt).toContain("학생 원문과 개인정보는 받지 않았습니다");
    expect(prompt).toContain("0, 1, 2 중 하나만 답하세요");
    expect(prompt).toContain("드러난 관찰 범주: 장면, 감각");
    expect(prompt).not.toContain("버스를 타고 왔어요");
  });

  it("같은 단계에서도 안전 질문을 바꾸어 건네며 모델 선택값도 준비 질문 안에서만 고른다", () => {
    expect(fallbackHelpQuestion(2, 0)).not.toBe(fallbackHelpQuestion(2, 1));
    expect(fallbackHelpQuestion(4, 1)).not.toContain("누구와 함께");
    expect(questionForVariant(2, 0)).toBe(fallbackHelpQuestion(2, 0));
  });

  it("답변이나 여러 질문이 섞인 AI 응답은 학생에게 보여 주지 않는다", () => {
    expect(isSingleThinkingQuestion("창밖의 소리는 어떻게 들렸나요?")).toBe(true);
    expect(isSingleThinkingQuestion("비가 차가웠어요. 창밖의 소리는 어떻게 들렸나요?")).toBe(false);
    expect(isSingleThinkingQuestion("무엇이 보였나요? 어떤 소리가 났나요?")).toBe(false);
    expect(isSingleThinkingQuestion("'버스를 타고 왔어요'라고 쓰면 돼요?")).toBe(false);
    expect(isSingleThinkingQuestion("창문에 비가 맺혔다고 적어 볼까요?")).toBe(false);
    expect(isSingleThinkingQuestion("Where did you go?")).toBe(false);
    expect(isSingleThinkingQuestion("학생 이름은 무엇인가요?")).toBe(false);
  });

  it("학생 글에 담긴 직접 식별 정보를 저장 전에 감지한다", () => {
    expect(containsPersonalInformation("900101-1234567")).toBe(true);
    expect(containsPersonalInformation("010-1234-5678")).toBe(true);
    expect(containsPersonalInformation("student@example.com")).toBe(true);
    expect(containsPersonalInformation("제 이름은 김민수예요.")).toBe(true);
    expect(containsPersonalInformation("홍길동")).toBe(true);
    expect(containsPersonalInformation("John Smith와 걸었어요.")).toBe(true);
    expect(containsPersonalInformation("김밥을 먹었어요.")).toBe(false);
    expect(containsPersonalInformation("생일은 2012년 3월 4일이에요.")).toBe(true);
    expect(containsPersonalInformation("제 나이는 12살이에요.")).toBe(true);
    expect(containsPersonalInformation("서울특별시 강남구에 살아요.")).toBe(true);
    expect(containsPersonalInformation("행복로 12에 살아요.")).toBe(true);
    expect(containsPersonalInformation("새봄중학교에 다녀요.")).toBe(true);
    expect(containsPersonalInformation("2학년 3반이에요.")).toBe(true);
    expect(containsPersonalInformation("학교 앞에서 버스를 봤어요.")).toBe(false);
  });
});
