import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from "react";
import { dashboardPriority, type ParticipantStatus } from "../lib/activity";
import type { DeleteProgress, SessionParticipant } from "../lib/activityStore";

const DELETE_FAILURE_NOTICE = "기록을 지우지 못했어요. 잠시 뒤 다시 시도해 주세요.";

type DeletionTarget =
  | { readonly kind: "participant"; readonly participant: SessionParticipant }
  | { readonly kind: "session" };

type DeletionProgress = {
  readonly completed: number;
  readonly total: number;
};

export interface TeacherDashboardProps {
  readonly participants: readonly SessionParticipant[];
  readonly onDeleteParticipant: (participant: SessionParticipant, onProgress?: DeleteProgress) => Promise<void>;
  readonly onDeleteSession: (onProgress?: DeleteProgress) => Promise<void>;
  readonly onDeleteError?: (message: string) => void;
}

const statusLabel: Record<ParticipantStatus, string> = {
  writing: "작성 중",
  help_requested: "도움 요청",
  help_generating: "질문 준비 중",
  help_delivered: "질문을 건넸어요",
  completed: "완성"
};

function latestThought(sentences: readonly string[]): string {
  return sentences.filter((sentence) => sentence.trim()).join(" ") || "아직 문장을 쓰기 전이에요.";
}

function dialogCopy(target: DeletionTarget): { readonly title: string; readonly description: string; readonly confirmLabel: string } {
  if (target.kind === "participant") {
    return {
      title: `${target.participant.nickname}의 기록을 삭제할까요?`,
      description: "이 학생의 문장, 도움 요청, 응원 기록이 모두 삭제됩니다.",
      confirmLabel: "삭제하기"
    };
  }

  return {
    title: "수업 기록을 모두 삭제할까요?",
    description: "모든 참여자, 도움 요청, 응원 기록을 지우고 이 수업을 닫습니다. 같은 QR에서는 새 기록을 받을 수 없어요.",
    confirmLabel: "전체 기록 삭제"
  };
}

export function TeacherDashboard({
  participants,
  onDeleteParticipant,
  onDeleteSession,
  onDeleteError
}: TeacherDashboardProps): React.JSX.Element {
  const [deletionTarget, setDeletionTarget] = useState<DeletionTarget | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletionProgress, setDeletionProgress] = useState<DeletionProgress | null>(null);
  const [deletionError, setDeletionError] = useState<string | null>(null);
  const launchingButtonRef = useRef<HTMLButtonElement | null>(null);
  const sessionDeleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const dashboardHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const orderedParticipants = [...participants].sort(
    (left, right) => dashboardPriority(left.status) - dashboardPriority(right.status) || right.updatedAtMs - left.updatedAtMs
  );
  const helpCount = participants.filter((participant) => participant.status === "help_requested").length;
  const writingCount = participants.filter((participant) => participant.status === "writing").length;
  const completeCount = participants.filter((participant) => participant.status === "completed").length;

  useEffect(() => {
    if (deletionTarget && !isDeleting) {
      cancelButtonRef.current?.focus();
      return;
    }

    if (deletionTarget && isDeleting) {
      dialogRef.current?.focus();
      return;
    }

    if (!deletionTarget && !isDeleting && launchingButtonRef.current) {
      if (document.contains(launchingButtonRef.current) && !launchingButtonRef.current.disabled) {
        launchingButtonRef.current.focus();
      } else if (sessionDeleteButtonRef.current && !sessionDeleteButtonRef.current.disabled) {
        sessionDeleteButtonRef.current?.focus();
      } else {
        dashboardHeadingRef.current?.focus();
      }
      launchingButtonRef.current = null;
    }
  }, [deletionTarget, isDeleting]);

  useEffect(() => {
    if (!deletionTarget || isDeleting) {
      return;
    }

    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setDeletionTarget(null);
        setDeletionProgress(null);
      }
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [deletionTarget, isDeleting]);

  function openDeletionDialog(target: DeletionTarget, launchingButton: HTMLButtonElement): void {
    launchingButtonRef.current = launchingButton;
    setDeletionError(null);
    setDeletionProgress(null);
    setDeletionTarget(target);
  }

  function closeDeletionDialog(): void {
    if (isDeleting) {
      return;
    }

    setDeletionProgress(null);
    setDeletionError(null);
    setDeletionTarget(null);
  }

  function trapDialogFocus(event: ReactKeyboardEvent<HTMLElement>): void {
    if (event.key !== "Tab") {
      return;
    }

    event.preventDefault();
    if (isDeleting) {
      dialogRef.current?.focus();
      return;
    }

    if (event.shiftKey && document.activeElement === cancelButtonRef.current) {
      confirmButtonRef.current?.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === confirmButtonRef.current) {
      cancelButtonRef.current?.focus();
      return;
    }

    cancelButtonRef.current?.focus();
  }

  async function confirmDeletion(): Promise<void> {
    if (!deletionTarget || isDeleting) {
      return;
    }

    const onProgress: DeleteProgress = (completed, total) => setDeletionProgress({ completed, total });
    setIsDeleting(true);
    setDeletionError(null);
    setDeletionProgress(null);

    try {
      if (deletionTarget.kind === "participant") {
        await onDeleteParticipant(deletionTarget.participant, onProgress);
      } else {
        await onDeleteSession(onProgress);
      }
      setDeletionTarget(null);
    } catch (error: unknown) {
      if (error instanceof Error) {
        setDeletionError(DELETE_FAILURE_NOTICE);
        onDeleteError?.(DELETE_FAILURE_NOTICE);
      } else {
        setDeletionError(DELETE_FAILURE_NOTICE);
        onDeleteError?.(DELETE_FAILURE_NOTICE);
      }
    } finally {
      setIsDeleting(false);
    }
  }

  const copy = deletionTarget ? dialogCopy(deletionTarget) : null;

  return (
    <>
      <section className="admin-dashboard" aria-label="수업 운영 대시보드">
        <header className="admin-header">
          <div>
            <p className="admin-kicker">5문장 길찾기 · 실시간 운영</p>
            <h1 ref={dashboardHeadingRef} tabIndex={-1}>학생들의 생각이 자라고 있어요</h1>
          </div>
          <div className="admin-header__actions">
            <button
              type="button"
              ref={sessionDeleteButtonRef}
              className="admin-danger-button"
              disabled={isDeleting}
              onClick={(event) => openDeletionDialog({ kind: "session" }, event.currentTarget)}
            >
              수업 기록 모두 삭제
            </button>
            <a href="/" className="admin-exit">
              학생 화면 보기
            </a>
          </div>
        </header>
        <dl className="admin-stats">
          <div>
            <dt>참여</dt>
            <dd>{participants.length}</dd>
          </div>
          <div>
            <dt>작성 중</dt>
            <dd>{writingCount}</dd>
          </div>
          <div>
            <dt>도움 요청</dt>
            <dd>{helpCount}</dd>
          </div>
          <div>
            <dt>완성</dt>
            <dd>{completeCount}</dd>
          </div>
        </dl>
        {orderedParticipants.length === 0 ? (
          <p className="admin-empty">아직 참여한 학생이 없어요. QR로 들어오면 이곳에 실시간으로 나타납니다.</p>
        ) : (
          <div className="participant-grid" aria-live="polite">
            {orderedParticipants.map((participant) => (
              <article className={`participant-card participant-card--${participant.status}`} data-testid="participant-card" key={participant.id}>
                <div className="participant-card__topline">
                  <strong>{participant.nickname}</strong>
                  <span>{statusLabel[participant.status]}</span>
                </div>
                <p className="participant-card__step">{participant.currentStep} / 5문장으로 생각 넓히는 중</p>
                <p className="participant-card__sentence">{latestThought(participant.sentences)}</p>
                <button
                  type="button"
                  className="participant-card__delete"
                  disabled={isDeleting}
                  onClick={(event) => openDeletionDialog({ kind: "participant", participant }, event.currentTarget)}
                >
                  {participant.nickname} 기록 삭제
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
      {deletionTarget && copy ? (
        <div className="admin-dialog-backdrop">
          <section
            aria-describedby="delete-dialog-description"
            aria-labelledby="delete-dialog-title"
            aria-modal="true"
            className="admin-dialog"
            onKeyDown={trapDialogFocus}
            ref={dialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <h2 id="delete-dialog-title">{copy.title}</h2>
            <p id="delete-dialog-description">{copy.description}</p>
            {isDeleting ? (
              <p aria-live="polite" className="admin-dialog__progress" role="status">
                {deletionProgress ? `기록을 지우고 있어요. ${deletionProgress.completed} / ${deletionProgress.total}` : "기록을 지우고 있어요."}
              </p>
            ) : null}
            {deletionError ? <p className="admin-dialog__error" role="alert">{deletionError}</p> : null}
            <div className="admin-dialog__actions">
              <button ref={cancelButtonRef} type="button" disabled={isDeleting} onClick={closeDeletionDialog}>
                취소
              </button>
              <button ref={confirmButtonRef} type="button" className="admin-dialog__confirm" disabled={isDeleting} onClick={() => void confirmDeletion()}>
                {copy.confirmLabel}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
