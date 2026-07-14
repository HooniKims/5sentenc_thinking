import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { forwardRef, useState } from "react";
import type { ClassSession, DeleteProgress, SessionParticipant } from "../lib/activityStore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminDashboard } from "./AdminDashboard";
import { TeacherDashboard } from "./TeacherDashboard";

const dashboardFirebaseMocks = vi.hoisted(() => ({ signInAsAdmin: vi.fn() }));
const dashboardStoreMocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  deleteArchivedSession: vi.fn(),
  deleteParticipantHistory: vi.fn(),
  deleteSessionHistory: vi.fn(),
  subscribeToSessions: vi.fn(),
  subscribeToParticipants: vi.fn()
}));

vi.mock("../lib/firebase", () => ({ signInAsAdmin: dashboardFirebaseMocks.signInAsAdmin }));
vi.mock("../lib/activityStore", () => ({
  createSession: dashboardStoreMocks.createSession,
  deleteArchivedSession: dashboardStoreMocks.deleteArchivedSession,
  deleteParticipantHistory: dashboardStoreMocks.deleteParticipantHistory,
  deleteSessionHistory: dashboardStoreMocks.deleteSessionHistory,
  subscribeToSessions: dashboardStoreMocks.subscribeToSessions,
  subscribeToParticipants: dashboardStoreMocks.subscribeToParticipants
}));

vi.mock("qrcode.react", () => ({
  QRCodeSVG: forwardRef<SVGSVGElement, { readonly "aria-label"?: string }>(function MockQrCodeSvg({ "aria-label": ariaLabel }, ref) {
    return <svg ref={ref} role="img" aria-label={ariaLabel} />;
  }),
  QRCodeCanvas: forwardRef<HTMLCanvasElement, { readonly className?: string }>(function MockQrCodeCanvas({ className }, ref) {
    return <canvas ref={ref} className={className} />;
  })
}));

const participants: readonly SessionParticipant[] = [
  {
    id: "writing-student",
    ownerUid: "writing-student",
    nickname: "푸른나침반 01",
    sentences: ["버스를 타고 왔어요."],
    currentStep: 1,
    status: "writing",
    updatedAtMs: 200
  },
  {
    id: "help-student",
    ownerUid: "help-student",
    nickname: "별빛탐험가 02",
    sentences: ["교문 앞에서 멈췄어요.", "친구를 기다렸어요."],
    currentStep: 2,
    status: "help_requested",
    updatedAtMs: 100
  }
];

const activeSessions: readonly ClassSession[] = [
  {
    id: "session-53d41958-f6b5-4dd6-a08d-89e833a6b3d6",
    state: "active",
    openedAtMs: 1,
    archivedAtMs: null
  }
];

function deleteParticipantCallback(): (participant: SessionParticipant, onProgress?: DeleteProgress) => Promise<void> {
  return vi.fn<(participant: SessionParticipant, onProgress?: DeleteProgress) => Promise<void>>().mockResolvedValue(undefined);
}

function deleteSessionCallback(): (onProgress?: DeleteProgress) => Promise<void> {
  return vi.fn<(onProgress?: DeleteProgress) => Promise<void>>().mockResolvedValue(undefined);
}

afterEach(() => cleanup());

beforeEach(() => {
  dashboardFirebaseMocks.signInAsAdmin.mockReset();
  dashboardStoreMocks.deleteArchivedSession.mockReset();
  dashboardStoreMocks.deleteParticipantHistory.mockReset();
  dashboardStoreMocks.deleteSessionHistory.mockReset();
  dashboardStoreMocks.createSession.mockReset();
  dashboardStoreMocks.subscribeToSessions.mockReset();
  dashboardStoreMocks.subscribeToParticipants.mockReset();
  dashboardStoreMocks.subscribeToSessions.mockImplementation(
    (onSessions: (sessions: readonly ClassSession[]) => void) => {
      onSessions(activeSessions);
      return () => undefined;
    }
  );
});

describe("TeacherDashboard", () => {
  it("기록을 정리한 뒤에는 새 수업 열기부터 보여 준다", async () => {
    dashboardFirebaseMocks.signInAsAdmin.mockResolvedValue(undefined);
    dashboardStoreMocks.subscribeToSessions.mockImplementation(
      (onSessions: (sessions: readonly unknown[]) => void) => {
        onSessions([]);
        return () => undefined;
      }
    );
    dashboardStoreMocks.createSession.mockResolvedValue("session-53d41958-f6b5-4dd6-a08d-89e833a6b3d6");

    render(<AdminDashboard />);
    fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "teacher@example.com" } });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "password" } });
    fireEvent.click(screen.getByRole("button", { name: "대시보드 열기" }));

    expect(await screen.findByRole("heading", { name: "새 수업을 열까요?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "새 수업 열기" }));

    await waitFor(() => expect(dashboardStoreMocks.createSession).toHaveBeenCalledTimes(1));
  });

  it("수업 목록의 첫 응답을 받기 전에는 새 수업을 열지 않는다", async () => {
    let deliverSessions: ((sessions: readonly ClassSession[]) => void) | undefined;
    dashboardFirebaseMocks.signInAsAdmin.mockResolvedValue(undefined);
    dashboardStoreMocks.subscribeToSessions.mockImplementation(
      (onSessions: (sessions: readonly ClassSession[]) => void) => {
        deliverSessions = onSessions;
        return () => undefined;
      }
    );

    render(<AdminDashboard />);
    fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "teacher@example.com" } });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "password" } });
    fireEvent.click(screen.getByRole("button", { name: "대시보드 열기" }));

    expect(await screen.findByRole("heading", { name: "수업을 확인하고 있어요" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "새 수업 열기" })).not.toBeInTheDocument();
    expect(dashboardStoreMocks.createSession).not.toHaveBeenCalled();

    deliverSessions?.([]);

    expect(await screen.findByRole("button", { name: "새 수업 열기" })).toBeInTheDocument();
  });

  it("캐시에 빈 목록이 있어도 서버 수업 목록을 확인할 때까지 새 수업을 열지 않는다", async () => {
    let deliverSessions: ((sessions: readonly ClassSession[], fromCache: boolean) => void) | undefined;
    dashboardFirebaseMocks.signInAsAdmin.mockResolvedValue(undefined);
    dashboardStoreMocks.subscribeToSessions.mockImplementation(
      (onSessions: (sessions: readonly ClassSession[], fromCache: boolean) => void) => {
        deliverSessions = onSessions;
        return () => undefined;
      }
    );

    render(<AdminDashboard />);
    fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "teacher@example.com" } });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "password" } });
    fireEvent.click(screen.getByRole("button", { name: "대시보드 열기" }));

    deliverSessions?.([], true);
    expect(await screen.findByRole("heading", { name: "수업을 확인하고 있어요" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "새 수업 열기" })).not.toBeInTheDocument();

    deliverSessions?.(activeSessions, false);
    expect(await screen.findByRole("heading", { name: "학생 참여 QR" })).toBeInTheDocument();
  });

  it("새 수업이 목록에 나타날 때까지 생성 버튼을 잠근다", async () => {
    let finishCreation: ((sessionId: string) => void) | undefined;
    dashboardFirebaseMocks.signInAsAdmin.mockResolvedValue(undefined);
    dashboardStoreMocks.subscribeToSessions.mockImplementation(
      (onSessions: (sessions: readonly ClassSession[]) => void) => {
        onSessions([]);
        return () => undefined;
      }
    );
    dashboardStoreMocks.createSession.mockImplementation(
      () => new Promise<string>((resolve) => { finishCreation = resolve; })
    );

    render(<AdminDashboard />);
    fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "teacher@example.com" } });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "password" } });
    fireEvent.click(screen.getByRole("button", { name: "대시보드 열기" }));

    const createButton = await screen.findByRole("button", { name: "새 수업 열기" });
    fireEvent.click(createButton);
    expect(createButton).toBeDisabled();

    finishCreation?.("session-53d41958-f6b5-4dd6-a08d-89e833a6b3d6");

    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));

    expect(createButton).toBeDisabled();
    expect(dashboardStoreMocks.createSession).toHaveBeenCalledTimes(1);
  });

  it("수업을 보관한 뒤에는 다음 수업을 다시 열 수 있다", async () => {
    const newSessionId = "session-next";
    let deliverSessions: ((sessions: readonly ClassSession[], fromCache: boolean) => void) | undefined;
    dashboardFirebaseMocks.signInAsAdmin.mockResolvedValue(undefined);
    dashboardStoreMocks.subscribeToSessions.mockImplementation(
      (onSessions: (sessions: readonly ClassSession[], fromCache: boolean) => void) => {
        deliverSessions = onSessions;
        onSessions([], false);
        return () => undefined;
      }
    );
    dashboardStoreMocks.createSession.mockResolvedValue(newSessionId);

    render(<AdminDashboard />);
    fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "teacher@example.com" } });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "password" } });
    fireEvent.click(screen.getByRole("button", { name: "대시보드 열기" }));

    const firstCreateButton = await screen.findByRole("button", { name: "새 수업 열기" });
    fireEvent.click(firstCreateButton);
    await waitFor(() => expect(dashboardStoreMocks.createSession).toHaveBeenCalledTimes(1));

    deliverSessions?.([
      { id: newSessionId, state: "active", openedAtMs: 2, archivedAtMs: null }
    ], false);
    expect(await screen.findByRole("heading", { name: "학생 참여 QR" })).toBeInTheDocument();

    deliverSessions?.([
      { id: newSessionId, state: "archived", openedAtMs: 2, archivedAtMs: 3 }
    ], false);
    const nextCreateButton = await screen.findByRole("button", { name: "새 수업 열기" });
    expect(nextCreateButton).toBeEnabled();
    fireEvent.click(nextCreateButton);

    await waitFor(() => expect(dashboardStoreMocks.createSession).toHaveBeenCalledTimes(2));
  });

  it("진행 중인 수업의 QR과 참여 링크에 그 수업 id를 넣는다", async () => {
    dashboardFirebaseMocks.signInAsAdmin.mockResolvedValue(undefined);

    render(<AdminDashboard />);
    fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "teacher@example.com" } });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "password" } });
    fireEvent.click(screen.getByRole("button", { name: "대시보드 열기" }));

    expect(await screen.findByRole("img", { name: "학생 참여 QR 코드" })).toBeInTheDocument();
    expect(screen.getByLabelText("학생 참여 링크")).toHaveValue(
      `http://localhost:3000/?session=${activeSessions[0]?.id}`
    );
    expect(screen.getByRole("link", { name: "학생 화면 보기" })).toHaveAttribute(
      "href",
      `http://localhost:3000/?session=${activeSessions[0]?.id}`
    );
    expect(screen.getByRole("button", { name: "QR 이미지 내려받기" })).toBeInTheDocument();
  });

  it("정리 중인 수업은 QR을 숨기고 남은 기록 정리를 다시 시도할 수 있다", async () => {
    dashboardFirebaseMocks.signInAsAdmin.mockResolvedValue(undefined);
    dashboardStoreMocks.subscribeToSessions.mockImplementation(
      (onSessions: (sessions: readonly ClassSession[]) => void) => {
        onSessions([
          {
            id: activeSessions[0]?.id ?? "session-unknown",
            state: "archiving",
            openedAtMs: 1,
            archivedAtMs: null
          }
        ]);
        return () => undefined;
      }
    );
    dashboardStoreMocks.deleteSessionHistory.mockResolvedValue(undefined);

    render(<AdminDashboard />);
    fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "teacher@example.com" } });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "password" } });
    fireEvent.click(screen.getByRole("button", { name: "대시보드 열기" }));

    expect(await screen.findByRole("heading", { name: "학생 참여를 멈췄어요" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "학생 참여 QR 코드" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "학생 화면 보기" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "수업 정리 다시 시도" }));
    fireEvent.click(screen.getByRole("button", { name: "정리 다시 시도" }));

    await waitFor(() => expect(dashboardStoreMocks.deleteSessionHistory).toHaveBeenCalledWith(activeSessions[0]?.id, expect.any(Function)));
  });

  it("보관함에는 수업 시각만 남기고 학생 기록은 남기지 않는다", async () => {
    dashboardFirebaseMocks.signInAsAdmin.mockResolvedValue(undefined);
    dashboardStoreMocks.subscribeToSessions.mockImplementation(
      (onSessions: (sessions: readonly ClassSession[]) => void) => {
        onSessions([
          {
            id: "arrival",
            state: "archived",
            openedAtMs: 1_784_246_400_000,
            archivedAtMs: 1_784_250_000_000
          }
        ]);
        return () => undefined;
      }
    );

    render(<AdminDashboard />);
    fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "teacher@example.com" } });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "password" } });
    fireEvent.click(screen.getByRole("button", { name: "대시보드 열기" }));

    expect(await screen.findByRole("heading", { name: "기록을 정리한 수업" })).toBeInTheDocument();
    expect(screen.getByText("학생 글과 도움 요청은 지우고, 수업을 연 시각과 정리한 시각만 남겨 두었어요.")).toBeInTheDocument();
  });

  it("보관한 수업은 확인한 뒤에만 보관함에서 완전히 삭제한다", async () => {
    const archivedSession: ClassSession = {
      id: "arrival",
      state: "archived",
      openedAtMs: 1_784_246_400_000,
      archivedAtMs: 1_784_250_000_000
    };
    dashboardFirebaseMocks.signInAsAdmin.mockResolvedValue(undefined);
    dashboardStoreMocks.subscribeToSessions.mockImplementation(
      (onSessions: (sessions: readonly ClassSession[]) => void) => {
        onSessions([archivedSession]);
        return () => undefined;
      }
    );
    dashboardStoreMocks.deleteArchivedSession.mockResolvedValue(undefined);

    render(<AdminDashboard />);
    fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "teacher@example.com" } });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "password" } });
    fireEvent.click(screen.getByRole("button", { name: "대시보드 열기" }));

    fireEvent.click(await screen.findByRole("button", { name: "수업 삭제" }));

    expect(dashboardStoreMocks.deleteArchivedSession).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveTextContent("보관한 수업을 완전히 지울까요?");
    expect(screen.getByRole("dialog")).toHaveTextContent("학생 기록과 수업 시각이 모두 사라지고 되돌릴 수 없어요.");

    fireEvent.click(screen.getByRole("button", { name: "보관한 수업 삭제" }));

    await waitFor(() => {
      expect(dashboardStoreMocks.deleteArchivedSession).toHaveBeenCalledWith(archivedSession, expect.any(Function));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("도움 요청 학생을 실시간 카드의 첫 번째에 놓는다", () => {
    render(
      <TeacherDashboard
        participants={participants}
        onDeleteParticipant={deleteParticipantCallback()}
        onDeleteSession={deleteSessionCallback()}
      />
    );

    expect(screen.getAllByTestId("participant-card")[0]).toHaveTextContent(/별빛탐험가 02\s*도움 요청/);
    expect(screen.getAllByTestId("participant-card")[0]).toHaveTextContent("교문 앞에서 멈췄어요. 친구를 기다렸어요.");
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("개별 기록은 확인한 뒤에만 삭제한다", async () => {
    const onDeleteParticipant = deleteParticipantCallback();
    render(
      <TeacherDashboard
        participants={participants}
        onDeleteParticipant={onDeleteParticipant}
        onDeleteSession={deleteSessionCallback()}
      />
    );

    const deleteButton = screen.getByRole("button", { name: "별빛탐험가 02 기록 삭제" });
    fireEvent.click(deleteButton);

    expect(onDeleteParticipant).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("별빛탐험가 02의 기록을 삭제할까요?");
    expect(dialog).toHaveTextContent("문장, 도움 요청, 응원 기록이 모두 삭제됩니다.");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("button", { name: "취소" })).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "삭제하기" }));

    expect(onDeleteParticipant).toHaveBeenCalledWith(participants[1], expect.any(Function));
  });

  it("수업 기록은 보관 확인 뒤에만 삭제한다", () => {
    const onDeleteSession = deleteSessionCallback();
    render(
      <TeacherDashboard
        participants={participants}
        onDeleteParticipant={deleteParticipantCallback()}
        onDeleteSession={onDeleteSession}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "기록 삭제하고 수업 보관" }));

    expect(onDeleteSession).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveTextContent("모든 참여자, 도움 요청, 응원 기록을 지우고 이 수업은 보관합니다.");

    fireEvent.click(screen.getByRole("button", { name: "기록 삭제하고 보관" }));

    expect(onDeleteSession).toHaveBeenCalledWith(expect.any(Function));
  });

  it("삭제 진행 상황을 대화상자에 보여 준다", async () => {
    let finishDeletion: (() => void) | undefined;
    const onDeleteParticipant = vi.fn<(participant: SessionParticipant, onProgress?: DeleteProgress) => Promise<void>>(
      (_participant, onProgress) =>
        new Promise<void>((resolve) => {
          finishDeletion = resolve;
          onProgress?.(2, 5);
        })
    );
    render(
      <TeacherDashboard
        participants={participants}
        onDeleteParticipant={onDeleteParticipant}
        onDeleteSession={deleteSessionCallback()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "별빛탐험가 02 기록 삭제" }));
    fireEvent.click(screen.getByRole("button", { name: "삭제하기" }));

    expect(screen.getByRole("dialog")).toHaveTextContent("기록을 지우고 있어요. 2 / 5");
    expect(screen.getByRole("button", { name: "삭제하기" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "취소" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "별빛탐험가 02 기록 삭제" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "기록 삭제하고 수업 보관" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "삭제하기" }));
    expect(onDeleteParticipant).toHaveBeenCalledTimes(1);

    finishDeletion?.();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("삭제에 실패하면 대화상자를 유지하고 오류를 알린다", async () => {
    const onDeleteError = vi.fn();
    const onDeleteParticipant = vi.fn<(participant: SessionParticipant, onProgress?: DeleteProgress) => Promise<void>>().mockRejectedValue(new Error("failed"));
    render(
      <TeacherDashboard
        participants={participants}
        onDeleteParticipant={onDeleteParticipant}
        onDeleteSession={deleteSessionCallback()}
        onDeleteError={onDeleteError}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "별빛탐험가 02 기록 삭제" }));
    fireEvent.click(screen.getByRole("button", { name: "삭제하기" }));

    await waitFor(() => expect(onDeleteError).toHaveBeenCalledWith("기록을 지우지 못했어요. 잠시 뒤 다시 시도해 주세요."));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "삭제하기" })).toBeEnabled();
  });

  it("Escape로 확인을 닫고 실행한 버튼으로 초점을 돌린다", () => {
    render(
      <TeacherDashboard
        participants={participants}
        onDeleteParticipant={deleteParticipantCallback()}
        onDeleteSession={deleteSessionCallback()}
      />
    );

    const deleteButton = screen.getByRole("button", { name: "별빛탐험가 02 기록 삭제" });
    deleteButton.focus();
    fireEvent.click(deleteButton);
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(deleteButton).toHaveFocus();
  });

  it("삭제에 성공해 학생 카드가 사라져도 활성화된 수업 기록 삭제 버튼으로 초점을 옮긴다", async () => {
    let finishDeletion: (() => void) | undefined;
    const onDeleteParticipant = vi.fn<(participant: SessionParticipant, onProgress?: DeleteProgress) => Promise<void>>(
      () => new Promise<void>((resolve) => { finishDeletion = resolve; })
    );

    function LiveDashboard(): React.JSX.Element {
      const [liveParticipants, setLiveParticipants] = useState(participants);

      async function handleDeleteParticipant(participant: SessionParticipant, onProgress?: DeleteProgress): Promise<void> {
        await onDeleteParticipant(participant, onProgress);
        setLiveParticipants([]);
      }

      return (
        <TeacherDashboard
          participants={liveParticipants}
          onDeleteParticipant={handleDeleteParticipant}
          onDeleteSession={deleteSessionCallback()}
        />
      );
    }

    render(<LiveDashboard />);
    fireEvent.click(screen.getByRole("button", { name: "별빛탐험가 02 기록 삭제" }));
    fireEvent.click(screen.getByRole("button", { name: "삭제하기" }));

    finishDeletion?.();

    const sessionDeleteButton = screen.getByRole("button", { name: "기록 삭제하고 수업 보관" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(sessionDeleteButton).toBeEnabled();
      expect(sessionDeleteButton).toHaveFocus();
    });
  });

  it("관리자 대시보드는 삭제 실패를 안내문으로 알린다", async () => {
    dashboardFirebaseMocks.signInAsAdmin.mockResolvedValue(undefined);
    dashboardStoreMocks.subscribeToParticipants.mockImplementation(
      (_sessionId: string, onParticipants: (nextParticipants: readonly SessionParticipant[]) => void) => {
        onParticipants(participants);
        return () => undefined;
      }
    );
    dashboardStoreMocks.deleteParticipantHistory.mockRejectedValue(new Error("failed"));

    render(<AdminDashboard />);
    fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "teacher@example.com" } });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "password" } });
    fireEvent.click(screen.getByRole("button", { name: "대시보드 열기" }));

    const deleteButton = await screen.findByRole("button", { name: "별빛탐험가 02 기록 삭제" });
    fireEvent.click(deleteButton);
    fireEvent.click(screen.getByRole("button", { name: "삭제하기" }));

    await waitFor(() => expect(screen.getAllByText("기록을 지우지 못했어요. 잠시 뒤 다시 시도해 주세요.")).toHaveLength(2));
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("기록을 지우지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("관리자 대시보드는 확인 뒤 현재 수업 참여자 삭제 함수를 연결한다", async () => {
    dashboardFirebaseMocks.signInAsAdmin.mockResolvedValue(undefined);
    dashboardStoreMocks.subscribeToParticipants.mockImplementation(
      (_sessionId: string, onParticipants: (nextParticipants: readonly SessionParticipant[]) => void) => {
        onParticipants(participants);
        return () => undefined;
      }
    );
    dashboardStoreMocks.deleteParticipantHistory.mockResolvedValue(undefined);

    render(<AdminDashboard />);
    fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "teacher@example.com" } });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "password" } });
    fireEvent.click(screen.getByRole("button", { name: "대시보드 열기" }));

    fireEvent.click(await screen.findByRole("button", { name: "별빛탐험가 02 기록 삭제" }));
    fireEvent.click(screen.getByRole("button", { name: "삭제하기" }));

    await waitFor(() => expect(dashboardStoreMocks.deleteParticipantHistory).toHaveBeenCalledWith(activeSessions[0]?.id, participants[1], expect.any(Function)));
  });

  it("관리자 대시보드는 확인 뒤 현재 수업 기록 보관 함수를 연결한다", async () => {
    dashboardFirebaseMocks.signInAsAdmin.mockResolvedValue(undefined);
    dashboardStoreMocks.subscribeToParticipants.mockImplementation(
      (_sessionId: string, onParticipants: (nextParticipants: readonly SessionParticipant[]) => void) => {
        onParticipants(participants);
        return () => undefined;
      }
    );
    dashboardStoreMocks.deleteSessionHistory.mockResolvedValue(undefined);

    render(<AdminDashboard />);
    fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "teacher@example.com" } });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "password" } });
    fireEvent.click(screen.getByRole("button", { name: "대시보드 열기" }));

    fireEvent.click(await screen.findByRole("button", { name: "기록 삭제하고 수업 보관" }));
    fireEvent.click(screen.getByRole("button", { name: "기록 삭제하고 보관" }));

    await waitFor(() => expect(dashboardStoreMocks.deleteSessionHistory).toHaveBeenCalledWith(activeSessions[0]?.id, expect.any(Function)));
  });
});
