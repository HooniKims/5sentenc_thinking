import { describe, expect, it } from "vitest";

import { isSingleSentence, replaceSentence } from "./sentences";

describe("문장 입력 규칙", () => {
  it("문장 부호로 끝나는 한 문장을 허용한다", () => {
    // Given: 마침표로 끝나는 한 문장
    const value = "버스를 타고 왔어요.";

    // When: 문장 수를 확인하면
    const result = isSingleSentence(value);

    // Then: 한 문장으로 인정한다
    expect(result).toBe(true);
  });

  it("문장 부호 뒤 공백으로 이어진 두 문장을 거부한다", () => {
    // Given: 두 문장이 공백으로 이어진 입력
    const value = "버스를 타고 왔어요. 비가 왔어요.";

    // When: 문장 수를 확인하면
    const result = isSingleSentence(value);

    // Then: 한 문장으로 인정하지 않는다
    expect(result).toBe(false);
  });

  it("인접한 마침표로 이어진 두 문장을 거부한다", () => {
    // Given: 공백 없이 마침표로 이어진 두 문장
    const value = "첫째.둘째.";

    // When: 문장 수를 확인하면
    const result = isSingleSentence(value);

    // Then: 한 문장으로 인정하지 않는다
    expect(result).toBe(false);
  });

  it("인접한 느낌표로 이어진 두 문장을 거부한다", () => {
    // Given: 공백 없이 느낌표로 이어진 두 문장
    const value = "첫째!둘째!";

    // When: 문장 수를 확인하면
    const result = isSingleSentence(value);

    // Then: 한 문장으로 인정하지 않는다
    expect(result).toBe(false);
  });

  it("인접한 물음표로 이어진 두 문장을 거부한다", () => {
    // Given: 공백 없이 물음표로 이어진 두 문장
    const value = "첫째?둘째?";

    // When: 문장 수를 확인하면
    const result = isSingleSentence(value);

    // Then: 한 문장으로 인정하지 않는다
    expect(result).toBe(false);
  });

  it("줄바꿈이 있는 입력을 거부한다", () => {
    // Given: 줄바꿈으로 나뉜 입력
    const value = "첫 문장\n둘째 문장";

    // When: 문장 수를 확인하면
    const result = isSingleSentence(value);

    // Then: 한 문장으로 인정하지 않는다
    expect(result).toBe(false);
  });

  it.each([
    ["CR", "\r"],
    ["LF", "\n"],
    ["line separator", "\u2028"],
    ["paragraph separator", "\u2029"],
  ])("%s 줄바꿈이 있는 입력을 거부한다", (_, lineBreak) => {
    // Given: 줄바꿈 문자가 문장 사이에 있는 입력
    const value = `첫 문장${lineBreak}둘째 문장`;

    // When: 문장 수를 확인하면
    const result = isSingleSentence(value);

    // Then: 한 문장으로 인정하지 않는다
    expect(result).toBe(false);
  });

  it("공백만 있는 입력을 거부한다", () => {
    // Given: 공백만 있는 입력
    const value = "   ";

    // When: 문장 수를 확인하면
    const result = isSingleSentence(value);

    // Then: 한 문장으로 인정하지 않는다
    expect(result).toBe(false);
  });

  it("마침표가 없는 한 절을 허용한다", () => {
    // Given: 문장 부호 없이 끝나는 한 절
    const value = "비가 와요";

    // When: 문장 수를 확인하면
    const result = isSingleSentence(value);

    // Then: 한 문장으로 인정한다
    expect(result).toBe(true);
  });
});

describe("문장 교체", () => {
  it("지정한 위치만 바꾼 새 배열을 반환하고 원본을 보존한다", () => {
    // Given: 세 문장으로 된 원본 배열
    const sentences = ["첫째", "둘째", "셋째"];

    // When: 두 번째 문장을 바꾸면
    const result = replaceSentence(sentences, 1, "바꾼 둘째");

    // Then: 새 배열에는 지정한 문장만 바뀌고 원본은 남는다
    expect(result).toEqual(["첫째", "바꾼 둘째", "셋째"]);
    expect(result).not.toBe(sentences);
    expect(sentences).toEqual(["첫째", "둘째", "셋째"]);
  });

  it("범위를 벗어난 위치에서는 원본과 다른 같은 내용의 배열을 반환한다", () => {
    // Given: 한 문장으로 된 원본 배열과 잘못된 위치
    const sentences = ["첫째"];

    // When: 범위를 벗어난 위치를 바꾸면
    const result = replaceSentence(sentences, 1, "바뀌지 않음");

    // Then: 내용은 유지하지만 새 배열을 반환한다
    expect(result).toEqual(["첫째"]);
    expect(result).not.toBe(sentences);
  });
});
