import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("학생 활동 시작 화면", () => {
  it("질문과 첫 문장 입력칸을 보여 준다", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "여기에 어떻게 오셨어요?" })).toBeInTheDocument();
    expect(screen.getByLabelText("나의 첫 번째 문장")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "도움!" })).toBeInTheDocument();
  });
});
