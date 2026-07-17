import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LegalPage } from "./LegalPage";

describe("정책 화면", () => {
  it("이용약관에 학습 목적과 공통 정책 링크를 표시한다", () => {
    render(<LegalPage document="terms" />);

    expect(screen.getByRole("heading", { name: "이용약관" })).toBeInTheDocument();
    expect(screen.getByText("제1조(서비스의 학습 목적)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "이용약관" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "개인정보처리방침" })).toHaveAttribute("href", "/privacy");
  });

  it("개인정보처리방침에 실제 저장·AI 처리 범위를 표시한다", () => {
    render(<LegalPage document="privacy" />);

    expect(screen.getByRole("heading", { name: "개인정보처리방침" })).toBeInTheDocument();
    expect(screen.getByText(/Firebase 익명 사용자 식별자/)).toBeInTheDocument();
    expect(screen.getByText(/비식별 작성 신호를 Upstage API에 전송/)).toBeInTheDocument();
    expect(screen.getByText(/개인정보침해 신고센터/)).toBeInTheDocument();
  });
});
