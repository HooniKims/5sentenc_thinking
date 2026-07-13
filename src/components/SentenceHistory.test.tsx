import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SentenceHistory } from "./SentenceHistory";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function runAnimationFramesImmediately(): void {
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callback(0);
    return 1;
  });
}

describe("SentenceHistory", () => {
  it("문장이 없으면 아무것도 렌더링하지 않는다", () => {
    const { container } = render(
      <SentenceHistory
        sentences={[]}
        onReturnToDraft={vi.fn()}
        onSaveEdit={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("닫힌 보관함은 최근 문장을 보이고 전체 버튼으로 모든 문장을 연다", () => {
    render(
      <SentenceHistory
        sentences={[
          "버스를 타고 왔어요.",
          "창밖에는 비에 젖은 나무가 보였어요.",
        ]}
        onReturnToDraft={vi.fn()}
        onSaveEdit={vi.fn()}
      />,
    );

    const summary = screen.getByRole("button", {
      name: /^지금까지 쓴 문장 2개/,
    });
    fireEvent.click(summary);

    expect(summary).toHaveAttribute("aria-label", "지금까지 쓴 문장 2개");
    expect(summary).toHaveAccessibleName("지금까지 쓴 문장 2개");
    expect(summary).toHaveTextContent("창밖에는 비에 젖은 나무가 보였어요.");
    const dialog = screen.getByRole("dialog", { name: "문장 보관함" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByText("버스를 타고 왔어요.")).toBeInTheDocument();
    expect(
      within(dialog).getByText("창밖에는 비에 젖은 나무가 보였어요."),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "1번째 문장 수정" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "2번째 문장 수정" }),
    ).toBeInTheDocument();
  });

  it("수정 저장은 공백을 뺀 문장을 전달하고 작성대로 한 번만 돌아간다", () => {
    const onSaveEdit = vi.fn();
    const onReturnToDraft = vi.fn();
    runAnimationFramesImmediately();
    render(
      <SentenceHistory
        sentences={["버스를 타고 왔어요."]}
        onReturnToDraft={onReturnToDraft}
        onSaveEdit={onSaveEdit}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /^지금까지 쓴 문장 1개/ }),
    );

    fireEvent.click(screen.getByRole("button", { name: "1번째 문장 수정" }));
    expect(
      screen.queryByRole("dialog", { name: "문장 보관함" }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("1번째 문장 수정 내용"), {
      target: { value: "  지하철을 타고 왔어요.  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "수정 저장" }));

    expect(onSaveEdit).toHaveBeenCalledWith(0, "지하철을 타고 왔어요.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onReturnToDraft).toHaveBeenCalledTimes(1);
  });

  it("Escape는 문장 보관함을 닫고 작성대로 한 번만 돌아간다", () => {
    const onReturnToDraft = vi.fn();
    runAnimationFramesImmediately();
    render(
      <SentenceHistory
        sentences={["버스를 타고 왔어요."]}
        onReturnToDraft={onReturnToDraft}
        onSaveEdit={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /^지금까지 쓴 문장 1개/ }),
    );

    fireEvent.keyDown(screen.getByRole("dialog", { name: "문장 보관함" }), {
      key: "Escape",
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onReturnToDraft).toHaveBeenCalledTimes(1);
  });

  it("두 문장으로 수정하면 저장을 막고 이유를 알려 준다", () => {
    render(
      <SentenceHistory
        sentences={["버스를 타고 왔어요."]}
        onReturnToDraft={vi.fn()}
        onSaveEdit={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /^지금까지 쓴 문장 1개/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "1번째 문장 수정" }));

    fireEvent.change(screen.getByLabelText("1번째 문장 수정 내용"), {
      target: { value: "버스를 타고 왔어요. 비가 왔어요." },
    });

    expect(screen.getByRole("button", { name: "수정 저장" })).toBeDisabled();
    expect(
      screen.getByText("한 번에 한 문장만 입력해 주세요."),
    ).toBeInTheDocument();
  });

  it("취소, 닫기, 바깥 영역 클릭은 매번 한 번만 작성대로 돌아간다", () => {
    const onReturnToDraft = vi.fn();
    runAnimationFramesImmediately();
    render(
      <SentenceHistory
        sentences={["버스를 타고 왔어요."]}
        onReturnToDraft={onReturnToDraft}
        onSaveEdit={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /^지금까지 쓴 문장 1개/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "1번째 문장 수정" }));
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onReturnToDraft).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole("button", { name: /^지금까지 쓴 문장 1개/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "문장 보관함 닫기" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onReturnToDraft).toHaveBeenCalledTimes(2);

    fireEvent.click(
      screen.getByRole("button", { name: /^지금까지 쓴 문장 1개/ }),
    );
    fireEvent.click(screen.getByTestId("sentence-history-backdrop"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onReturnToDraft).toHaveBeenCalledTimes(3);
  });

  it("보관함 안의 마지막 버튼에서 Tab을 누르면 첫 버튼으로 돌아온다", () => {
    render(
      <SentenceHistory
        sentences={["버스를 타고 왔어요.", "창밖에는 비가 왔어요."]}
        onReturnToDraft={vi.fn()}
        onSaveEdit={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /^지금까지 쓴 문장 2개/ }),
    );
    const dialog = screen.getByRole("dialog", { name: "문장 보관함" });
    const firstButton = within(dialog).getByRole("button", {
      name: "문장 보관함 닫기",
    });
    const lastButton = within(dialog).getByRole("button", {
      name: "2번째 문장 수정",
    });

    lastButton.focus();
    fireEvent.keyDown(lastButton, { key: "Tab" });

    expect(firstButton).toHaveFocus();

    fireEvent.keyDown(firstButton, { key: "Tab", shiftKey: true });

    expect(lastButton).toHaveFocus();
  });

  it("대화상자 처음 초점에서 Shift+Tab을 눌러도 보관함 밖으로 나가지 않는다", () => {
    render(
      <SentenceHistory
        sentences={["버스를 타고 왔어요."]}
        onReturnToDraft={vi.fn()}
        onSaveEdit={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /^지금까지 쓴 문장 1개/ }),
    );
    const dialog = screen.getByRole("dialog", { name: "문장 보관함" });
    const lastButton = within(dialog).getByRole("button", {
      name: "1번째 문장 수정",
    });

    expect(dialog).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });

    expect(lastButton).toHaveFocus();
  });
});
