import { useEffect, useRef, useState } from "react";
import { LazyRobot3D } from "./LazyRobot3D";
import { SentenceList } from "./SentenceList";
import { requestRefinedParagraph } from "../lib/refineClient";

type RefineState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "done"; readonly paragraph: string }
  | { readonly kind: "error" };

const MAGIC_REVEAL_MS = 900;
const connectors = ["", "그러다", "그때", "이어서", "마지막으로"] as const;
const existingConnector = /^(?:그러다|그때|이어서|그래서|그리고|하지만|먼저|마지막으로|그 뒤에|곧)/u;

type MagicState = "ready" | "casting" | "revealed";

interface CompletionExperienceProps {
  readonly nickname: string;
  readonly sentences: readonly string[];
  readonly onSaveEdit: (index: number, value: string) => void;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function magicParagraph(sentences: readonly string[]): string {
  return sentences
    .map((sentence, index) => {
      const connector = connectors[index] ?? "그리고";
      if (index === 0 || !connector || existingConnector.test(sentence.trim())) {
        return sentence;
      }

      return `${connector} ${sentence}`;
    })
    .join(" ");
}

function refinementQuestions(sentences: readonly string[]): readonly string[] {
  const writing = sentences.join(" ");
  const mentionsSense = /(?:보|들|냄새|향|차갑|따뜻|밝|어둡|소리|빛|바람|비)/u.test(writing);
  const mentionsPerson = /(?:친구|사람|우리|누구|함께)/u.test(writing);
  const lastSentence = sentences.at(-1) ?? "";
  const mentionsThought = /(?:생각|느낌|기억|마음|같아|싶)/u.test(lastSentence);

  return [
    mentionsSense
      ? "가장 선명한 장면 하나를 골라, 왜 기억에 남았는지 한마디 더해 볼까요?"
      : "두 번째나 세 번째 문장에 그때 보거나 들은 것 하나를 더하면 장면이 또렷해질까요?",
    mentionsPerson
      ? "함께한 사람의 표정이나 행동을 한 가지 더하면 이야기가 더 가까워질까요?"
      : "그 길에서 나 혼자였는지, 누구와 함께였는지 한 문장에 담아 볼까요?",
    mentionsThought
      ? "마지막 생각이 앞 장면과 어떻게 이어지는지 한 번 더 읽어 볼까요?"
      : "마지막에 그 길이 내게 어떤 느낌으로 남았는지 한마디 보태 볼까요?"
  ];
}

export function CompletionExperience({ nickname, sentences, onSaveEdit }: CompletionExperienceProps): React.JSX.Element {
  const [magicState, setMagicState] = useState<MagicState>("ready");
  const [magicRun, setMagicRun] = useState(0);
  const [refineState, setRefineState] = useState<RefineState>({ kind: "idle" });
  const refineRequestId = useRef(0);
  const completionCard = useRef<HTMLElement>(null);
  const magicResult = useRef<HTMLElement>(null);
  const connectedParagraph = magicParagraph(sentences);
  const questions = refinementQuestions(sentences);
  const castingMagic = magicState === "casting";
  const magicRevealed = magicState === "revealed";
  const didiMessage = castingMagic
    ? "디디가 마법을 펼치고 있어요."
    : "처음 떠올린 장면이 다섯 문장 안에서 훨씬 또렷해졌어요.";

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      completionCard.current?.scrollTo?.({ top: 0 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!castingMagic) {
      return;
    }

    const timer = window.setTimeout(() => setMagicState("revealed"), MAGIC_REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [castingMagic]);

  useEffect(() => {
    if (magicRevealed) {
      const result = magicResult.current;
      result?.scrollIntoView?.({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
      result?.focus({ preventScroll: true });
    }
  }, [magicRevealed]);

  function castMagic(): void {
    if (castingMagic) {
      return;
    }

    if (prefersReducedMotion()) {
      setMagicState("revealed");
      return;
    }

    setMagicRun((current) => current + 1);
    setMagicState("casting");
  }

  function refineWithAi(): void {
    if (refineState.kind === "loading") {
      return;
    }

    const requestId = refineRequestId.current + 1;
    refineRequestId.current = requestId;
    setRefineState({ kind: "loading" });
    void requestRefinedParagraph(sentences)
      .then((paragraph) => {
        if (refineRequestId.current === requestId) {
          setRefineState({ kind: "done", paragraph });
        }
      })
      .catch(() => {
        if (refineRequestId.current === requestId) {
          setRefineState({ kind: "error" });
        }
      });
  }

  return (
    <main className="student-shell">
      <section ref={completionCard} className="student-card completion-card" aria-label="한 문장 넓히기 완료">
        <p className="eyebrow">{nickname} · 생각 넓히기 · {sentences.length}문장</p>
        <h1>한 문장이 이렇게 자랐어요</h1>
        <p className="completion-praise">
          처음엔 “{sentences[0] ?? ""}” 한 줄이었는데, {sentences.length}문장이 되었어요.
        </p>
        <div className="guide-bubble completion-bubble">
          <strong>디디의 축하</strong>
          <span aria-live={castingMagic ? "polite" : undefined}>{didiMessage}</span>
        </div>
        <div className={`guide-character completion-didi${castingMagic ? " completion-didi--casting" : ""}`}>
          {castingMagic ? (
            <span aria-hidden="true" className="magic-effect" key={magicRun}>
              <span /><span /><span /><span /><span /><span />
            </span>
          ) : null}
          <LazyRobot3D gesture={castingMagic ? "cheer" : "complete"} />
        </div>
        <div className="sentence-summary">
          <article>
            <span>내가 쓴 원문</span>
            <p data-testid="complete-paragraph">{sentences.join(" ")}</p>
          </article>
        </div>
        <button
          aria-expanded={magicRevealed}
          className="magic-button"
          disabled={castingMagic}
          type="button"
          onClick={castMagic}
        >
          {castingMagic ? "디디가 마법을 펼치고 있어요" : magicRevealed ? "디디의 마법 다시 펼치기" : "디디의 마법 펼치기"}
        </button>
        {magicRevealed ? (
          <section ref={magicResult} aria-labelledby="magic-result-title" className="magic-result" tabIndex={-1}>
            <h2 id="magic-result-title" className="magic-result__eyebrow">디디가 이어 읽어 본 글</h2>
            <p className="magic-result__note">원래 문장은 바꾸지 않고, 문장 사이에 연결어만 살짝 더했어요.</p>
            <article className="magic-paragraph">
              <p data-testid="magic-paragraph">{connectedParagraph}</p>
            </article>
            <div className="refine-block">
              <button
                type="button"
                className="refine-button"
                disabled={refineState.kind === "loading"}
                onClick={refineWithAi}
              >
                {refineState.kind === "loading"
                  ? "디디가 다듬는 중이에요…"
                  : refineState.kind === "done"
                    ? "AI로 다시 다듬어 보기"
                    : "AI로 더 유려하게 다듬어 보기"}
              </button>
              {refineState.kind === "done" ? (
                <article className="magic-paragraph magic-paragraph--refined">
                  <p className="magic-result__note">AI가 뜻은 그대로 두고 표현만 다듬은 글이에요. 원문과 나란히 견줘 보세요.</p>
                  <p data-testid="refined-paragraph">{refineState.paragraph}</p>
                </article>
              ) : null}
              {refineState.kind === "error" ? (
                <p className="magic-result__note" role="status">지금은 다듬기가 어려워요. 잠깐 뒤에 다시 눌러 주세요.</p>
              ) : null}
            </div>
            <section className="refinement-prompts" aria-labelledby="refinement-title">
              <h3 id="refinement-title">더 멋진 글로 다듬어 볼까요?</h3>
              <p>세 가지 중 하나를 골라, 원문에 내 말로 한마디를 더해 보세요.</p>
              <ul>
                {questions.map((question) => <li key={question}>{question}</li>)}
              </ul>
            </section>
          </section>
        ) : null}
        <SentenceList sentences={sentences} onSaveEdit={onSaveEdit} />
      </section>
    </main>
  );
}
