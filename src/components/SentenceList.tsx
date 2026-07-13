import { useEffect, useRef, useState } from "react";
import { draftValidationMessage } from "../lib/studentWriting";

interface SentenceListProps {
  readonly sentences: readonly string[];
  readonly onSaveEdit: (index: number, value: string) => void;
}

export function SentenceList({ sentences, onSaveEdit }: SentenceListProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [focusEdit, setFocusEdit] = useState(false);
  const [focusReturnIndex, setFocusReturnIndex] = useState<number | null>(null);
  const editButtons = useRef<Record<number, HTMLButtonElement | null>>({});
  const editTextarea = useRef<HTMLTextAreaElement>(null);
  const editMessage = draftValidationMessage(editingValue);

  useEffect(() => {
    if (focusReturnIndex === null) {
      return;
    }

    editButtons.current[focusReturnIndex]?.focus();
    setFocusReturnIndex(null);
  }, [focusReturnIndex]);

  useEffect(() => {
    if (!focusEdit) {
      return;
    }

    editTextarea.current?.focus();
    setFocusEdit(false);
  }, [focusEdit]);

  function startEditing(index: number, value: string): void {
    setEditingIndex(index);
    setEditingValue(value);
    setFocusEdit(true);
  }

  function saveEdit(): void {
    if (editingIndex === null || editMessage !== null) {
      return;
    }

    onSaveEdit(editingIndex, editingValue.trim());
    setEditingIndex(null);
    setEditingValue("");
    setFocusReturnIndex(editingIndex);
  }

  function cancelEdit(): void {
    if (editingIndex === null) {
      return;
    }

    setEditingIndex(null);
    setFocusReturnIndex(editingIndex);
  }

  return (
    <ol className="sentence-list" aria-label="저장한 문장">
      {sentences.map((sentence, index) => {
        const sentenceNumber = index + 1;
        const isEditing = editingIndex === index;
        const editLabel = `${sentenceNumber}번째 문장 수정 내용`;

        return (
          <li className="sentence-card" data-testid={`sentence-card-${sentenceNumber}`} key={sentenceNumber}>
            <span className="sentence-card__number">{sentenceNumber}</span>
            {isEditing ? (
              <div className="sentence-card__editor">
                <label htmlFor={`sentence-edit-${sentenceNumber}`}>{editLabel}</label>
                <textarea
                  id={`sentence-edit-${sentenceNumber}`}
                  ref={editTextarea}
                  value={editingValue}
                  onChange={(event) => setEditingValue(event.target.value)}
                />
                {editMessage ? <p className="sentence-validation" role="status">{editMessage}</p> : null}
                <div className="sentence-card__actions">
                  <button type="button" disabled={editMessage !== null} onClick={saveEdit}>
                    {sentenceNumber}번째 문장 수정 저장
                  </button>
                  <button type="button" onClick={cancelEdit}>
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="sentence-card__text">{sentence}</p>
                <button
                  type="button"
                  aria-label={`${sentenceNumber}번째 문장 수정`}
                  ref={(button) => {
                    editButtons.current[index] = button;
                  }}
                  onClick={() => startEditing(index, sentence)}
                >
                  수정
                </button>
              </>
            )}
          </li>
        );
      })}
    </ol>
  );
}
