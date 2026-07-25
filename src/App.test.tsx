import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const persistence = vi.hoisted(() => ({
  createHelpRequest: vi.fn(async () => undefined),
  saveParticipant: vi.fn(async () => undefined),
  sessionIsActive: vi.fn(async () => true)
}));

const help = vi.hoisted(() => ({
  requestGuidanceQuestion: vi.fn<() => Promise<string>>()
}));

const identity = vi.hoisted(() => ({
  ensureStudentIdentity: vi.fn<() => Promise<string>>()
}));

vi.mock("./components/LazyRobot3D", () => ({
  LazyRobot3D: ({ gesture, lipFrame = 0 }: { readonly gesture: string; readonly lipFrame?: number }) => (
    <div data-gesture={gesture} data-lip-frame={lipFrame} data-robot-3d="true" data-testid="didi-gesture" />
  )
}));

vi.mock("./lib/activityStore", () => ({
  createHelpRequest: persistence.createHelpRequest,
  saveParticipant: persistence.saveParticipant,
  sessionIsActive: persistence.sessionIsActive
}));

vi.mock("./lib/firebase", () => ({
  ensureStudentIdentity: identity.ensureStudentIdentity
}));

vi.mock("./lib/helpClient", () => ({
  requestGuidanceQuestion: help.requestGuidanceQuestion
}));

function createGuidanceRequest(): {
  readonly promise: Promise<string>;
  readonly resolve: (question: string) => void;
  readonly reject: (error: Error) => void;
} {
  let resolvePromise: (question: string) => void = () => undefined;
  let rejectPromise: (error: Error) => void = () => undefined;
  const promise = new Promise<string>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

async function waitForSessionConnection(): Promise<void> {
  await waitFor(() => expect(screen.getByRole("button", { name: "도움!" })).toBeEnabled());
}

function renderActivity(): ReturnType<typeof render> {
  return render(<App sessionId="test-session" />);
}

beforeEach(() => {
  help.requestGuidanceQuestion.mockResolvedValue("창밖에서 무엇이 가장 먼저 눈에 들어왔나요?");
  identity.ensureStudentIdentity.mockResolvedValue("student-1");
  persistence.sessionIsActive.mockResolvedValue(true);
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.useRealTimers();
});

describe("학생 활동 시작 화면", () => {
  it("수업 링크 없이 열면 학생 기록을 시작하지 않는다", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "수업 링크가 필요해요" })).toBeInTheDocument();
    expect(identity.ensureStudentIdentity).not.toHaveBeenCalled();
  });

  it("보관한 수업 링크로 열면 활동을 시작하지 않고 새 QR을 안내한다", async () => {
    persistence.sessionIsActive.mockResolvedValue(false);

    render(<App sessionId="archived-session" />);

    expect(await screen.findByRole("heading", { name: "이 수업은 보관됐어요" })).toBeInTheDocument();
    expect(screen.queryByLabelText("1번째 문장")).not.toBeInTheDocument();
    await waitFor(() => expect(help.requestGuidanceQuestion).not.toHaveBeenCalled());
  });

  it("연결이 붐벼 로그인에 실패하면 보관 안내 대신 다시 연결 화면을 보여 준다", async () => {
    identity.ensureStudentIdentity.mockRejectedValueOnce(
      Object.assign(new Error("too many attempts"), { code: "auth/too-many-requests" })
    );

    renderActivity();

    expect(await screen.findByRole("heading", { name: "지금은 연결이 어려워요" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "이 수업은 보관됐어요" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "다시 연결하기" }));

    await waitForSessionConnection();
    expect(identity.ensureStudentIdentity).toHaveBeenCalledTimes(2);
  });

  it("수업 조회가 권한 오류로 막히면 보관 안내를 보여 준다", async () => {
    persistence.sessionIsActive.mockRejectedValueOnce(
      Object.assign(new Error("denied"), { code: "permission-denied" })
    );

    renderActivity();

    expect(await screen.findByRole("heading", { name: "이 수업은 보관됐어요" })).toBeInTheDocument();
  });

  it("처음에는 가운데에서 조용히 기다리며 첫 문장 입력칸을 보여 준다", () => {
    renderActivity();

    expect(screen.getByRole("heading", { name: "여기에 어떻게 오셨어요?" })).toBeInTheDocument();
    expect(screen.getByLabelText("1번째 문장")).toBeInTheDocument();
    expect(screen.queryByText("디디의 질문")).not.toBeInTheDocument();
    expect(screen.getByTestId("didi-gesture")).toHaveAttribute("data-gesture", "idle");
    expect(screen.getByTestId("didi-position")).toHaveAttribute("data-position", "center");
    expect(screen.getByRole("button", { name: "도움!" })).toBeInTheDocument();
  });

  it("처음 10초 뒤 3D 디디가 달려가듯 이동한 다음 질문을 건넨다", () => {
    vi.useFakeTimers();
    renderActivity();

    expect(screen.queryByText("디디의 질문")).not.toBeInTheDocument();
    expect(screen.getByTestId("didi-position")).toHaveAttribute("data-position", "center");

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(screen.getByTestId("didi-position")).toHaveAttribute("data-position", "side");
    expect(screen.getByTestId("didi-position")).toHaveClass("guide-character--moving");
    expect(screen.getByTestId("didi-gesture")).toHaveAttribute("data-gesture", "idle");
    expect(screen.queryByTestId("didi-transition")).not.toBeInTheDocument();
    expect(screen.queryByText("디디의 질문")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(759);
    });

    expect(screen.getByTestId("didi-position")).toHaveClass("guide-character--moving");
    expect(screen.getByTestId("didi-gesture")).toHaveAttribute("data-gesture", "idle");

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(screen.getByText("디디의 질문")).toBeInTheDocument();
    expect(screen.getByText("너무 어렵게 생각하지 마세요. 이곳까지 어떻게 왔는지 간단하게 써도 좋아요.")).toBeInTheDocument();
    expect(screen.getByTestId("didi-position")).not.toHaveClass("guide-character--moving");
    expect(screen.getByTestId("didi-gesture")).toHaveAttribute("data-gesture", "speaking");
    vi.useRealTimers();
  });

  it("디디가 이동 중일 때 도움을 누르면 기다리지 않고 도움 질문을 연다", async () => {
    vi.useFakeTimers();
    renderActivity();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByRole("button", { name: "도움!" })).toBeEnabled();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    // 초안을 쓴 학생이 도움을 누르면 이어지는 질문(분석 흐름)을 연다. (빈 초안이면 예시가 나온다 — 아래 별도 테스트)
    fireEvent.change(screen.getByLabelText("1번째 문장"), { target: { value: "버스를 타고 왔어요." } });
    fireEvent.click(screen.getByRole("button", { name: "도움!" }));

    expect(screen.getByText("디디가 문장 사이를 살펴보고 있어요.")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("동작 줄이기 설정에서는 자동 질문을 바로 연다", () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    vi.useFakeTimers();

    try {
      renderActivity();
      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      act(() => {
        vi.advanceTimersByTime(0);
      });

      expect(screen.getByText("디디의 질문")).toBeInTheDocument();
    } finally {
      window.matchMedia = originalMatchMedia;
      vi.useRealTimers();
    }
  });

  it("질문을 마친 뒤에는 더빙 입 프레임을 멈춘다", () => {
    vi.useFakeTimers();
    renderActivity();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    act(() => {
      vi.advanceTimersByTime(760);
    });

    act(() => {
      vi.advanceTimersByTime(6_000);
    });

    const finishedFrame = screen.getByTestId("didi-gesture").getAttribute("data-lip-frame");
    expect(screen.getByTestId("didi-gesture")).toHaveAttribute("data-gesture", "idle");

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.getByTestId("didi-gesture")).toHaveAttribute("data-lip-frame", finishedFrame ?? "");
    vi.useRealTimers();
  });

  it("첫 문장을 저장하면 보관함 요약을 남기고 비어 있는 다음 입력칸을 연다", () => {
    vi.useFakeTimers();
    renderActivity();

    fireEvent.change(screen.getByLabelText("1번째 문장"), { target: { value: "버스를 타고 왔어요." } });
    fireEvent.click(screen.getByRole("button", { name: "문장 저장" }));

    expect(screen.getByRole("button", { name: /^지금까지 쓴 문장 1개/ })).toHaveTextContent("버스를 타고 왔어요.");
    expect(screen.queryByTestId("sentence-card-1")).not.toBeInTheDocument();
    expect(screen.getByLabelText("2번째 문장")).toHaveValue("");
    expect(screen.queryByLabelText("1번째 문장")).not.toBeInTheDocument();
    expect(screen.getByText(/길찾기 탐험 · 2 \/ 5/)).toBeInTheDocument();
    expect(document.activeElement).toHaveAccessibleName("2번째 문장");

    act(() => {
      vi.advanceTimersByTime(760);
    });

    expect(screen.getByTestId("didi-gesture")).toHaveAttribute("data-gesture", "speaking");
  });

  it("도움을 누르면 디디가 답 대신 다음 생각을 여는 질문을 건넨다", async () => {
    renderActivity();
    await waitForSessionConnection();

    fireEvent.change(screen.getByLabelText("1번째 문장"), { target: { value: "버스를 타고 왔어요." } });
    fireEvent.click(screen.getByRole("button", { name: "도움!" }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText("창밖에서 무엇이 가장 먼저 눈에 들어왔나요?")).toBeInTheDocument();
    expect(screen.getByText("디디의 도움 질문")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 생각해 볼게요" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "다시 생각해 볼게요" }));
    expect(screen.queryByText("디디의 도움 질문")).not.toBeInTheDocument();
  });

  it("아직 아무것도 못 쓴 채 도움을 누르면 API 질문 대신 문장 시작 예시를 건넨다", async () => {
    renderActivity();
    await waitForSessionConnection();

    // 초안이 빈 상태에서 도움 → 디디가 문장 시작 예시를 건네고, 외부 질문은 요청하지 않는다("먼저 생각하기").
    fireEvent.click(screen.getByRole("button", { name: "도움!" }));

    expect(screen.getByText(/이렇게 시작해도 좋아요/)).toBeInTheDocument();
    expect(screen.queryByText("디디가 문장 사이를 살펴보고 있어요.")).not.toBeInTheDocument();
    expect(help.requestGuidanceQuestion).not.toHaveBeenCalled();
  });

  it("입력칸 가까이 개인정보 안내를 보여 주고 해당 문장은 저장하지 않는다", () => {
    vi.useFakeTimers();
    renderActivity();

    expect(screen.getByText("이름·연락처·학교·학급·주소는 쓰지 않아요.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("1번째 문장"), { target: { value: "010-1234-5678" } });

    expect(screen.getByText(/개인정보로 보이는 내용은 빼고 적어 주세요/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "문장 저장" })).toBeDisabled();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(persistence.saveParticipant).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("저장 한도를 넘는 문장은 대시보드 기록으로 넘기지 않는다", () => {
    renderActivity();

    fireEvent.change(screen.getByLabelText("1번째 문장"), { target: { value: `${"가".repeat(280)}.` } });

    expect(screen.getByText("문장은 280자 안으로 적어 주세요.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "문장 저장" })).toBeDisabled();
  });

  it("도움 요청 중에는 분석 안내를 먼저 보여 주고 도움 버튼을 잠근다", async () => {
    // Given: 아직 답하지 않은 디디 요청
    const request = createGuidanceRequest();
    help.requestGuidanceQuestion.mockReturnValueOnce(request.promise);
    renderActivity();
    await waitForSessionConnection();
    fireEvent.change(screen.getByLabelText("1번째 문장"), { target: { value: "버스를 타고 왔어요." } });

    // When: 학생이 도움을 요청하면
    fireEvent.click(screen.getByRole("button", { name: "도움!" }));

    // Then: 안전한 분석 안내를 즉시 보여 주며 중복 요청을 막는다
    expect(screen.getByText("디디가 문장 사이를 살펴보고 있어요.")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("button", { name: "도움!" })).toBeDisabled();
  });

  it("도움 요청은 작성 카드를 자동으로 위로 스크롤하지 않는다", async () => {
    const originalScrollToDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo");
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const scrollTo = vi.fn();
    const request = createGuidanceRequest();

    try {
      HTMLElement.prototype.scrollTo = scrollTo;
      window.requestAnimationFrame = (callback) => {
        callback(0);
        return 1;
      };
      help.requestGuidanceQuestion.mockReturnValueOnce(request.promise);
      renderActivity();
      await waitForSessionConnection();

      fireEvent.click(screen.getByRole("button", { name: "도움!" }));

      expect(scrollTo).not.toHaveBeenCalled();
    } finally {
      if (originalScrollToDescriptor) {
        Object.defineProperty(HTMLElement.prototype, "scrollTo", originalScrollToDescriptor);
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
      }
      window.requestAnimationFrame = originalRequestAnimationFrame;
    }

    expect(Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo")).toEqual(originalScrollToDescriptor);
  });

  it("디디의 검증된 질문이 도착하면 분석 안내 대신 보여 준다", async () => {
    // Given: 아직 답하지 않은 디디 요청
    const request = createGuidanceRequest();
    help.requestGuidanceQuestion.mockReturnValueOnce(request.promise);
    renderActivity();
    await waitForSessionConnection();
    fireEvent.change(screen.getByLabelText("1번째 문장"), { target: { value: "버스를 타고 왔어요." } });
    fireEvent.click(screen.getByRole("button", { name: "도움!" }));

    // When: 디디의 질문이 도착하면
    await act(async () => {
      request.resolve("창밖의 빗소리는 다음 장면과 어떻게 이어지나요?");
      await request.promise;
    });

    // Then: 분석 안내가 아닌 디디의 질문을 보여 준다
    expect(screen.getByText("창밖의 빗소리는 다음 장면과 어떻게 이어지나요?")).toBeInTheDocument();
    expect(screen.queryByText("디디가 문장 사이를 살펴보고 있어요.")).not.toBeInTheDocument();
  });

  it("디디 요청이 실패한 뒤에만 안전한 대체 질문을 보여 준다", async () => {
    // Given: 실패할 디디 요청
    const request = createGuidanceRequest();
    help.requestGuidanceQuestion.mockReturnValueOnce(request.promise);
    renderActivity();
    await waitForSessionConnection();
    fireEvent.change(screen.getByLabelText("1번째 문장"), { target: { value: "버스를 타고 왔어요." } });
    fireEvent.click(screen.getByRole("button", { name: "도움!" }));

    // Then: 실패 전에는 대체 질문을 앞서 보여 주지 않는다
    expect(screen.queryByText("출발할 때 가장 먼저 보거나 들은 것은 무엇이었나요?")).not.toBeInTheDocument();

    // When: 요청이 실패하면
    await act(async () => {
      request.reject(new Error("guide unavailable"));
      try {
        await request.promise;
      } catch (error) {
        if (!(error instanceof Error)) {
          throw error;
        }
      }
    });

    // Then: 그제야 안전한 대체 질문을 보여 준다
    expect(screen.getByText("출발할 때 가장 먼저 보거나 들은 것은 무엇이었나요?")).toBeInTheDocument();
  });

  it("요청에 실패해도 확정한 첫 문장에 이어지는 질문을 건넨다", async () => {
    help.requestGuidanceQuestion.mockRejectedValueOnce(new Error("network failed"));
    renderActivity();
    await waitForSessionConnection();

    fireEvent.change(screen.getByLabelText("1번째 문장"), { target: { value: "버스를 타고 왔어요." } });
    fireEvent.click(screen.getByRole("button", { name: "문장 저장" }));
    fireEvent.change(screen.getByLabelText("2번째 문장"), { target: { value: "창밖을 봤어요." } });
    fireEvent.click(screen.getByRole("button", { name: "도움!" }));

    await waitFor(() => {
      expect(screen.getByText("“버스를 타고 왔어요” 다음에는 버스 안이나 창밖에서 가장 먼저 보인 것은 무엇이었나요?")).toBeInTheDocument();
    });
  });

  it("먼저 시작한 도움 요청이 나중 요청의 질문을 덮어쓰지 않는다", async () => {
    // Given: 순서가 뒤바뀔 수 있는 두 도움 요청
    const firstRequest = createGuidanceRequest();
    const secondRequest = createGuidanceRequest();
    help.requestGuidanceQuestion.mockReturnValueOnce(firstRequest.promise).mockReturnValueOnce(secondRequest.promise);
    renderActivity();
    await waitForSessionConnection();
    fireEvent.change(screen.getByLabelText("1번째 문장"), { target: { value: "버스를 타고 왔어요." } });
    fireEvent.click(screen.getByRole("button", { name: "도움!" }));
    fireEvent.click(screen.getByRole("button", { name: "문장 저장" }));
    fireEvent.change(screen.getByLabelText("2번째 문장"), { target: { value: "창밖에 비가 왔어요." } });
    fireEvent.click(screen.getByRole("button", { name: "도움!" }));

    // When: 나중 요청이 먼저 도착하고 처음 요청이 뒤늦게 도착하면
    await act(async () => {
      secondRequest.resolve("비가 다음 장면과 어떻게 이어지나요?");
      await secondRequest.promise;
    });
    await act(async () => {
      firstRequest.resolve("오래된 질문은 보여서는 안 되나요?");
      await firstRequest.promise;
    });

    // Then: 가장 최근 도움 요청의 질문만 남긴다
    expect(screen.getByText("비가 다음 장면과 어떻게 이어지나요?")).toBeInTheDocument();
    expect(screen.queryByText("오래된 질문은 보여서는 안 되나요?")).not.toBeInTheDocument();
  });

  it("수업 연결 전에는 도움 요청을 보내지 않는다", async () => {
    const identityRequest = createGuidanceRequest();
    identity.ensureStudentIdentity.mockReturnValueOnce(identityRequest.promise);
    renderActivity();
    fireEvent.change(screen.getByLabelText("1번째 문장"), { target: { value: "버스를 타고 왔어요." } });
    fireEvent.click(screen.getByRole("button", { name: "도움!" }));

    expect(persistence.createHelpRequest).not.toHaveBeenCalled();

    await act(async () => {
      identityRequest.resolve("student-late");
      await identityRequest.promise;
    });

    await waitForSessionConnection();
    fireEvent.click(screen.getByRole("button", { name: "도움!" }));

    expect(persistence.createHelpRequest).toHaveBeenCalledTimes(1);
    expect(persistence.createHelpRequest).toHaveBeenCalledWith(
      "test-session",
      "student-late",
      expect.any(String),
      [],
      1
    );
  });

  it("확정 문장을 고쳐도 진행 중인 도움 질문을 유지한다", async () => {
    const request = createGuidanceRequest();
    help.requestGuidanceQuestion.mockReturnValueOnce(request.promise);
    renderActivity();
    await waitForSessionConnection();
    fireEvent.change(screen.getByLabelText("1번째 문장"), { target: { value: "버스를 타고 왔어요." } });
    fireEvent.click(screen.getByRole("button", { name: "문장 저장" }));
    fireEvent.change(screen.getByLabelText("2번째 문장"), { target: { value: "창밖에 비가 왔어요." } });
    fireEvent.click(screen.getByRole("button", { name: "도움!" }));
    fireEvent.click(screen.getByRole("button", { name: /^지금까지 쓴 문장 1개/ }));
    fireEvent.click(screen.getByRole("button", { name: "1번째 문장 수정" }));
    fireEvent.change(screen.getByLabelText("1번째 문장 수정 내용"), { target: { value: "지하철을 타고 왔어요." } });
    fireEvent.click(screen.getByRole("button", { name: "수정 저장" }));

    await act(async () => {
      request.resolve("오래된 도움 질문은 보이면 안 되나요?");
      await request.promise;
    });

    expect(screen.getByText("오래된 도움 질문은 보이면 안 되나요?")).toBeInTheDocument();
  });

  it("초안을 바꾸면 이전 도움 요청의 늦은 응답을 무시한다", async () => {
    const request = createGuidanceRequest();
    help.requestGuidanceQuestion.mockReturnValueOnce(request.promise);
    renderActivity();
    fireEvent.change(screen.getByLabelText("1번째 문장"), { target: { value: "버스를 타고 왔어요." } });
    fireEvent.click(screen.getByRole("button", { name: "도움!" }));
    fireEvent.change(screen.getByLabelText("1번째 문장"), { target: { value: "지하철을 타고 왔어요." } });

    await act(async () => {
      request.resolve("이전 초안의 질문은 보이면 안 되나요?");
      await request.promise;
    });

    expect(screen.getByLabelText("1번째 문장")).toHaveValue("지하철을 타고 왔어요.");
    expect(screen.queryByText("이전 초안의 질문은 보이면 안 되나요?")).not.toBeInTheDocument();
  });

  it("보관함에서 앞 문장을 고쳐도 현재 초안과 단계는 유지한다", () => {
    const originalRequestAnimationFrame = window.requestAnimationFrame;

    try {
      window.requestAnimationFrame = (callback) => {
        callback(0);
        return 1;
      };
      renderActivity();
      fireEvent.change(screen.getByLabelText("1번째 문장"), { target: { value: "버스를 타고 왔어요." } });
      fireEvent.click(screen.getByRole("button", { name: "문장 저장" }));
      fireEvent.change(screen.getByLabelText("2번째 문장"), { target: { value: "창밖에 비가 왔어요." } });
      fireEvent.click(screen.getByRole("button", { name: /^지금까지 쓴 문장 1개/ }));
      fireEvent.click(screen.getByRole("button", { name: "1번째 문장 수정" }));
      fireEvent.change(screen.getByLabelText("1번째 문장 수정 내용"), { target: { value: "지하철을 타고 왔어요." } });
      fireEvent.click(screen.getByRole("button", { name: "수정 저장" }));

      expect(screen.getByLabelText("2번째 문장")).toHaveValue("창밖에 비가 왔어요.");
      expect(screen.getByText(/길찾기 탐험 · 2 \/ 5/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^지금까지 쓴 문장 1개/ })).toHaveTextContent("지하철을 타고 왔어요.");
      expect(document.activeElement).toHaveAccessibleName("2번째 문장");
    } finally {
      window.requestAnimationFrame = originalRequestAnimationFrame;
    }
  });

  it("다섯 문장을 각각 저장하면 한 문단으로 이어 보여 준다", () => {
    renderActivity();
    const sentences = [
      "버스를 타고 왔어요.",
      "창밖의 비를 봤어요.",
      "우산을 든 친구를 만났어요.",
      "함께 교문으로 걸었어요.",
      "그래서 오늘 길이 더 오래 기억날 것 같아요."
    ] as const;

    sentences.forEach((sentence, index) => {
      fireEvent.change(screen.getByLabelText(`${index + 1}번째 문장`), { target: { value: sentence } });
      fireEvent.click(screen.getByRole("button", { name: "문장 저장" }));
    });

    expect(screen.getByRole("heading", { name: "다섯 문장이 완성됐어요" })).toBeInTheDocument();
    expect(screen.getByTestId("complete-paragraph")).toHaveTextContent(sentences.join(" "));
    expect(screen.getByTestId("didi-gesture")).toHaveAttribute("data-gesture", "complete");
  });

  it("다섯 문장을 완성하면 칭찬 뒤에 디디의 마법으로 이어 읽기 버전을 보여 준다", () => {
    vi.useFakeTimers();
    renderActivity();
    const sentences = [
      "버스를 타고 왔어요.",
      "창밖의 비를 봤어요.",
      "우산을 든 친구를 만났어요.",
      "함께 교문으로 걸었어요.",
      "그래서 오늘 길이 더 오래 기억날 것 같아요."
    ] as const;

    sentences.forEach((sentence, index) => {
      fireEvent.change(screen.getByLabelText(`${index + 1}번째 문장`), { target: { value: sentence } });
      fireEvent.click(screen.getByRole("button", { name: "문장 저장" }));
    });

    expect(screen.getByText("이미 여러분은 훌륭한 글을 쓸 준비가 되었어요.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "디디의 마법 펼치기" })).toBeInTheDocument();
    expect(screen.queryByTestId("magic-paragraph")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "디디의 마법 펼치기" }));

    expect(screen.getByText("디디가 마법을 펼치고 있어요.")).toBeInTheDocument();
    expect(screen.getByTestId("didi-gesture")).toHaveAttribute("data-gesture", "cheer");

    act(() => {
      vi.advanceTimersByTime(900);
    });

    expect(screen.getByTestId("magic-paragraph")).toHaveTextContent(
      "버스를 타고 왔어요. 그러다 창밖의 비를 봤어요. 그때 우산을 든 친구를 만났어요. 이어서 함께 교문으로 걸었어요. 그래서 오늘 길이 더 오래 기억날 것 같아요."
    );
    expect(screen.getByRole("heading", { name: "더 멋진 글로 다듬어 볼까요?" })).toBeInTheDocument();
    expect(screen.getByTestId("complete-paragraph")).toHaveTextContent(sentences.join(" "));
    vi.useRealTimers();
  });

  it("마법을 펼치는 동안 축하 말풍선에서 상태를 알리고 다듬기 안내는 실제 행동과 맞춘다", () => {
    vi.useFakeTimers();
    renderActivity();
    const sentences = ["버스를 타고 왔어요.", "창밖의 비를 봤어요.", "친구를 만났어요.", "함께 걸었어요.", "오늘 길이 기억나요."] as const;

    sentences.forEach((sentence, index) => {
      fireEvent.change(screen.getByLabelText(`${index + 1}번째 문장`), { target: { value: sentence } });
      fireEvent.click(screen.getByRole("button", { name: "문장 저장" }));
    });

    fireEvent.click(screen.getByRole("button", { name: "디디의 마법 펼치기" }));

    const bubble = screen.getByText("디디의 축하").closest("div");
    if (!bubble) {
      throw new Error("축하 말풍선을 찾지 못했습니다.");
    }
    expect(within(bubble).getByText("디디가 마법을 펼치고 있어요.")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(900);
    });

    expect(screen.getByText("세 가지 중 하나를 골라, 원문에 내 말로 한마디를 더해 보세요.")).toBeInTheDocument();
    expect(screen.queryByText("아래 문장을 눌러, 내 말로 하나만 더 보태 보세요.")).not.toBeInTheDocument();
  });

  it("마법 결과에 이름을 붙이고 키보드 초점을 이어 읽기 영역으로 옮긴다", () => {
    vi.useFakeTimers();
    renderActivity();
    const sentences = ["버스를 타고 왔어요.", "창밖의 비를 봤어요.", "친구를 만났어요.", "함께 걸었어요.", "오늘 길이 기억나요."] as const;

    sentences.forEach((sentence, index) => {
      fireEvent.change(screen.getByLabelText(`${index + 1}번째 문장`), { target: { value: sentence } });
      fireEvent.click(screen.getByRole("button", { name: "문장 저장" }));
    });

    fireEvent.click(screen.getByRole("button", { name: "디디의 마법 펼치기" }));
    act(() => {
      vi.advanceTimersByTime(900);
    });

    const result = screen.getByRole("region", { name: "디디가 이어 읽어 본 글" });
    expect(result).toHaveFocus();
    expect(screen.getByRole("heading", { level: 2, name: "디디가 이어 읽어 본 글" })).toBeInTheDocument();
  });

  it("동작 줄이기 설정에서는 마법 효과를 건너뛰고 이어 읽기 버전을 바로 연다", () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    renderActivity();
    const sentences = ["버스를 타고 왔어요.", "창밖의 비를 봤어요.", "친구를 만났어요.", "함께 걸었어요.", "오늘 길이 기억나요."] as const;

    try {
      sentences.forEach((sentence, index) => {
        fireEvent.change(screen.getByLabelText(`${index + 1}번째 문장`), { target: { value: sentence } });
        fireEvent.click(screen.getByRole("button", { name: "문장 저장" }));
      });

      fireEvent.click(screen.getByRole("button", { name: "디디의 마법 펼치기" }));

      expect(screen.getByTestId("magic-paragraph")).toBeInTheDocument();
      expect(screen.queryByText("디디가 문장 사이에 마법을 더하고 있어요.")).not.toBeInTheDocument();
      expect(screen.getByTestId("didi-gesture")).toHaveAttribute("data-gesture", "complete");
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it("첫 카드 수정은 완성 문단에 반영된다", () => {
    // Given: 네 문장이 저장된 활동
    renderActivity();
    const sentences = ["버스를 타고 왔어요.", "창밖의 비를 봤어요.", "친구를 만났어요.", "함께 걸었어요."] as const;
    sentences.forEach((sentence, index) => {
      fireEvent.change(screen.getByLabelText(`${index + 1}번째 문장`), { target: { value: sentence } });
      fireEvent.click(screen.getByRole("button", { name: "문장 저장" }));
    });

    // When: 첫 번째 카드를 고치고 마지막 문장을 저장하면
    fireEvent.click(screen.getByRole("button", { name: /^지금까지 쓴 문장 4개/ }));
    fireEvent.click(screen.getByRole("button", { name: "1번째 문장 수정" }));
    fireEvent.change(screen.getByLabelText("1번째 문장 수정 내용"), { target: { value: "지하철을 타고 왔어요." } });
    fireEvent.click(screen.getByRole("button", { name: "수정 저장" }));
    fireEvent.change(screen.getByLabelText("5번째 문장"), { target: { value: "오늘 길이 기억나요." } });
    fireEvent.click(screen.getByRole("button", { name: "문장 저장" }));

    // Then: 수정한 문장으로 완성 문단을 만든다
    expect(screen.getByTestId("complete-paragraph")).toHaveTextContent(
      "지하철을 타고 왔어요. 창밖의 비를 봤어요. 친구를 만났어요. 함께 걸었어요. 오늘 길이 기억나요."
    );
  });

  it("완성 뒤에도 첫 카드를 고치면 완성 문단이 바뀐다", () => {
    renderActivity();
    const sentences = ["버스를 타고 왔어요.", "창밖의 비를 봤어요.", "친구를 만났어요.", "함께 걸었어요.", "오늘 길이 기억나요."] as const;
    sentences.forEach((sentence, index) => {
      fireEvent.change(screen.getByLabelText(`${index + 1}번째 문장`), { target: { value: sentence } });
      fireEvent.click(screen.getByRole("button", { name: "문장 저장" }));
    });

    fireEvent.click(screen.getByRole("button", { name: "1번째 문장 수정" }));
    fireEvent.change(screen.getByLabelText("1번째 문장 수정 내용"), { target: { value: "지하철을 타고 왔어요." } });
    fireEvent.click(screen.getByRole("button", { name: "1번째 문장 수정 저장" }));

    expect(screen.getByTestId("complete-paragraph")).toHaveTextContent(
      "지하철을 타고 왔어요. 창밖의 비를 봤어요. 친구를 만났어요. 함께 걸었어요. 오늘 길이 기억나요."
    );
  });

  it("도움 요청 뒤 자동 저장도 도움 요청 상태를 유지한다", async () => {
    vi.useFakeTimers();
    renderActivity();

    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.change(screen.getByLabelText("1번째 문장"), { target: { value: "버스를 타고 왔어요." } });
    fireEvent.click(screen.getByRole("button", { name: "문장 저장" }));
    fireEvent.click(screen.getByRole("button", { name: "도움!" }));

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(persistence.saveParticipant).toHaveBeenLastCalledWith(
      "test-session",
      "student-1",
      expect.any(String),
      ["버스를 타고 왔어요."],
      2,
      "help_requested"
    );
  });
});
