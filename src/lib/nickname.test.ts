import { describe, expect, it } from "vitest";
import { createNickname } from "./nickname";

describe("랜덤 닉네임", () => {
  it("같은 난수에서는 예측 가능한 두 낱말과 두 자리 숫자를 만든다", () => {
    expect(createNickname(() => 0)).toBe("별빛탐험가 01");
  });
});
