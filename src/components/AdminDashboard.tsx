import { useEffect, useRef, useState } from "react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { signInAsAdmin } from "../lib/firebase";
import {
  createSession,
  deleteArchivedSession,
  deleteParticipantHistory,
  deleteSessionHistory,
  subscribeToParticipants,
  subscribeToSessions,
  type ClassSession,
  type SessionParticipant
} from "../lib/activityStore";
import { downloadQrPng } from "../lib/qrDownload";
import { TeacherDashboard } from "./TeacherDashboard";

const QR_DOWNLOAD_FILE_NAME = "5문장-길찾기-학생-참여-QR.png";
const QR_DOWNLOAD_BACKGROUND_COLOR = "#fdf8ff";
const QR_DOWNLOAD_FOREGROUND_COLOR = "#140a29";

function readableLoginError(error: unknown): string {
  if (error instanceof Error) {
    return "로그인 정보를 확인해 주세요.";
  }

  return "로그인 중 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.";
}

function sessionLink(sessionId: string): string {
  const url = new URL(window.location.origin);
  url.searchParams.set("session", sessionId);
  return url.toString();
}

function sessionDate(timestamp: number): string {
  if (timestamp === 0) {
    return "날짜를 확인하는 중";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(timestamp));
}

interface ArchivedSessionsProps {
  readonly sessions: readonly ClassSession[];
  readonly onDeleteSession: (session: ClassSession) => void;
}

function ArchivedSessions({ sessions, onDeleteSession }: ArchivedSessionsProps): React.JSX.Element | null {
  if (sessions.length === 0) {
    return null;
  }

  return (
    <section className="admin-session-archive" aria-labelledby="archived-sessions-title">
      <div>
        <p className="admin-kicker">수업 보관함</p>
        <h2 id="archived-sessions-title">기록을 정리한 수업</h2>
        <p>학생 글과 도움 요청은 지우고, 수업을 연 시각과 정리한 시각만 남겨 두었어요.</p>
      </div>
      <ul>
        {sessions.map((session) => (
          <li key={session.id}>
            <div className="admin-session-archive__details">
              <strong>{sessionDate(session.openedAtMs)} 수업</strong>
              <span>{session.archivedAtMs === null ? "정리한 시각을 확인하는 중" : `${sessionDate(session.archivedAtMs)}에 보관함`}</span>
            </div>
            <button type="button" className="admin-session-archive__delete" onClick={() => onDeleteSession(session)}>
              수업 삭제
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

interface ArchivedSessionDeleteDialogProps {
  readonly deleting: boolean;
  readonly errorMessage: string | null;
  readonly progress: { readonly completed: number; readonly total: number } | null;
  readonly session: ClassSession | null;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

function ArchivedSessionDeleteDialog({
  deleting,
  errorMessage,
  progress,
  session,
  onCancel,
  onConfirm
}: ArchivedSessionDeleteDialogProps): React.JSX.Element | null {
  const cancelButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (session) {
      cancelButton.current?.focus();
    }
  }, [session]);

  if (!session) {
    return null;
  }

  return (
    <div className="admin-dialog-backdrop">
      <section
        aria-describedby="archived-session-delete-description"
        aria-labelledby="archived-session-delete-title"
        aria-modal="true"
        className="admin-dialog"
        role="dialog"
      >
        <h2 id="archived-session-delete-title">보관한 수업을 완전히 지울까요?</h2>
        <p id="archived-session-delete-description">학생 기록과 수업 시각이 모두 사라지고 되돌릴 수 없어요.</p>
        {deleting ? (
          <p aria-live="polite" className="admin-dialog__progress" role="status">
            {progress ? `보관한 수업을 지우고 있어요. ${progress.completed} / ${progress.total}` : "보관한 수업을 지우고 있어요."}
          </p>
        ) : null}
        {errorMessage ? <p className="admin-dialog__error" role="alert">{errorMessage}</p> : null}
        <div className="admin-dialog__actions">
          <button ref={cancelButton} type="button" disabled={deleting} onClick={onCancel}>
            취소
          </button>
          <button type="button" className="admin-dialog__confirm" disabled={deleting} onClick={onConfirm}>
            보관한 수업 삭제
          </button>
        </div>
      </section>
    </div>
  );
}

export function AdminDashboard(): React.JSX.Element {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessionCreating, setSessionCreating] = useState(false);
  const [creatingSessionId, setCreatingSessionId] = useState<string | null>(null);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [archiveDeleteError, setArchiveDeleteError] = useState<string | null>(null);
  const [archiveDeleteProgress, setArchiveDeleteProgress] = useState<{ readonly completed: number; readonly total: number } | null>(null);
  const [archivedSessionToDelete, setArchivedSessionToDelete] = useState<ClassSession | null>(null);
  const [archivedSessionDeleting, setArchivedSessionDeleting] = useState(false);
  const [participants, setParticipants] = useState<readonly SessionParticipant[]>([]);
  const [sessions, setSessions] = useState<readonly ClassSession[]>([]);
  const qrDownloadCanvas = useRef<HTMLCanvasElement>(null);

  const activeSession = sessions.find((session) => session.state === "active") ?? null;
  const archivingSession = sessions.find((session) => session.state === "archiving") ?? null;
  const currentSession = activeSession ?? archivingSession;
  const archivedSessions = sessions.filter((session) => session.state === "archived");

  useEffect(() => {
    if (!signedIn) {
      return;
    }

    return subscribeToSessions(
      (nextSessions, fromCache) => {
        setSessions(nextSessions);
        if (!fromCache) {
          setSessionsLoaded(true);
        }
      },
      () => {
        setSessionsLoaded(false);
        setSessionCreating(false);
        setCreatingSessionId(null);
        setErrorMessage("수업 목록을 불러오지 못했어요. 관리자 권한을 확인해 주세요.");
      }
    );
  }, [signedIn]);

  useEffect(() => {
    if (!creatingSessionId) {
      return;
    }

    const createdSessionIsVisible = sessions.some(
      (session) => session.id === creatingSessionId && session.state === "active"
    );
    if (createdSessionIsVisible) {
      setSessionCreating(false);
      setCreatingSessionId(null);
    }
  }, [creatingSessionId, sessions]);

  useEffect(() => {
    if (!currentSession) {
      setParticipants([]);
      return;
    }

    return subscribeToParticipants(currentSession.id, setParticipants, () => {
      setErrorMessage("수업 기록을 불러오지 못했어요. 관리자 권한을 확인해 주세요.");
    });
  }, [currentSession]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    void signInAsAdmin(email, password)
      .then(() => {
        setSessionsLoaded(false);
        setSessionCreating(false);
        setCreatingSessionId(null);
        setSignedIn(true);
      })
      .catch((error: unknown) => setErrorMessage(readableLoginError(error)))
      .finally(() => setLoading(false));
  }

  function handleCreateSession(): void {
    setSessionCreating(true);
    setErrorMessage(null);
    void createSession()
      .then((sessionId) => setCreatingSessionId(sessionId))
      .catch(() => {
        setErrorMessage("새 수업을 열지 못했어요. 잠시 뒤 다시 시도해 주세요.");
        setSessionCreating(false);
        setCreatingSessionId(null);
      });
  }

  function openArchivedSessionDelete(session: ClassSession): void {
    setArchiveDeleteError(null);
    setArchiveDeleteProgress(null);
    setArchivedSessionToDelete(session);
  }

  function closeArchivedSessionDelete(): void {
    if (archivedSessionDeleting) {
      return;
    }

    setArchivedSessionToDelete(null);
    setArchiveDeleteError(null);
    setArchiveDeleteProgress(null);
  }

  function confirmArchivedSessionDelete(): void {
    if (!archivedSessionToDelete || archivedSessionDeleting) {
      return;
    }

    setArchivedSessionDeleting(true);
    setArchiveDeleteError(null);
    setArchiveDeleteProgress(null);
    void deleteArchivedSession(archivedSessionToDelete, (completed, total) => {
      setArchiveDeleteProgress({ completed, total });
    })
      .then(() => {
        setArchivedSessionToDelete(null);
      })
      .catch(() => {
        setArchiveDeleteError("보관한 수업을 지우지 못했어요. 잠시 뒤 다시 시도해 주세요.");
      })
      .finally(() => setArchivedSessionDeleting(false));
  }

  function handleDownloadStudentQr(): void {
    const canvas = qrDownloadCanvas.current;
    if (!canvas) {
      setErrorMessage("QR 이미지를 준비하지 못했어요. 화면을 새로고침한 뒤 다시 시도해 주세요.");
      return;
    }

    try {
      downloadQrPng(canvas, QR_DOWNLOAD_FILE_NAME);
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage("QR 이미지를 내려받지 못했어요. 잠시 뒤 다시 시도해 주세요.");
        return;
      }
      throw error;
    }
  }

  if (signedIn && !sessionsLoaded) {
    return (
      <main className="admin-shell">
        {errorMessage ? <p className="admin-notice" role="status">{errorMessage}</p> : null}
        <section className="admin-session-launcher" aria-labelledby="loading-sessions-title">
          <p className="admin-kicker">5문장 길찾기 · 운영자</p>
          <h1 id="loading-sessions-title">수업을 확인하고 있어요</h1>
          <p>잠시만 기다려 주세요. 진행 중인 수업이 있는지 먼저 살펴보고 있어요.</p>
        </section>
      </main>
    );
  }

  if (signedIn && !currentSession) {
    return (
      <main className="admin-shell">
        {errorMessage ? <p className="admin-notice" role="status">{errorMessage}</p> : null}
        <section className="admin-session-launcher" aria-labelledby="new-session-title">
          <p className="admin-kicker">5문장 길찾기 · 운영자</p>
          <h1 id="new-session-title">새 수업을 열까요?</h1>
          <p>수업마다 새로운 QR과 참여 링크가 만들어져요. 이전 수업은 학생 기록을 지운 채 보관함에 남습니다.</p>
          <button type="button" disabled={sessionCreating} onClick={handleCreateSession}>
            {sessionCreating ? "새 수업을 여는 중" : "새 수업 열기"}
          </button>
        </section>
        <ArchivedSessions sessions={archivedSessions} onDeleteSession={openArchivedSessionDelete} />
        <ArchivedSessionDeleteDialog
          deleting={archivedSessionDeleting}
          errorMessage={archiveDeleteError}
          progress={archiveDeleteProgress}
          session={archivedSessionToDelete}
          onCancel={closeArchivedSessionDelete}
          onConfirm={confirmArchivedSessionDelete}
        />
      </main>
    );
  }

  if (signedIn && currentSession) {
    const studentSessionLink = sessionLink(currentSession.id);
    const isArchiving = currentSession.state === "archiving";
    return (
      <main className="admin-shell">
        {errorMessage ? <p className="admin-notice" role="status">{errorMessage}</p> : null}
        {isArchiving ? (
          <section className="admin-session-launcher" aria-labelledby="archiving-session-title">
            <p className="admin-kicker">수업 기록 정리 중</p>
            <h2 id="archiving-session-title">학생 참여를 멈췄어요</h2>
            <p>남은 기록을 모두 지운 뒤에만 보관함으로 옮깁니다. 정리가 멈췄다면 아래에서 다시 시도해 주세요.</p>
          </section>
        ) : (
          <section className="admin-session-share" aria-labelledby="session-share-title">
            <div>
              <p className="admin-kicker">진행 중 수업</p>
              <h2 id="session-share-title">학생 참여 QR</h2>
              <p>학생은 이 QR을 스캔하거나 참여 링크로 들어옵니다. 이 수업을 정리하면 QR은 더 이상 기록을 받지 않아요.</p>
            </div>
            <div className="admin-session-share__qr">
              <QRCodeSVG
                aria-label="학생 참여 QR 코드"
                bgColor="var(--vanilla)"
                fgColor="var(--ink)"
                level="M"
                size={132}
                value={studentSessionLink}
              />
              <button type="button" className="admin-qr-download" onClick={handleDownloadStudentQr}>
                QR 이미지 내려받기
              </button>
              <QRCodeCanvas
                aria-hidden="true"
                bgColor={QR_DOWNLOAD_BACKGROUND_COLOR}
                className="admin-qr-download-source"
                fgColor={QR_DOWNLOAD_FOREGROUND_COLOR}
                level="M"
                marginSize={4}
                ref={qrDownloadCanvas}
                size={528}
                value={studentSessionLink}
              />
            </div>
            <label>
              <span>학생 참여 링크</span>
              <input aria-label="학생 참여 링크" readOnly value={studentSessionLink} />
            </label>
          </section>
        )}
        <TeacherDashboard
          participants={participants}
          archiving={isArchiving}
          studentHref={studentSessionLink}
          onDeleteParticipant={(participant, onProgress) => {
            setErrorMessage(null);
            return deleteParticipantHistory(currentSession.id, participant, onProgress);
          }}
          onDeleteSession={(onProgress) => {
            setErrorMessage(null);
            return deleteSessionHistory(currentSession.id, onProgress);
          }}
          onDeleteError={setErrorMessage}
        />
        <ArchivedSessions sessions={archivedSessions} onDeleteSession={openArchivedSessionDelete} />
        <ArchivedSessionDeleteDialog
          deleting={archivedSessionDeleting}
          errorMessage={archiveDeleteError}
          progress={archiveDeleteProgress}
          session={archivedSessionToDelete}
          onCancel={closeArchivedSessionDelete}
          onConfirm={confirmArchivedSessionDelete}
        />
      </main>
    );
  }

  return (
    <main className="admin-shell admin-shell--login">
      <form className="admin-login" onSubmit={handleSubmit}>
        <p className="admin-kicker">5문장 길찾기 · 운영자</p>
        <h1>수업 현황을 볼까요?</h1>
        <p>QR을 안내하기 전에 로그인해 수업을 열어 주세요. 학생들의 확정 문장과 도움 요청이 실시간으로 표시됩니다.</p>
        <label>
          <span>이메일</span>
          <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label>
          <span>비밀번호</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        {errorMessage ? <p className="admin-login__error">{errorMessage}</p> : null}
        <button type="submit" disabled={loading}>
          {loading ? "로그인하는 중" : "대시보드 열기"}
        </button>
      </form>
    </main>
  );
}
