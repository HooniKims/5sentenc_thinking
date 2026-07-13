import { useEffect, useState } from "react";
import robotThink from "@ai-mc/characters/preview-frames/pose_think.png";
import { nextStep, requestHelp } from "./lib/activity";
import { createHelpRequest, saveParticipant } from "./lib/activityStore";
import { ensureStudentIdentity } from "./lib/firebase";
import { createNickname } from "./lib/nickname";
import "./styles.css";

export function App() {
  const [sentence, setSentence] = useState("");
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [helpRequested, setHelpRequested] = useState(false);
  const [ownerUid, setOwnerUid] = useState<string | null>(null);
  const [nickname] = useState(createNickname);
  const next = nextStep(step);

  useEffect(() => {
    void ensureStudentIdentity().then(setOwnerUid);
  }, []);

  useEffect(() => {
    if (!ownerUid || !sentence.trim()) return;
    const timeout = window.setTimeout(() => {
      void saveParticipant("arrival", ownerUid, nickname, [sentence], step);
    }, 400);
    return () => window.clearTimeout(timeout);
  }, [nickname, ownerUid, sentence, step]);

  function handleHelp(): void {
    const result = requestHelp(helpRequested ? "help_requested" : "writing");
    if (result.accepted) {
      setHelpRequested(true);
      if (ownerUid) {
        void createHelpRequest("arrival", ownerUid, step);
      }
    }
  }

  return (
    <main className="student-shell">
      <section className="student-card" aria-label="다섯 문장 활동">
        <p className="eyebrow">{nickname} · 길찾기 탐험 · {step} / 5</p>
        <h1>여기에 어떻게 오셨어요?</h1>
        <p className="guide-copy">먼저 떠오르는 장면을 한 문장으로 적어 보세요.</p>
        <div className="guide-bubble">
          <strong>AI MC의 질문</strong>
          <span>방금 지나온 길에서 가장 먼저 떠오르는 장면은 무엇인가요?</span>
        </div>
        <img className="guide-character" src={robotThink} alt="생각하는 AI MC 캐릭터" />
        <label className="sentence-field" htmlFor="sentence">
          <span>나의 첫 번째 문장</span>
          <textarea id="sentence" value={sentence} onChange={(event) => setSentence(event.target.value)} />
        </label>
        <div className="student-actions">
          <button type="button" className="help-button" onClick={handleHelp} disabled={helpRequested}>
            {helpRequested ? "질문을 준비하고 있어요" : "도움!"}
          </button>
          <button type="button" className="next-button" disabled={!sentence.trim() || next === null} onClick={() => next && setStep(next)}>
            다음 문장으로
          </button>
        </div>
      </section>
    </main>
  );
}
