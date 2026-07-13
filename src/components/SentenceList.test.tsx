import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SentenceList } from "./SentenceList";

afterEach(cleanup);

describe("SentenceList", () => {
  it("카드의 수정 저장은 바꾼 한 문장을 부모에게 전달한다", () => {
    // Given: 저장된 첫 번째 문장 카드
    const onSaveEdit = vi.fn();
    render(<SentenceList sentences={["버스를 타고 왔어요."]} onSaveEdit={onSaveEdit} />);

    // When: 문장을 고쳐 저장하면
    fireEvent.click(screen.getByRole("button", { name: "1번째 문장 수정" }));
    fireEvent.change(screen.getByLabelText("1번째 문장 수정 내용"), {
      target: { value: "지하철을 타고 왔어요." }
    });
    fireEvent.click(screen.getByRole("button", { name: "1번째 문장 수정 저장" }));

    // Then: 바뀐 문장과 카드 위치를 전달한다
    expect(onSaveEdit).toHaveBeenCalledWith(0, "지하철을 타고 왔어요.");
    expect(document.activeElement).toHaveAccessibleName("1번째 문장 수정");
  });

  it("수정 중 두 문장이면 저장을 막고 안내한다", () => {
    // Given: 수정할 첫 번째 문장 카드
    const onSaveEdit = vi.fn();
    render(<SentenceList sentences={["버스를 타고 왔어요."]} onSaveEdit={onSaveEdit} />);
    fireEvent.click(screen.getByRole("button", { name: "1번째 문장 수정" }));

    // When: 두 문장을 입력하면
    fireEvent.change(screen.getByLabelText("1번째 문장 수정 내용"), {
      target: { value: "버스를 타고 왔어요. 비가 왔어요." }
    });

    // Then: 저장할 수 없고 이유를 알려 준다
    expect(screen.getByRole("button", { name: "1번째 문장 수정 저장" })).toBeDisabled();
    expect(screen.getByText("한 번에 한 문장만 입력해 주세요.")).toBeInTheDocument();
  });

  it("수정 시작과 취소 뒤에는 같은 카드의 편집 흐름에 포커스를 둔다", () => {
    render(<SentenceList sentences={["버스를 타고 왔어요."]} onSaveEdit={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "1번째 문장 수정" }));
    expect(document.activeElement).toHaveAccessibleName("1번째 문장 수정 내용");

    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(document.activeElement).toHaveAccessibleName("1번째 문장 수정");
  });
});
