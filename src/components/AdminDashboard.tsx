import { useEffect, useState } from "react";
import { signInAsAdmin } from "../lib/firebase";
import {
  deleteParticipantHistory,
  deleteSessionHistory,
  prepareSession,
  subscribeToParticipants,
  type SessionParticipant
} from "../lib/activityStore";
import { TeacherDashboard } from "./TeacherDashboard";

const SESSION_ID = "arrival";

function readableLoginError(error: unknown): string {
  if (error instanceof Error) {
    return "로그인 정보를 확인해 주세요.";
  }

  return "로그인 중 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.";
}

export function AdminDashboard(): React.JSX.Element {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [participants, setParticipants] = useState<readonly SessionParticipant[]>([]);

  useEffect(() => {
    if (!signedIn) {
      return;
    }

    let unsubscribe: (() => void) | undefined;
    let active = true;
    void prepareSession(SESSION_ID)
      .then((readiness) => {
        if (!active) {
          return;
        }
        if (readiness === "closed") {
          setErrorMessage("이 수업의 기록은 이미 정리됐어요. 같은 QR에서는 새 기록을 받지 않아요.");
          return;
        }
        unsubscribe = subscribeToParticipants(SESSION_ID, setParticipants, () => {
          setErrorMessage("관리자 권한을 확인하지 못했어요. Firestore의 teachers 문서를 확인해 주세요.");
        });
      })
      .catch(() => {
        if (active) {
          setErrorMessage("수업을 준비하지 못했어요. 관리자 권한을 확인해 주세요.");
        }
      });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [signedIn]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    void signInAsAdmin(email, password)
      .then(() => setSignedIn(true))
      .catch((error: unknown) => setErrorMessage(readableLoginError(error)))
      .finally(() => setLoading(false));
  }

  if (signedIn) {
    return (
      <main className="admin-shell">
        {errorMessage ? <p className="admin-notice" role="status">{errorMessage}</p> : null}
        <TeacherDashboard
          participants={participants}
          onDeleteParticipant={(participant, onProgress) => {
            setErrorMessage(null);
            return deleteParticipantHistory(SESSION_ID, participant, onProgress);
          }}
          onDeleteSession={(onProgress) => {
            setErrorMessage(null);
            return deleteSessionHistory(SESSION_ID, onProgress);
          }}
          onDeleteError={setErrorMessage}
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
