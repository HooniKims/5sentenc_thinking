import { useEffect, useRef, useState } from "react";
import { CompletionExperience } from "./components/CompletionExperience";
import { LazyRobot3D } from "./components/LazyRobot3D";
import { PolicyLinks } from "./components/PolicyLinks";
import { SentenceHistory } from "./components/SentenceHistory";
import { createHelpRequest, saveParticipant, sessionIsActive } from "./lib/activityStore";
import { ensureStudentIdentity } from "./lib/firebase";
import { requestGuidanceQuestion } from "./lib/helpClient";
import { contextualHelpQuestion, createHelpGuidanceInput } from "./lib/helpGuidance";
import { createNickname } from "./lib/nickname";
import { isSingleSentence, replaceSentence } from "./lib/sentences";
import { requestHelp } from "./lib/activity";
import { draftValidationMessage, guideCopies, guideQuestions, openingDidiSpeech, stepForSentenceCount } from "./lib/studentWriting";
import "./styles.css";

const LIP_FRAME_INTERVAL_MS = 160;
const DIDI_MOVE_DURATION_MS = 760;
const analyzingHelpMessage = "디디가 문장 사이를 살펴보고 있어요.";

type HelpViewState =
  | { readonly kind: "idle" }
  | { readonly kind: "analyzing" }
  | { readonly kind: "ready"; readonly question: string }
  | { readonly kind: "fallback"; readonly variation: number };

interface AppProps {
  readonly sessionId?: string | null;
}

function speechDurationFor(question: string): number {
  const readableCharacters = question.replaceAll(" ", "").length;
  return Math.min(Math.max(readableCharacters * 85, 1_800), 6_000);
}

function didiMoveDuration(): number {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : DIDI_MOVE_DURATION_MS;
}

function isPermissionDenied(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "permission-denied";
}

function helpVariantFrom(variation: number): 0 | 1 | 2 {
  switch (variation % 3) {
    case 0:
      return 0;
    case 1:
      return 1;
    case 2:
      return 2;
    default:
      return 0;
  }
}

function helpQuestionFor(
  state: HelpViewState,
  step: 1 | 2 | 3 | 4 | 5,
  sentences: readonly string[]
): string | null {
  switch (state.kind) {
    case "idle":
      return null;
    case "analyzing":
      return analyzingHelpMessage;
    case "ready":
      return state.question;
    case "fallback":
      return contextualHelpQuestion(step, sentences, helpVariantFrom(state.variation));
  }
}

function helpButtonLabel(state: HelpViewState): string {
  switch (state.kind) {
    case "idle":
    case "analyzing":
      return "도움!";
    case "ready":
    case "fallback":
      return "다시 생각해 볼게요";
  }
}

export function App({ sessionId = null }: AppProps): React.JSX.Element {
  const [sentences, setSentences] = useState<readonly string[]>([]);
  const [draft, setDraft] = useState("");
  const [completed, setCompleted] = useState(false);
  const [helpView, setHelpView] = useState<HelpViewState>({ kind: "idle" });
  const [promptVisible, setPromptVisible] = useState(false);
  const [didiPosition, setDidiPosition] = useState<"center" | "side">("center");
  const [didiTransitioning, setDidiTransitioning] = useState(false);
  const [guideBubbleWaitingForDidi, setGuideBubbleWaitingForDidi] = useState(false);
  const [didiSpeaking, setDidiSpeaking] = useState(false);
  const [lipFrame, setLipFrame] = useState(0);
  const [ownerUid, setOwnerUid] = useState<string | null>(null);
  const [recordingUnavailable, setRecordingUnavailable] = useState(false);
  const [joinFailed, setJoinFailed] = useState(false);
  const [joinAttempt, setJoinAttempt] = useState(0);
  const [nickname] = useState(createNickname);
  const draftTextarea = useRef<HTMLTextAreaElement>(null);
  const helpRequestId = useRef(0);
  const helpVariation = useRef(0);
  const [focusDraft, setFocusDraft] = useState(false);
  const step = stepForSentenceCount(sentences.length);
  const guideQuestion = guideQuestions[step - 1] ?? guideQuestions[0];
  const guideCopy = guideCopies[step - 1] ?? guideCopies[0];
  const helpQuestion = helpQuestionFor(helpView, step, sentences);
  const helpActive = helpView.kind !== "idle";
  const displayedQuestion = helpQuestion ?? (step === 1 && promptVisible ? openingDidiSpeech : guideQuestion);
  const showGuideBubble = didiPosition === "side" && !guideBubbleWaitingForDidi && (step > 1 || promptVisible || helpActive);
  const draftMessage = draftValidationMessage(draft);
  const didiGesture = didiSpeaking
      ? "speaking"
      : helpActive
        ? "help"
        : draft.trim() || sentences.length > 0
          ? "thinking"
          : "idle";

  function moveDidiToSide(waitToOpenGuideBubble = false): void {
    if (didiPosition === "side") {
      return;
    }

    setDidiTransitioning(true);
    setGuideBubbleWaitingForDidi(waitToOpenGuideBubble);
    setDidiPosition("side");
  }

  useEffect(() => {
    if (!didiTransitioning) {
      return;
    }

    const timer = window.setTimeout(() => {
      setDidiTransitioning(false);
      setGuideBubbleWaitingForDidi(false);
    }, didiMoveDuration());
    return () => window.clearTimeout(timer);
  }, [didiTransitioning]);

  useEffect(() => {
    if (!focusDraft) {
      return;
    }

    draftTextarea.current?.focus({ preventScroll: true });
    setFocusDraft(false);
  }, [focusDraft, step]);

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    let active = true;
    void ensureStudentIdentity()
      .then(async (studentId) => {
        const activeSession = await sessionIsActive(sessionId);
        if (!active) {
          return;
        }
        if (!activeSession) {
          setRecordingUnavailable(true);
          return;
        }
        setOwnerUid(studentId);
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        if (isPermissionDenied(error)) {
          setRecordingUnavailable(true);
          return;
        }
        setJoinFailed(true);
      });

    return () => {
      active = false;
    };
  }, [sessionId, joinAttempt]);

  useEffect(() => {
    if (recordingUnavailable || !ownerUid || !sessionId) {
      return;
    }

    if (sentences.length === 0) {
      return;
    }

    const participantStatus = completed ? "completed" : helpActive ? "help_requested" : "writing";

    const timeout = window.setTimeout(() => {
      void saveParticipant(sessionId, ownerUid, nickname, sentences, step, participantStatus).catch(() =>
        setRecordingUnavailable(true)
      );
    }, 400);
    return () => window.clearTimeout(timeout);
  }, [completed, helpActive, nickname, ownerUid, recordingUnavailable, sentences, sessionId, step]);

  useEffect(() => {
    if (step !== 1 || sentences.length > 0 || draft.trim() || helpActive || promptVisible) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setPromptVisible(true);
      moveDidiToSide(true);
    }, 10_000);
    return () => window.clearTimeout(timeout);
  }, [draft, helpActive, promptVisible, sentences.length, step]);

  useEffect(() => {
    if (!showGuideBubble) {
      setDidiSpeaking(false);
      return;
    }

    setDidiSpeaking(true);
    setLipFrame(0);
    let nextFrame = 0;
    const frameTimer = window.setInterval(() => {
      nextFrame += 1;
      setLipFrame(nextFrame);
    }, LIP_FRAME_INTERVAL_MS);
    const speechTimer = window.setTimeout(() => {
      window.clearInterval(frameTimer);
      setDidiSpeaking(false);
    }, speechDurationFor(displayedQuestion));

    return () => {
      window.clearInterval(frameTimer);
      window.clearTimeout(speechTimer);
    };
  }, [displayedQuestion, showGuideBubble]);

  function handleSaveSentence(): void {
    if (!isSingleSentence(draft)) {
      return;
    }

    const nextSentences = [...sentences, draft.trim()];
    helpRequestId.current += 1;
    setSentences(nextSentences);
    setDraft("");
    setHelpView({ kind: "idle" });
    moveDidiToSide();

    if (nextSentences.length === 5) {
      setCompleted(true);
      return;
    }

    setFocusDraft(true);
  }

  function handleSaveEdit(index: number, value: string): void {
    if (!isSingleSentence(value)) {
      return;
    }

    setSentences((current) => replaceSentence(current, index, value.trim()));
  }

  function returnToDraft(): void {
    draftTextarea.current?.focus({ preventScroll: true });
  }

  function handleDraftChange(nextDraft: string): void {
    if (nextDraft !== draft && helpView.kind === "analyzing") {
      helpRequestId.current += 1;
      setHelpView({ kind: "idle" });
    }

    if (nextDraft.trim()) {
      moveDidiToSide();
    }
    setDraft(nextDraft);
  }

  function handleHelp(): void {
    if (recordingUnavailable || !ownerUid || !sessionId) {
      return;
    }

    if (helpView.kind === "analyzing") {
      return;
    }

    if (helpView.kind !== "idle") {
      helpRequestId.current += 1;
      setHelpView({ kind: "idle" });
      return;
    }

    const result = requestHelp("writing");
    if (!result.accepted) {
      return;
    }

    const participantSentences = sentences;
    const requestId = helpRequestId.current + 1;
    const variation = helpVariation.current;
    helpRequestId.current = requestId;
    helpVariation.current += 1;
    setHelpView({ kind: "analyzing" });
    if (didiPosition === "side") {
      setGuideBubbleWaitingForDidi(false);
    }
    moveDidiToSide();
    void requestGuidanceQuestion(createHelpGuidanceInput(step, participantSentences, draft), participantSentences)
      .then((question) => {
        if (helpRequestId.current === requestId) {
          setHelpView({ kind: "ready", question });
        }
      })
      .catch(() => {
        if (helpRequestId.current === requestId) {
          setHelpView({ kind: "fallback", variation });
        }
      });
    void createHelpRequest(sessionId, ownerUid, nickname, participantSentences, step).catch(() =>
      setRecordingUnavailable(true)
    );
  }

  if (!sessionId) {
    return (
      <main className="student-shell">
        <section className="student-card student-card--link-needed" aria-labelledby="session-link-title">
          <p className="eyebrow">5문장 길찾기</p>
          <h1 id="session-link-title">수업 링크가 필요해요</h1>
          <p className="guide-copy">진행자가 안내한 QR을 다시 스캔해 주세요. 새 수업마다 참여 링크가 달라져요.</p>
        </section>
      </main>
    );
  }

  if (joinFailed) {
    return (
      <main className="student-shell">
        <section className="student-card student-card--link-needed" aria-labelledby="join-retry-title">
          <p className="eyebrow">5문장 길찾기</p>
          <h1 id="join-retry-title">지금은 연결이 어려워요</h1>
          <p className="guide-copy">접속하는 친구가 많거나 인터넷이 잠시 느려요. 잠깐 기다렸다가 다시 연결해 주세요.</p>
          <button
            type="button"
            className="magic-button"
            onClick={() => {
              setJoinFailed(false);
              setJoinAttempt((attempt) => attempt + 1);
            }}
          >
            다시 연결하기
          </button>
        </section>
      </main>
    );
  }

  if (recordingUnavailable) {
    return (
      <main className="student-shell">
        <section className="student-card student-card--link-needed" aria-labelledby="archived-session-title">
          <p className="eyebrow">5문장 길찾기</p>
          <h1 id="archived-session-title">이 수업은 보관됐어요</h1>
          <p className="guide-copy">기록을 모두 정리한 수업이에요. 진행자가 안내한 새 QR로 다시 들어와 주세요.</p>
        </section>
      </main>
    );
  }

  if (completed) {
    return <CompletionExperience nickname={nickname} sentences={sentences} onSaveEdit={handleSaveEdit} />;
  }

  return (
    <main className="student-shell">
      <section className="student-card" aria-label="다섯 문장 활동">
        <p className="eyebrow">{nickname} · 길찾기 탐험 · {step} / 5</p>
        <PolicyLinks />
        <h1>여기에 어떻게 오셨어요?</h1>
        <p className="guide-copy">{guideCopy}</p>
        {showGuideBubble ? (
          <div className="guide-bubble">
            <strong>{helpActive ? "디디의 도움 질문" : "디디의 질문"}</strong>
            <span aria-live="polite" className="guide-question">{displayedQuestion}</span>
          </div>
        ) : null}
        <div
          className={`guide-character guide-character--${didiPosition}${didiTransitioning ? " guide-character--moving" : ""}`}
          data-position={didiPosition}
          data-testid="didi-position"
        >
          <div className="guide-character-motion">
            <LazyRobot3D gesture={didiGesture} lipFrame={lipFrame} />
          </div>
        </div>
        <div className="writing-dock">
          <SentenceHistory
            sentences={sentences}
            onReturnToDraft={returnToDraft}
            onSaveEdit={handleSaveEdit}
          />
          <label className="sentence-field" htmlFor="sentence">
            <span>{step}번째 문장</span>
            <textarea
              id="sentence"
              aria-label={`${step}번째 문장`}
              ref={draftTextarea}
              value={draft}
              placeholder="한 번에 한 문장만 적어 보세요."
              onChange={(event) => handleDraftChange(event.target.value)}
            />
            <small className="privacy-note">이름·연락처·학교·학급·주소는 쓰지 않아요.</small>
            {draftMessage ? <p className="sentence-validation" role="status">{draftMessage}</p> : null}
          </label>
          <div className="student-actions">
            <button type="button" className="help-button" disabled={helpView.kind === "analyzing" || !ownerUid} onClick={handleHelp}>
              {helpButtonLabel(helpView)}
            </button>
            <button type="button" className="next-button" disabled={draftMessage !== null} onClick={handleSaveSentence}>
              문장 저장
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
