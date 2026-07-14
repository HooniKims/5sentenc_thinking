import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LazyRobot3D } from "./LazyRobot3D";

vi.mock("./Robot3D", () => ({
  Robot3D: ({ gesture, lipFrame = 0 }: { readonly gesture: string; readonly lipFrame?: number }) => (
    <div data-gesture={gesture} data-lip-frame={lipFrame} data-testid="didi-gesture" />
  )
}));

describe("LazyRobot3D", () => {
  it("무거운 3D 모듈을 불러오는 동안에는 같은 크기의 자리만 먼저 보여 준다", async () => {
    render(<LazyRobot3D gesture="idle" />);

    expect(screen.getByTestId("robot-loading")).toBeInTheDocument();
    expect(await screen.findByTestId("didi-gesture")).toHaveAttribute("data-gesture", "idle");
  });
});
