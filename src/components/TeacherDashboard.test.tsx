import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import type { DeleteProgress, SessionParticipant } from "../lib/activityStore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminDashboard } from "./AdminDashboard";
import { TeacherDashboard } from "./TeacherDashboard";

const dashboardFirebaseMocks = vi.hoisted(() => ({ signInAsAdmin: vi.fn() }));
const dashboardStoreMocks = vi.hoisted(() => ({
  deleteParticipantHistory: vi.fn(),
  deleteSessionHistory: vi.fn(),
  prepareSession: vi.fn(),
  subscribeToParticipants: vi.fn()
}));

vi.mock("../lib/firebase", () => ({ signInAsAdmin: dashboardFirebaseMocks.signInAsAdmin }));
vi.mock("../lib/activityStore", () => ({
  deleteParticipantHistory: dashboardStoreMocks.deleteParticipantHistory,
  deleteSessionHistory: dashboardStoreMocks.deleteSessionHistory,
  prepareSession: dashboardStoreMocks.prepareSession,
  subscribeToParticipants: dashboardStoreMocks.subscribeToParticipants
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

function deleteParticipantCallback(): (participant: SessionParticipant, onProgress?: DeleteProgress) => Promise<void> {
  return vi.fn<(participant: SessionParticipant, onProgress?: DeleteProgress) => Promise<void>>().mockResolvedValue(undefined);
}

function deleteSessionCallback(): (onProgress?: DeleteProgress) => Promise<void> {
  return vi.fn<(onProgress?: DeleteProgress) => Promise<void>>().mockResolvedValue(undefined);
}

afterEach(() => cleanup());

beforeEach(() => {
  dashboardFirebaseMocks.signInAsAdmin.mockReset();
  dashboardStoreMocks.deleteParticipantHistory.mockReset();
  dashboardStoreMocks.deleteSessionHistory.mockReset();
  dashboardStoreMocks.prepareSession.mockReset();
  dashboardStoreMocks.subscribeToParticipants.mockReset();
  dashboardStoreMocks.prepareSession.mockResolvedValue("active");
});

describe("TeacherDashboard", () => {
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

  it("전체 기록은 전체 기록 삭제를 확인한 뒤에만 삭제한다", () => {
    const onDeleteSession = deleteSessionCallback();
    render(
      <TeacherDashboard
        participants={participants}
        onDeleteParticipant={deleteParticipantCallback()}
        onDeleteSession={onDeleteSession}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "수업 기록 모두 삭제" }));

    expect(onDeleteSession).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveTextContent("모든 참여자, 도움 요청, 응원 기록을 지우고 이 수업을 닫습니다.");

    fireEvent.click(screen.getByRole("button", { name: "전체 기록 삭제" }));

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
    expect(screen.getByRole("button", { name: "수업 기록 모두 삭제" })).toBeDisabled();
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

    const sessionDeleteButton = screen.getByRole("button", { name: "수업 기록 모두 삭제" });
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

  it("관리자 대시보드는 확인 뒤 arrival 참여자 삭제 함수를 연결한다", async () => {
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

    await waitFor(() => expect(dashboardStoreMocks.deleteParticipantHistory).toHaveBeenCalledWith("arrival", participants[1], expect.any(Function)));
  });

  it("관리자 대시보드는 확인 뒤 arrival 수업 기록 삭제 함수를 연결한다", async () => {
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

    fireEvent.click(await screen.findByRole("button", { name: "수업 기록 모두 삭제" }));
    fireEvent.click(screen.getByRole("button", { name: "전체 기록 삭제" }));

    await waitFor(() => expect(dashboardStoreMocks.deleteSessionHistory).toHaveBeenCalledWith("arrival", expect.any(Function)));
  });
});
