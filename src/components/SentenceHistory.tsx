import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { draftValidationMessage } from "../lib/studentWriting";

export interface SentenceHistoryProps {
  readonly sentences: readonly string[];
  readonly onReturnToDraft: () => void;
  readonly onSaveEdit: (index: number, value: string) => void;
}

type HistoryView =
  | { readonly kind: "closed" }
  | { readonly kind: "history" }
  | { readonly kind: "edit"; readonly index: number; readonly value: string };

export function SentenceHistory({
  sentences,
  onReturnToDraft,
  onSaveEdit,
}: SentenceHistoryProps) {
  const [view, setView] = useState<HistoryView>({ kind: "closed" });
  const historyDialogRef = useRef<HTMLElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const latestSentence = sentences.at(-1) ?? "";
  const editingValue = view.kind === "edit" ? view.value : "";
  const editMessage = draftValidationMessage(editingValue);

  useEffect(() => {
    if (view.kind === "history") {
      historyDialogRef.current?.focus({ preventScroll: true });
      return;
    }

    if (view.kind === "edit") {
      editTextareaRef.current?.focus({ preventScroll: true });
    }
  }, [view.kind]);

  function closeToDraft(): void {
    setView({ kind: "closed" });
    window.requestAnimationFrame(onReturnToDraft);
  }

  function startEditing(index: number): void {
    const sentence = sentences[index];
    if (sentence === undefined) {
      return;
    }

    setView({ kind: "edit", index, value: sentence });
  }

  function updateEditingValue(value: string): void {
    if (view.kind !== "edit") {
      return;
    }

    setView({ ...view, value });
  }

  function saveEdit(): void {
    if (view.kind !== "edit" || editMessage !== null) {
      return;
    }

    onSaveEdit(view.index, view.value.trim());
    closeToDraft();
  }

  function trapDialogFocus(event: ReactKeyboardEvent<HTMLElement>): void {
    if (event.key !== "Tab") {
      return;
    }

    const controls = Array.from(
      event.currentTarget.querySelectorAll<
        HTMLButtonElement | HTMLTextAreaElement
      >("button:not(:disabled), textarea:not(:disabled)"),
    );
    const firstControl = controls[0];
    const lastControl = controls[controls.length - 1];
    if (!firstControl || !lastControl) {
      return;
    }

    if (
      event.shiftKey &&
      (document.activeElement === event.currentTarget ||
        document.activeElement === firstControl)
    ) {
      event.preventDefault();
      lastControl.focus({ preventScroll: true });
      return;
    }

    if (!event.shiftKey && document.activeElement === lastControl) {
      event.preventDefault();
      firstControl.focus({ preventScroll: true });
    }
  }

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      closeToDraft();
      return;
    }

    trapDialogFocus(event);
  }

  if (sentences.length === 0) {
    return null;
  }

  return (
    <>
      <button
        aria-label={`지금까지 쓴 문장 ${sentences.length}개`}
        className="sentence-history"
        type="button"
        onClick={() => setView({ kind: "history" })}
      >
        <span className="sentence-history__count">
          지금까지 쓴 문장 {sentences.length}개
        </span>
        <span className="sentence-history__preview">{latestSentence}</span>
      </button>
      {view.kind === "history" ? (
        <div className="sentence-history__backdrop">
          <button
            aria-label="문장 보관함 바깥 영역 닫기"
            className="sentence-history__backdrop-dismiss"
            data-testid="sentence-history-backdrop"
            tabIndex={-1}
            type="button"
            onClick={closeToDraft}
          />
          <section
            aria-labelledby="sentence-history-title"
            aria-modal="true"
            className="sentence-history__dialog"
            onKeyDown={handleDialogKeyDown}
            ref={historyDialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <div className="sentence-history__dialog-heading">
              <h2 id="sentence-history-title">문장 보관함</h2>
              <button
                aria-label="문장 보관함 닫기"
                type="button"
                onClick={closeToDraft}
              >
                닫기
              </button>
            </div>
            <ol aria-label="저장한 문장" className="sentence-history__list">
              {sentences.map((sentence, index) => {
                const sentenceNumber = index + 1;
                return (
                  <li
                    className="sentence-history__item"
                    key={`${sentenceNumber}-${sentence}`}
                  >
                    <span aria-hidden="true">{sentenceNumber}</span>
                    <p>{sentence}</p>
                    <button
                      aria-label={`${sentenceNumber}번째 문장 수정`}
                      type="button"
                      onClick={() => startEditing(index)}
                    >
                      수정
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      ) : null}
      {view.kind === "edit" ? (
        <div className="sentence-history__backdrop">
          <button
            aria-label="문장 수정 바깥 영역 닫기"
            className="sentence-history__backdrop-dismiss"
            data-testid="sentence-history-backdrop"
            tabIndex={-1}
            type="button"
            onClick={closeToDraft}
          />
          <section
            aria-labelledby="sentence-history-edit-title"
            aria-modal="true"
            className="sentence-history__dialog sentence-history__dialog--edit"
            onKeyDown={handleDialogKeyDown}
            role="dialog"
            tabIndex={-1}
          >
            <div className="sentence-history__dialog-heading">
              <h2 id="sentence-history-edit-title">
                {view.index + 1}번째 문장 수정
              </h2>
              <button
                aria-label="문장 수정 닫기"
                type="button"
                onClick={closeToDraft}
              >
                닫기
              </button>
            </div>
            <label
              className="sentence-history__edit-label"
              htmlFor="sentence-history-edit-value"
            >
              {view.index + 1}번째 문장 수정 내용
            </label>
            <textarea
              id="sentence-history-edit-value"
              ref={editTextareaRef}
              value={view.value}
              onChange={(event) => updateEditingValue(event.target.value)}
            />
            {editMessage ? (
              <p className="sentence-validation" role="status">
                {editMessage}
              </p>
            ) : null}
            <div className="sentence-history__actions">
              <button
                type="button"
                disabled={editMessage !== null}
                onClick={saveEdit}
              >
                수정 저장
              </button>
              <button type="button" onClick={closeToDraft}>
                취소
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
