# 고정 작성대와 문장 보관함 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 문장이 쌓여도 학생의 다음 문장 작성대가 같은 자리에 남고, 이전 문장은 터치 가능한 보관함에서 확인·수정할 수 있게 한다.

**Architecture:** 새 SentenceHistory 컴포넌트가 닫힌 보관함 요약, 전체 문장 보관함 대화상자, 한 문장 수정 대화상자를 맡는다. App은 확정 문장·현재 초안·도움 상태를 계속 소유하고, 보관함은 수정 결과만 콜백으로 돌려준다. 활동 카드의 문장 목록은 본문 흐름에서 제거하고, 작성대와 버튼을 하나의 하단 고정 영역으로 묶는다.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, CSS, Vite.

---

## 파일 구조

- Create: src/components/SentenceHistory.tsx — 최근 문장 두 줄 요약, 보관함·수정 대화상자의 상태와 포커스
- Create: src/components/SentenceHistory.test.tsx — 보관함 열기, 수정, 취소, 포커스 복원 검증
- Modify: src/App.tsx — 보관함 통합, 저장 뒤 스크롤 없는 포커스 복원, 도움 분석 중 자동 스크롤 제거
- Modify: src/App.test.tsx — 요약 표시, 초안 보존, 자동 스크롤 없음 검증
- Modify: src/styles.css — 하단 고정 작성대, 보관함, 학생용 대화상자와 반응형 높이
- Keep: src/components/SentenceList.tsx — 완료 화면에서 사용하는 기존 카드 수정 기능은 바꾸지 않는다.

### Task 1: 문장 보관함의 실패 테스트와 독립 컴포넌트를 만든다

**Files:**

- Create: src/components/SentenceHistory.tsx
- Create: src/components/SentenceHistory.test.tsx

- [ ] **Step 1: 닫힌 요약, 전체 목록, 작은 수정 창의 실패 테스트를 작성한다.**

    import { cleanup, fireEvent, render, screen } from "@testing-library/react";
    import { afterEach, describe, expect, it, vi } from "vitest";
    import { SentenceHistory } from "./SentenceHistory";

    afterEach(cleanup);

    describe("SentenceHistory", () => {
      it("최근 문장을 두 줄 요약으로 보이고 보관함 전체를 눌러 목록을 연다", () => {
        render(
          <SentenceHistory
            sentences={["버스를 타고 왔어요.", "창밖에는 비에 젖은 나무가 보였어요."]}
            onReturnToDraft={vi.fn()}
            onSaveEdit={vi.fn()}
          />
        );

        expect(screen.getByRole("button", { name: /지금까지 쓴 문장 2개/ })).toHaveTextContent(
          "창밖에는 비에 젖은 나무가 보였어요."
        );
        fireEvent.click(screen.getByRole("button", { name: /지금까지 쓴 문장 2개/ }));

        expect(screen.getByRole("dialog", { name: "문장 보관함" })).toBeInTheDocument();
        expect(screen.getByText("버스를 타고 왔어요.")).toBeInTheDocument();
        expect(screen.getByText("창밖에는 비에 젖은 나무가 보였어요.")).toBeInTheDocument();
      });

      it("수정 저장 뒤에는 현재 작성대로 돌아간다", () => {
        const onSaveEdit = vi.fn();
        const onReturnToDraft = vi.fn();
        render(<SentenceHistory sentences={["버스를 타고 왔어요."]} onReturnToDraft={onReturnToDraft} onSaveEdit={onSaveEdit} />);

        fireEvent.click(screen.getByRole("button", { name: /지금까지 쓴 문장 1개/ }));
        fireEvent.click(screen.getByRole("button", { name: "1번째 문장 수정" }));
        fireEvent.change(screen.getByLabelText("1번째 문장 수정 내용"), { target: { value: "지하철을 타고 왔어요." } });
        fireEvent.click(screen.getByRole("button", { name: "수정 저장" }));

        expect(onSaveEdit).toHaveBeenCalledWith(0, "지하철을 타고 왔어요.");
        expect(onReturnToDraft).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });

      it("ESC는 대화상자만 닫고 작성대 포커스를 돌려준다", () => {
        const onReturnToDraft = vi.fn();
        render(<SentenceHistory sentences={["버스를 타고 왔어요."]} onReturnToDraft={onReturnToDraft} onSaveEdit={vi.fn()} />);

        fireEvent.click(screen.getByRole("button", { name: /지금까지 쓴 문장 1개/ }));
        fireEvent.keyDown(screen.getByRole("dialog", { name: "문장 보관함" }), { key: "Escape" });

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(onReturnToDraft).toHaveBeenCalledTimes(1);
      });
    });

- [ ] **Step 2: 컴포넌트가 아직 없어 테스트가 실패하는지 확인한다.**

Run: bun run test -- src/components/SentenceHistory.test.tsx

Expected: FAIL with Failed to resolve import "./SentenceHistory".

- [ ] **Step 3: 보관함과 수정 대화상자를 구현한다.**

    import { useEffect, useRef, useState } from "react";
    import { draftValidationMessage } from "../lib/studentWriting";

    interface SentenceHistoryProps {
      readonly sentences: readonly string[];
      readonly onReturnToDraft: () => void;
      readonly onSaveEdit: (index: number, value: string) => void;
    }

    type HistoryView =
      | { readonly kind: "closed" }
      | { readonly kind: "history" }
      | { readonly kind: "edit"; readonly index: number; readonly value: string };

    export function SentenceHistory({ sentences, onReturnToDraft, onSaveEdit }: SentenceHistoryProps) {
      const [view, setView] = useState<HistoryView>({ kind: "closed" });
      const dialogRef = useRef<HTMLElement>(null);
      const editTextareaRef = useRef<HTMLTextAreaElement>(null);
      const latestSentence = sentences.at(-1) ?? "";
      const editingValue = view.kind === "edit" ? view.value : "";
      const editMessage = draftValidationMessage(editingValue);

      useEffect(() => {
        if (view.kind === "history") dialogRef.current?.focus({ preventScroll: true });
        if (view.kind === "edit") editTextareaRef.current?.focus({ preventScroll: true });
      }, [view]);

      function closeToDraft(): void {
        setView({ kind: "closed" });
        window.requestAnimationFrame(onReturnToDraft);
      }

      function saveEdit(): void {
        if (view.kind !== "edit" || editMessage !== null) return;
        onSaveEdit(view.index, view.value.trim());
        closeToDraft();
      }

      if (sentences.length === 0) return null;

      // Return the summary trigger and the appropriate one of two dialogs.
    }

Render one button with aria-label "지금까지 쓴 문장 N개". Its text includes the count and a span with class sentence-history__preview containing latestSentence. In history mode, render only the numbered read-only list and row buttons labelled "N번째 문장 수정". In edit mode, unmount the history dialog and render only one small edit dialog with label "N번째 문장 수정 내용", buttons "수정 저장" and "취소".

Give each dialog role="dialog", aria-modal="true", and an aria-labelledby heading. Implement a local Tab focus loop over enabled button and textarea descendants. Escape, the explicit 닫기 button, and a backdrop click call closeToDraft. The edit dialog keeps draftValidationMessage behaviour and disables 수정 저장 for invalid input.

- [ ] **Step 4: 새 컴포넌트 테스트를 통과시킨다.**

Run: bun run test -- src/components/SentenceHistory.test.tsx

Expected: PASS with 3 tests.

- [ ] **Step 5: 보관함 컴포넌트만 커밋한다.**

    git add src/components/SentenceHistory.tsx src/components/SentenceHistory.test.tsx
    git commit -m "feat: add sentence history drawer"

### Task 2: 학생 작성 흐름을 고정 작성대와 연결한다

**Files:**

- Modify: src/App.tsx
- Modify: src/App.test.tsx

- [ ] **Step 1: 저장 뒤 요약 표시, 초안 보존, 자동 스크롤 제거의 실패 테스트를 추가한다.**

    it("첫 문장을 저장해도 다음 작성대에서 보관함 요약만 보인다", () => {
      render(<App />);
      fireEvent.change(screen.getByLabelText("1번째 문장"), { target: { value: "버스를 타고 왔어요." } });
      fireEvent.click(screen.getByRole("button", { name: "문장 저장" }));

      expect(screen.getByRole("button", { name: /지금까지 쓴 문장 1개/ })).toHaveTextContent("버스를 타고 왔어요.");
      expect(screen.queryByTestId("sentence-card-1")).not.toBeInTheDocument();
      expect(screen.getByLabelText("2번째 문장")).toHaveValue("");
      expect(document.activeElement).toHaveAccessibleName("2번째 문장");
    });

    it("보관함에서 앞 문장을 고쳐도 현재 초안과 단계가 남는다", () => {
      render(<App />);
      fireEvent.change(screen.getByLabelText("1번째 문장"), { target: { value: "버스를 타고 왔어요." } });
      fireEvent.click(screen.getByRole("button", { name: "문장 저장" }));
      fireEvent.change(screen.getByLabelText("2번째 문장"), { target: { value: "창밖의 비를 보고 있어요." } });

      fireEvent.click(screen.getByRole("button", { name: /지금까지 쓴 문장 1개/ }));
      fireEvent.click(screen.getByRole("button", { name: "1번째 문장 수정" }));
      fireEvent.change(screen.getByLabelText("1번째 문장 수정 내용"), { target: { value: "지하철을 타고 왔어요." } });
      fireEvent.click(screen.getByRole("button", { name: "수정 저장" }));

      expect(screen.getByLabelText("2번째 문장")).toHaveValue("창밖의 비를 보고 있어요.");
      expect(screen.getByRole("button", { name: /지금까지 쓴 문장 1개/ })).toHaveTextContent("지하철을 타고 왔어요.");
    });

    it("도움 분석을 시작해도 활동 카드에 자동 스크롤을 요청하지 않는다", () => {
      const scrollTo = vi.fn();
      const scrollToDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo");
      const requestAnimationFrame = window.requestAnimationFrame;
      Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: scrollTo });
      window.requestAnimationFrame = (callback) => {
        callback(0);
        return 1;
      };

      try {
        render(<App />);
        fireEvent.click(screen.getByRole("button", { name: "도움!" }));
        expect(scrollTo).not.toHaveBeenCalled();
      } finally {
        window.requestAnimationFrame = requestAnimationFrame;
        if (scrollToDescriptor) Object.defineProperty(HTMLElement.prototype, "scrollTo", scrollToDescriptor);
        else delete (HTMLElement.prototype as { scrollTo?: unknown }).scrollTo;
      }
    });

- [ ] **Step 2: 기존 카드 목록과 자동 스크롤 때문에 테스트가 실패하는지 확인한다.**

Run: bun run test -- src/App.test.tsx

Expected: FAIL because sentence-card-1 is 본문에 남고 도움 분석 효과가 scrollTo를 호출한다.

- [ ] **Step 3: App에 보관함을 통합하고 자동 스크롤을 없앤다.**

    import { SentenceHistory } from "./components/SentenceHistory";

    useEffect(() => {
      if (!focusDraft) return;
      draftTextarea.current?.focus({ preventScroll: true });
      setFocusDraft(false);
    }, [focusDraft, step]);

    function returnToDraft(): void {
      draftTextarea.current?.focus({ preventScroll: true });
    }

Remove the activity-card ref and the useEffect that calls activityCard.current.scrollTo while help is analyzing. In the in-progress activity branch, replace the inline SentenceList with:

    <div className="writing-dock">
      <SentenceHistory sentences={sentences} onReturnToDraft={returnToDraft} onSaveEdit={handleSaveEdit} />
      <label className="sentence-field" htmlFor="sentence">{/* existing field contents */}</label>
      <div className="student-actions">{/* existing buttons */}</div>
    </div>

Do not change the completion branch's SentenceList. Keep handleSaveEdit as the only sentence mutation path so an edit still invalidates an in-flight help answer and the existing Firestore save effect records the changed confirmed sentence.

- [ ] **Step 4: 학생 흐름 회귀 테스트를 통과시킨다.**

Run: bun run test -- src/App.test.tsx src/components/SentenceHistory.test.tsx

Expected: PASS, including existing 도움 요청, 개인정보, 완료 문단 tests.

- [ ] **Step 5: 고정 작성 흐름 연결만 커밋한다.**

    git add src/App.tsx src/App.test.tsx
    git commit -m "feat: keep student writing dock fixed"

### Task 3: 작성대와 대화상자의 반응형 레이아웃을 만든다

**Files:**

- Modify: src/styles.css

- [ ] **Step 1: 활동 카드에서 문장 목록이 흐름을 차지하는 규칙을 제거한다.**

Remove the in-progress sentence-list margin, sentence-list empty spacer, and sentence-field/student-actions relative-flow overrides. Keep completion-card sentence-list rules because the completed activity still uses SentenceList.

- [ ] **Step 2: 고정 작성대, 보관함, 학생용 대화상자의 CSS를 추가한다.**

    .student-card:not(.completion-card) {
      display: block;
      height: min(680px, calc(100dvh - 48px));
      min-height: 0;
      max-height: none;
      overflow: clip;
    }

    .writing-dock {
      position: absolute;
      z-index: 4;
      right: 24px;
      bottom: 24px;
      left: 24px;
      display: grid;
      gap: 12px;
    }

    .writing-dock .sentence-field,
    .writing-dock .student-actions {
      position: static;
      margin: 0;
    }

    .writing-dock .sentence-field textarea {
      height: 96px;
      min-height: 96px;
      max-height: 96px;
      overflow-y: auto;
    }

Add sentence-history styles for one full-width button, a two-line webkit line clamp preview, and visible focus outlines. Add student-dialog-backdrop, student-dialog, student-dialog__list, student-dialog__sentence, student-dialog__actions, and student-dialog__close styles using the existing vanilla, grape, lime, and pink palette. Give the dialog body max-height: min(68dvh, 440px) and overflow-y: auto; only overlay content may scroll.

For max-height 700px, make the student card height 100dvh, remove shell padding, reduce the guide character height and bottom offset, and use 16px side/bottom dock offsets. The dock must stay visible before decorative Didi spacing. In prefers-reduced-motion, disable transitions for the student dialog as well as the guide character.

- [ ] **Step 3: build and inspect the CSS bundle.**

Run: bun run build

Expected: PASS with TypeScript and Vite build completion.

- [ ] **Step 4: 스타일 변경만 커밋한다.**

    git add src/styles.css
    git commit -m "style: pin the student writing dock"

### Task 4: 전체 회귀와 실제 화면 검증을 마친다

**Files:**

- Test only: src/App.test.tsx, src/components/SentenceHistory.test.tsx, existing suite

- [ ] **Step 1: 전체 자동 검증을 실행한다.**

Run: bun run test && bun run build && pnpm lint

Expected: tests pass, build succeeds, and lint exits 0. Record pre-existing lint warnings separately only if they remain outside changed files.

- [ ] **Step 2: 실제 브라우저에서 학생 흐름을 확인한다.**

Run: bun run dev -- --host 127.0.0.1

Check at 320px mobile, tablet, and desktop widths:

1. 첫 문장부터 네 번째 문장까지 저장할 때 입력칸의 위쪽과 도움·저장 버튼이 같은 화면상 위치에 남는다.
2. 최근 문장 두 줄 미리보기만 보이고, 긴 최근 문장은 말줄임 처리된다.
3. 보관함의 텍스트와 미리보기 어느 쪽을 눌러도 전체 목록이 열린다.
4. 첫 문장을 수정하고 저장해도 두 번째 문장의 초안이 그대로 남고 입력칸에 포커스가 돌아온다.
5. 도움 요청을 시작·완료해도 학생 화면이 위로 점프하지 않는다.
6. 다섯 번째 문장 완료 화면의 문단과 기존 카드 수정이 계속 동작한다.

- [ ] **Step 3: 최종 변경을 검토한다.**

Run: git diff --check && git status --short

Expected: whitespace error 없음. Task 1~3의 커밋 밖에 남은 관련 없는 변경은 stage 하지 않는다.

## 계획 자체 검토

- 설계의 고정 작성대, 최근 문장 두 줄, 전체 보관함, 작은 수정 창, 초안 보존, 스크롤 제거, 개인정보·AI 경계 유지, 완료 화면 회귀 검증을 각각 Task 1부터 Task 4에 배치했다.
- 새 상태는 SentenceHistory 안에서만 관리하고, 확정 문장·초안·도움 요청·Firestore 저장은 기존 App 경계를 유지한다.
- 계획에는 보관함의 문장 삭제·순서 변경, 데이터 모델·보안 규칙·대시보드 변경을 넣지 않았다.
