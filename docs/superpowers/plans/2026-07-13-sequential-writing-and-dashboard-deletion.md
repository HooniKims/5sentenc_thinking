# 순차 문장 작성과 대시보드 기록 삭제 Implementation Plan

> **폐기된 역사 기록:** 아래의 Architecture, Task, 코드 블록은 현재 구현 지시가 아니다. 특히 원문·초안 전송과 작성 중 문장 저장을 따르지 않는다. 현재의 개인정보 보호·AI 입력 경계·삭제 기준은 [순차 작성과 대시보드 삭제 설계](../specs/2026-07-13-sequential-writing-and-dashboard-deletion-design.md)를 따른다.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학생이 확정한 문장을 카드 목록으로 쌓으며 다음 문장 하나씩 이어 쓰고, 진행자가 학생별 또는 수업 전체 기록을 안전하게 지울 수 있게 한다.

**Architecture (폐기됨):** 학생 화면의 문장 상태는 `sentences`와 현재 `draft`로 분리한다. 현재 앱은 초안을 저장하지 않고, AI에는 원문 대신 기기 안에서 만든 비식별 작성 신호만 보낸다. 진행자 삭제는 기존 이메일 로그인과 Firestore 교사 권한을 사용해 `participants`, `helpRequests`, `cheers`를 400개 단위 batch로 삭제한다.

**Tech Stack:** React 19, TypeScript, Vitest, Firebase Authentication, Cloud Firestore, Upstage Solar Pro 3, Vercel Serverless Function.

---

### Task 1: 한 문장 상태 유틸리티를 만든다

**Files:**
- Create: `src/lib/sentences.ts`
- Create: `src/lib/sentences.test.ts`

- [ ] **Step 1: 한 문장 판별과 문장 수정의 실패 테스트를 작성한다.**

```ts
import { describe, expect, it } from "vitest";
import { isSingleSentence, replaceSentence } from "./sentences";

describe("문장 목록", () => {
  it("마침표 하나를 포함한 한 문장만 확정할 수 있다", () => {
    expect(isSingleSentence("버스를 타고 왔어요.")).toBe(true);
    expect(isSingleSentence("버스를 타고 왔어요. 비가 왔어요.")).toBe(false);
    expect(isSingleSentence("첫 문장\n둘째 문장")).toBe(false);
  });

  it("고른 문장만 새 문장으로 바꾼다", () => {
    expect(replaceSentence(["첫 문장.", "둘째 문장."], 0, "바꾼 문장.")).toEqual([
      "바꾼 문장.",
      "둘째 문장."
    ]);
  });
});
```

- [ ] **Step 2: 실패를 확인한다.**

Run: `bun run test -- src/lib/sentences.test.ts`

Expected: FAIL because `./sentences` does not exist.

- [ ] **Step 3: 최소 유틸리티를 구현한다.**

```ts
export function isSingleSentence(value: string): boolean {
  const sentences = value.trim().split(/(?<=[.!?])\s*|\n+/).filter(Boolean);
  return sentences.length === 1;
}

export function replaceSentence(sentences: readonly string[], index: number, value: string): readonly string[] {
  return sentences.map((sentence, sentenceIndex) => (sentenceIndex === index ? value : sentence));
}
```

- [ ] **Step 4: 유틸리티 테스트가 통과하는지 확인한다.**

Run: `bun run test -- src/lib/sentences.test.ts`

Expected: PASS with 2 tests.

- [ ] **Step 5: 문장 유틸리티 변경만 커밋한다.**

```bash
git add src/lib/sentences.ts src/lib/sentences.test.ts
git commit -m "feat: add sentence list helpers"
```

### Task 2: 학생 화면을 문장 카드와 다음 문장 입력칸으로 바꾼다

**Files:**
- Create: `src/components/SentenceList.tsx`
- Create: `src/components/SentenceList.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: 첫 문장이 카드가 되고 다음 빈 입력칸이 열리는 실패 테스트를 작성한다.**

```tsx
it("첫 문장을 확정하면 목록에 남기고 둘째 문장 입력칸만 연다", () => {
  render(<App />);

  fireEvent.change(screen.getByLabelText("1번째 문장"), { target: { value: "버스를 타고 왔어요." } });
  fireEvent.click(screen.getByRole("button", { name: "첫 문장 저장" }));

  expect(screen.getByTestId("sentence-card-1")).toHaveTextContent("버스를 타고 왔어요.");
  expect(screen.getByLabelText("2번째 문장")).toHaveValue("");
  expect(screen.queryByLabelText("1번째 문장")).not.toBeInTheDocument();
});

it("고정된 문장을 수정하면 완성 문단에도 같은 문장이 반영된다", () => {
  const { container } = render(<App />);
  const sentences = ["교문 앞에 섰어요.", "친구를 만났어요.", "함께 웃었어요.", "교실로 걸어갔어요.", "오늘이 기대됐어요."];

  for (const sentence of sentences) {
    const input = screen.getByLabelText(/번째 문장/);
    fireEvent.change(input, { target: { value: sentence } });
    fireEvent.click(screen.getByRole("button", { name: "문장 저장" }));
  }

  fireEvent.click(screen.getByRole("button", { name: "1번째 문장 수정" }));
  fireEvent.change(screen.getByLabelText("1번째 문장 수정"), { target: { value: "교문 앞에서 숨을 골랐어요." } });
  fireEvent.click(screen.getByRole("button", { name: "1번째 문장 수정 저장" }));

  expect(container.querySelector("[data-testid='complete-paragraph']")).toHaveTextContent("교문 앞에서 숨을 골랐어요.");
});
```

- [ ] **Step 2: 실패를 확인한다.**

Run: `bun run test -- src/App.test.tsx src/components/SentenceList.test.tsx`

Expected: FAIL because 문장 카드와 `1번째 문장` 입력 흐름이 아직 없다.

- [ ] **Step 3: 문장 카드 컴포넌트를 구현한다.**

`SentenceList`는 확정 문장과 수정 중인 인덱스를 받는다. 각 카드에 번호, 문장, `수정` 버튼을 표시하고 수정 중일 때만 해당 카드 안에 한 줄 입력칸과 `저장` 버튼을 보인다.

```tsx
export interface SentenceListProps {
  readonly sentences: readonly string[];
  readonly editingIndex: number | null;
  readonly onStartEditing: (index: number) => void;
  readonly onSaveEditing: (index: number, value: string) => void;
}
```

카드는 `data-testid={\`sentence-card-${index + 1}\`}`를 사용한다. 빈 문장이나 두 문장 이상인 수정값은 저장하지 않고 카드 가까이에 안내한다.

- [ ] **Step 4: `App`의 상태와 저장 흐름을 분리한다.**

`thoughtVersions`를 삭제하고 다음 상태를 둔다.

```ts
const [sentences, setSentences] = useState<readonly string[]>([]);
const [draft, setDraft] = useState("");
const [editingIndex, setEditingIndex] = useState<number | null>(null);
const step = Math.min(sentences.length + 1, 5) as 1 | 2 | 3 | 4 | 5;
```

`draft`가 한 문장일 때만 `문장 저장` 버튼을 활성화한다. 저장하면 `setSentences((current) => [...current, draft.trim()])`, `setDraft("")`를 실행한다. 다섯 번째 문장을 저장한 뒤에는 `completed`를 `true`로 바꾸고 `sentences.join(" ")`를 완성 문단으로 표시한다.

현재 앱에서는 `saveParticipant`에 확정된 `sentences`만 전달한다. 작성 중인 `draft`는 브라우저 화면에만 머문다. `currentStep`은 다음 입력칸의 단계로 보낸다.

- [ ] **Step 5: 카드와 입력칸의 모바일 레이아웃을 구현한다.**

`.sentence-list`는 말풍선 아래, 새 입력칸 위에 세로로 놓는다. `.sentence-card`는 흰 글자·얇은 검은 외곽선을 유지하고 `수정` 버튼은 카드 오른쪽 아래에 둔다. 카드가 많아져도 작성 칸과 하단 버튼이 가려지지 않도록 목록에는 `max-height`와 세로 스크롤을 적용한다.

- [ ] **Step 6: 학생 화면 테스트를 통과시킨다.**

Run: `bun run test -- src/App.test.tsx src/components/SentenceList.test.tsx`

Expected: PASS. 기존 디디 대기·이동·입 프레임 테스트도 새 입력 흐름에 맞춘 이름으로 통과한다.

- [ ] **Step 7: 학생 작성 흐름 변경만 커밋한다.**

```bash
git add src/App.tsx src/App.test.tsx src/components/SentenceList.tsx src/components/SentenceList.test.tsx src/styles.css
git commit -m "feat: write five sentences one at a time"
```

### Task 3: 실시간 AI 질문을 우선하고 안전 질문을 실패 때만 쓴다

**Files:**
- Modify: `src/lib/helpGuidance.ts`
- Modify: `src/lib/helpGuidance.test.ts`
- Modify: `src/lib/helpClient.ts`
- Modify: `api/help.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: 새 요청 구조와 분석 중 상태의 실패 테스트를 작성한다.**

```ts
it("앞 문장과 현재 초안을 함께 담아 연결 질문을 요청한다", () => {
  const prompt = buildGuidancePrompt({
    step: 2,
    sentences: ["버스를 타고 왔어요."],
    draft: "창밖을 봤어요."
  });

  expect(prompt).toContain("앞에서 확정한 문장");
  expect(prompt).toContain("작성 중인 다음 문장 초안");
  expect(prompt).toContain("연결을 살펴본다");
});
```

```tsx
it("도움 요청 중에는 분석 안내를 먼저 보이고 실패할 때만 안전 질문을 보인다", async () => {
  const guidanceFailure = new Error("network failed");
  vi.mocked(requestGuidanceQuestion).mockRejectedValueOnce(guidanceFailure);
  render(<App />);

  fireEvent.change(screen.getByLabelText("1번째 문장"), { target: { value: "버스를 타고 왔어요." } });
  fireEvent.click(screen.getByRole("button", { name: "도움!" }));

  expect(screen.getByText("디디가 문장 사이를 살펴보고 있어요.")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByTestId("help-question")).toHaveTextContent(/\?$/));
  expect(screen.queryByText("디디가 문장 사이를 살펴보고 있어요.")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: 실패를 확인한다.**

Run: `bun run test -- src/lib/helpGuidance.test.ts src/App.test.tsx`

Expected: FAIL because 도움 요청에는 아직 `thought` 한 문자열만 있고 분석 상태가 없다.

- [ ] **Step 3: 도움 입력과 프롬프트를 바꾼다.**

`HelpGuidanceInput`을 다음처럼 바꾼다.

```ts
export interface HelpGuidanceInput {
  readonly step: 1 | 2 | 3 | 4 | 5;
  readonly sentences: readonly string[];
  readonly draft: string;
}
```

현재 `buildGuidancePrompt`에는 단계·문장 수·초안 길이 구간·관찰 범주·반복 여부만 표시한다. 확정 문장 목록과 `draft` 원문은 넣지 않는다. 단일 질문·답안 차단 검사는 유지한다.

현재 `api/help.ts`의 Zod 입력 스키마는 구조화한 비식별 신호만 받고, `sentences`·`draft` 같은 원문 필드는 엄격하게 거절한다.

- [ ] **Step 4: `App`에 분석 상태와 실패 전용 fallback을 구현한다.**

```ts
type HelpState = "idle" | "analyzing" | "ready" | "fallback";
```

도움 요청 직후 `analyzing`으로 바꾸고, 말풍선에는 `디디가 문장 사이를 살펴보고 있어요.`를 보인다. 요청 성공 시 `ready`와 AI 질문을, 실패 시 `fallback`과 `fallbackHelpQuestion`을 설정한다. 같은 요청의 늦은 응답이 새 요청을 덮지 않도록 `helpRequestId`를 증가시키고 응답을 적용하기 전에 현재 ID와 비교한다.

- [ ] **Step 5: 테스트를 통과시킨다.**

Run: `bun run test -- src/lib/helpGuidance.test.ts src/App.test.tsx`

Expected: PASS. 성공 경로에서는 실시간 질문, 실패 경로에서만 안전 질문이 표시된다.

- [ ] **Step 6: 실시간 도움 흐름 변경만 커밋한다.**

```bash
git add src/App.tsx src/App.test.tsx src/lib/helpGuidance.ts src/lib/helpGuidance.test.ts src/lib/helpClient.ts api/help.ts
git commit -m "feat: ask AI for connected next-sentence guidance"
```

### Task 4: 진행자용 기록 삭제 데이터 계층을 만든다

**Files:**
- Modify: `src/lib/activityStore.ts`
- Create: `src/lib/activityStore.test.ts`
- Modify: `scripts/firestore-rules-live-test.ts`

- [ ] **Step 1: 삭제 대상 선정과 400개 batch 분할의 실패 테스트를 작성한다.**

```ts
import { describe, expect, it } from "vitest";
import { splitIntoDeleteBatches } from "./activityStore";

describe("기록 삭제 batch", () => {
  it("801개 문서를 400개 이하의 세 batch로 나눈다", () => {
    const documentIds = Array.from({ length: 801 }, (_, index) => `doc-${index}`);
    expect(splitIntoDeleteBatches(documentIds).map((batch) => batch.length)).toEqual([400, 400, 1]);
  });
});
```

- [ ] **Step 2: 실패를 확인한다.**

Run: `bun run test -- src/lib/activityStore.test.ts`

Expected: FAIL because `splitIntoDeleteBatches` does not exist.

- [ ] **Step 3: 삭제 함수와 batch 유틸리티를 구현한다.**

```ts
export async function deleteParticipantHistory(sessionId: string, participant: SessionParticipant): Promise<void>;
export async function deleteSessionHistory(sessionId: string): Promise<void>;
```

`deleteParticipantHistory`는 participant 문서, `ownerUid == participant.ownerUid`인 `helpRequests`, 같은 `ownerUid`의 `cheers`를 모아 400개 이하 batch로 지운다. `deleteSessionHistory`는 세 하위 컬렉션의 모든 문서와 세션 문서를 같은 방식으로 지운다. document reference 수집과 batch 분할은 `splitIntoDeleteBatches`를 재사용한다.

Firestore 쿼리에는 `collection`, `getDocs`, `query`, `where`, `writeBatch`를 사용한다. 삭제 함수는 진행자 UI가 진행 중 상태를 표시할 수 있도록 `onBatchComplete?: (completed: number, total: number) => void`를 받는다.

두 함수의 실제 시그니처는 다음과 같다.

```ts
export type DeleteProgress = (completed: number, total: number) => void;

export async function deleteParticipantHistory(
  sessionId: string,
  participant: SessionParticipant,
  onBatchComplete?: DeleteProgress
): Promise<void>;

export async function deleteSessionHistory(sessionId: string, onBatchComplete?: DeleteProgress): Promise<void>;
```

- [ ] **Step 4: 실환경 규칙 테스트에 삭제 권한을 추가한다.**

`scripts/firestore-rules-live-test.ts`에 participant, help request, cheer를 같은 규칙 확인 세션에 만든다. 익명 학생의 삭제는 `permission-denied`인지, 진행자의 세 문서 삭제는 성공하는지 확인한다. 성공 뒤에는 `getDocs`로 해당 세 하위 컬렉션이 비었는지 확인하고 Firestore 연결을 종료한다.

- [ ] **Step 5: 데이터 계층과 규칙 테스트를 통과시킨다.**

Run: `bun run test -- src/lib/activityStore.test.ts && bun run test:firestore-rules`

Expected: PASS. 실환경 테스트 뒤 rules-probe 문서는 남지 않는다.

- [ ] **Step 6: 진행자 삭제 데이터 계층만 커밋한다.**

```bash
git add src/lib/activityStore.ts src/lib/activityStore.test.ts scripts/firestore-rules-live-test.ts
git commit -m "feat: add teacher record deletion helpers"
```

### Task 5: 진행자 대시보드에 개별·일괄 삭제 확인 창을 구현한다

**Files:**
- Modify: `src/components/TeacherDashboard.tsx`
- Modify: `src/components/TeacherDashboard.test.tsx`
- Modify: `src/components/AdminDashboard.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: 카드 삭제와 전체 삭제 확인 창의 실패 테스트를 작성한다.**

```tsx
it("학생 기록 삭제는 확인 뒤에만 실행한다", async () => {
  const onDeleteParticipant = vi.fn().mockResolvedValue(undefined);
  render(<TeacherDashboard participants={[helpingParticipant]} onDeleteParticipant={onDeleteParticipant} onDeleteSession={vi.fn()} />);

  fireEvent.click(screen.getByRole("button", { name: "별빛탐험가 02 기록 삭제" }));
  expect(onDeleteParticipant).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "삭제하기" }));
  await waitFor(() => expect(onDeleteParticipant).toHaveBeenCalledWith(helpingParticipant));
});
```

```tsx
it("전체 기록 삭제는 두 번째 확인 버튼을 눌러야 실행한다", async () => {
  const onDeleteSession = vi.fn().mockResolvedValue(undefined);
  render(<TeacherDashboard participants={[]} onDeleteParticipant={vi.fn()} onDeleteSession={onDeleteSession} />);

  fireEvent.click(screen.getByRole("button", { name: "수업 기록 모두 삭제" }));
  expect(onDeleteSession).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "전체 기록 삭제" }));

  await waitFor(() => expect(onDeleteSession).toHaveBeenCalledTimes(1));
});
```

- [ ] **Step 2: 실패를 확인한다.**

Run: `bun run test -- src/components/TeacherDashboard.test.tsx`

Expected: FAIL because 삭제 버튼과 콜백 props가 없다.

- [ ] **Step 3: 삭제 확인 창과 진행 상태를 구현한다.**

`TeacherDashboardProps`에 다음 콜백을 추가한다.

```ts
readonly onDeleteParticipant: (participant: SessionParticipant) => Promise<void>;
readonly onDeleteSession: () => Promise<void>;
```

`pendingDeletion`을 `null | { readonly kind: "participant"; readonly participant: SessionParticipant } | { readonly kind: "session" }`으로 둔다. 삭제 버튼을 누르면 설명·취소·확인 버튼이 있는 대화상자를 열고, 확인을 누를 때만 콜백을 실행한다. 실행 중에는 해당 버튼을 비활성화하고 `기록을 지우고 있어요.`를 표시한다.

`AdminDashboard`는 `deleteParticipantHistory`와 `deleteSessionHistory`를 전달한다. 실패하면 `admin-notice`에 `기록을 지우지 못했어요. 잠시 뒤 다시 시도해 주세요.`를 표시한다. 성공 여부는 Firestore 실시간 구독이 카드 목록을 갱신한다.

- [ ] **Step 4: 대시보드 스타일과 접근성을 구현한다.**

`.participant-card__delete`는 카드의 보조 행동으로, `.admin-danger`는 상단의 전체 삭제 행동으로 둔다. 확인 창은 `role="dialog"`, `aria-modal="true"`, 설명을 가리키는 `aria-describedby`를 쓴다. 위험 행동에는 분홍·짙은 자주색을 쓰되, 텍스트와 확인 단계를 함께 둔다.

- [ ] **Step 5: 대시보드 테스트를 통과시킨다.**

Run: `bun run test -- src/components/TeacherDashboard.test.tsx`

Expected: PASS. 확인 전에는 삭제 콜백이 실행되지 않고, 확인 뒤에만 정확한 대상이 전달된다.

- [ ] **Step 6: 대시보드 삭제 화면 변경만 커밋한다.**

```bash
git add src/components/AdminDashboard.tsx src/components/TeacherDashboard.tsx src/components/TeacherDashboard.test.tsx src/styles.css
git commit -m "feat: let teachers delete class records"
```

### Task 6: 문서·배포·실제 화면을 검증한다

**Files:**
- Modify: `DESIGN.md`
- Modify: `docs/superpowers/specs/2026-07-13-arrival-five-sentences-design.md`
- Modify: `docs/superpowers/specs/2026-07-13-sequential-writing-and-dashboard-deletion-design.md`

- [ ] **Step 1: 설계 문서를 구현 결과와 맞춘다.**

`DESIGN.md`의 “전체를 두·세·네·다섯 문장으로 다시 쓴다”를 “확정 문장 목록에 다음 문장을 하나씩 잇는다”로 바꾼다. 준비 질문은 실시간 응답의 실패 전용이라는 점과 진행자 삭제 확인 절차를 적는다.

- [ ] **Step 2: 전체 자동 검증을 실행한다.**

Run: `bun run test && bun run build && bun run test:firestore-rules && firebase deploy --only firestore:rules --project sentence-95003 --dry-run`

Expected: 모든 테스트와 타입 검사·빌드가 통과하고 Firestore 규칙이 컴파일된다.

- [ ] **Step 3: 브라우저에서 학생 흐름과 진행자 삭제를 점검한다.**

학생 화면에서 첫 문장을 저장하고, 카드가 남은 상태에서 둘째 빈 입력칸이 열리는지 확인한다. 첫 카드 수정 뒤 완성 문단이 바뀌는지 확인한다. 도움 요청 직후 분석 안내가 보이고, AI 질문 또는 실패 전용 안전 질문이 오는지 확인한다.

진행자 화면에서 테스트 학생 카드의 `기록 삭제`을 눌러 확인 전에는 카드가 남고, 확인 뒤 문장·도움 요청·응원 기록이 함께 사라지는지 확인한다. 별도 테스트 세션에서 `수업 기록 모두 삭제`의 두 번째 확인 뒤 세 하위 컬렉션이 비는지 확인한다.

- [ ] **Step 4: 프로덕션을 배포한다.**

Run: `vercel deploy --prod --yes`

Expected: 배포가 Ready가 되고 `https://5sentenc-thinking.vercel.app`이 최신 배포를 가리킨다.

- [ ] **Step 5: 검증된 변경을 문서와 함께 커밋한다.**

```bash
git add DESIGN.md docs/superpowers/specs/2026-07-13-arrival-five-sentences-design.md docs/superpowers/specs/2026-07-13-sequential-writing-and-dashboard-deletion-design.md docs/superpowers/plans/2026-07-13-sequential-writing-and-dashboard-deletion.md
git commit -m "docs: record sequential writing and deletion design"
```
