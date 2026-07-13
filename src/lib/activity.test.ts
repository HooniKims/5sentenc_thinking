import { describe, expect, it } from "vitest";
import { dashboardPriority, nextStep, requestHelp } from "./activity";

describe("수업 진행 규칙", () => {
  it("도움 요청 학생을 작성 중인 학생보다 먼저 보여 준다", () => {
    expect(dashboardPriority("help_requested")).toBeLessThan(dashboardPriority("writing"));
  });

  it("다섯 번째 문장을 쓴 뒤에는 다음 단계가 없다", () => {
    expect(nextStep(5)).toBeNull();
  });

  it("이미 도움을 요청한 학생의 중복 요청을 합친다", () => {
    expect(requestHelp("help_requested")).toEqual({
      accepted: false,
      nextStatus: "help_requested"
    });
  });
});
