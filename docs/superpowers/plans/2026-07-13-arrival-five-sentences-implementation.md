# 여기에 어떻게 오셨어요? 구현 계획

> **폐기된 역사 기록:** 아래의 Architecture, Task, 코드 블록은 현재 구현 지시가 아닙니다. 현재 동작과 안전 경계는 `2026-07-13-sequential-writing-and-dashboard-deletion-design.md`와 `DESIGN.md`를 기준으로 합니다. 현재 앱은 Hono 서버·AI 응원 생성·학생 원문 전송을 사용하지 않습니다.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 중학생이 한 문장 생각을 두·세·네·다섯 문장으로 다시 구성하며 사고를 넓히고, 교사가 실시간으로 도움 요청과 현재 생각을 살필 수 있는 수업용 웹 앱을 만든다.

**Architecture:** React 클라이언트는 Firebase 익명 인증과 Firestore 실시간 구독으로 학생·교사 화면을 연결한다. Hono API는 Firebase ID 토큰을 확인한 뒤 Upstage Solar Pro 3에 도움 질문과 교사용 응원 초안만 요청한다. Firestore 보안 규칙은 학생을 자기 문서로 제한하고, `teachers/{uid}` 문서가 있는 교사만 대시보드와 세션 제어를 쓸 수 있게 한다.

**Tech Stack:** Vite, React, TypeScript, Vitest, Testing Library, Firebase Authentication, Cloud Firestore, Firebase Admin SDK, Hono, Upstage Solar Pro 3 (`solar-pro3-260323`).

> Git 메모: 현재 작업 폴더는 Git 저장소가 아니다. 구현 중 커밋 단계는 사용자가 저장소를 만든 뒤에만 실행한다.

---

## 파일 구성

| 경로 | 역할 |
| --- | --- |
| `src/types.ts` | 수업 세션, 학생, 도움 요청, 응원 데이터의 공통 타입 |
| `src/lib/activity.ts` | 단계 전환, 도움 요청 중복 차단, 대시보드 우선순위 계산 |
| `src/lib/firebase.ts` | Firebase 앱·Auth·Firestore 초기화 |
| `src/lib/activityStore.ts` | Firestore 읽기·쓰기·실시간 구독 |
| `src/lib/nickname.ts` | 랜덤 닉네임 생성과 닉네임 정리 |
| `src/components/StudentActivity.tsx` | QR로 접속한 학생의 1~5문장 작성 화면 |
| `src/components/TeacherDashboard.tsx` | 실시간 문장 카드, 도움 요청, 응원 전송 화면 |
| `src/components/Robot3D.tsx` | 디디의 3D 제스처와 고정 무대 |
| `server/index.mjs` | 정적 앱과 AI API를 제공하는 Express 서버 |
| `server/firebaseAdmin.mjs` | Firebase ID 토큰 검증과 Admin Firestore 접근 |
| `server/solar.mjs` | Solar Pro 3 프롬프트와 도움 질문·응원 초안 생성 |
| `firestore.rules` | 학생·교사 권한을 강제하는 Firestore 규칙 |
| `firestore.indexes.json` | 세션별 도움 요청·학생 상태 조회 인덱스 |
| `.env.example` | Upstage와 Firebase 설정값의 빈 자리 |

### Task 0: 콘페스타 디자인 시스템을 먼저 고정한다

**Files:**
- Create: `DESIGN.md`
- Reuse: `/Volumes/exDisk/vibecoding project/17. AI_MC/DESIGN.md`

- [ ] **Step 1: 프로젝트 전용 디자인 시스템을 작성한다.**

콘페스타의 보라색 무대, 라임 리본, 바닐라 패널, Paperlogy 글꼴, 디디의 3D 제스처를 토큰·컴포넌트·상태·반응형 규칙으로 기록한다. 학생 입력 문장의 흰색 글자와 0.65px 검은 외곽선, 캐릭터를 가리지 않는 상단 말풍선, 도움·응원·오류 상태를 명시한다.

- [ ] **Step 2: 제품 화면보다 먼저 프리미티브를 검증한다.**

버튼, 진행 표시, 말풍선, 입력칸, 학생 카드, 도움 요청 카드의 기본·로딩·오류·비활성 상태를 컴포넌트 쇼케이스에서 확인한다. 모바일 375px, 태블릿 768px, 데스크톱 1280px에서 가로 스크롤과 겹침이 없는지 점검한다.

### Task 1: Vite·React 프로젝트와 공통 타입을 만든다

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`
- Create: `src/main.tsx`, `src/App.tsx`, `src/styles.css`, `src/types.ts`, `src/setupTests.ts`
- Create: `src/lib/activity.test.ts`

- [ ] **Step 1: 활동 규칙 테스트를 먼저 작성한다.**

```ts
import { describe, expect, it } from "vitest";
import { dashboardPriority, nextStep, requestHelp } from "./activity";

it("도움 요청 학생을 대시보드 최상단으로 정렬한다", () => {
  expect(dashboardPriority("help_requested")).toBeLessThan(dashboardPriority("writing"));
});

it("다섯 번째 문장 뒤에는 다음 단계가 없다", () => {
  expect(nextStep(5)).toBe(null);
});

it("진행 중인 도움 요청은 하나로 합친다", () => {
  expect(requestHelp("help_requested")).toEqual({ accepted: false, nextStatus: "help_requested" });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다.**

Run: `npm test -- src/lib/activity.test.ts`

Expected: test runner 또는 `./activity` 모듈을 찾지 못해 실패한다.

- [ ] **Step 3: 프로젝트와 활동 타입·순수 함수를 만든다.**

```ts
export type ParticipantStatus = "writing" | "help_requested" | "help_generating" | "help_delivered" | "completed";

export interface Participant {
  id: string;
  ownerUid: string;
  nickname: string;
  sentences: string[];
  currentStep: 1 | 2 | 3 | 4 | 5;
  status: ParticipantStatus;
  updatedAt: number;
}

export type HelpRequestStatus = "requested" | "generating" | "delivered" | "resolved";

export interface HelpRequest {
  id: string;
  participantId: string;
  ownerUid: string;
  step: 2 | 3 | 4 | 5;
  status: HelpRequestStatus;
  question: string | null;
  createdAt: number;
}

export interface Cheer {
  id: string;
  participantId: string;
  text: string;
  sentAt: number;
}

export function dashboardPriority(status: ParticipantStatus): number {
  return { help_requested: 0, help_generating: 1, help_delivered: 2, writing: 3, completed: 4 }[status];
}

export function nextStep(step: 1 | 2 | 3 | 4 | 5): 2 | 3 | 4 | 5 | null {
  return step === 5 ? null : ((step + 1) as 2 | 3 | 4 | 5);
}

export function requestHelp(status: ParticipantStatus) {
  return status === "help_requested" || status === "help_generating"
    ? { accepted: false, nextStatus: status }
    : { accepted: true, nextStatus: "help_requested" as const };
}

export function sortParticipants(participants: Participant[]): Participant[] {
  return [...participants].sort(
    (left, right) => dashboardPriority(left.status) - dashboardPriority(right.status) || right.updatedAt - left.updatedAt
  );
}
```

`package.json`에는 `dev`, `build`, `test` 스크립트와 React·Vite·Vitest·Testing Library 의존성을 넣는다. 전역 CSS에는 Paperlogy `@font-face`, 콘페스타 색상 토큰, `prefers-reduced-motion` 처리를 넣는다.

- [ ] **Step 4: 테스트와 타입 검사를 통과시킨다.**

Run: `npm test -- src/lib/activity.test.ts && npm run build`

Expected: 모두 성공한다.

### Task 2: Firebase 연결과 세션 저장소를 만든다

**Files:**
- Create: `src/lib/firebase.ts`, `src/lib/activityStore.ts`, `src/lib/nickname.ts`
- Create: `src/lib/nickname.test.ts`, `src/lib/activityStore.test.ts`
- Create: `.env.example`

- [ ] **Step 1: 랜덤 닉네임과 대시보드 정렬 테스트를 작성한다.**

```ts
it("랜덤 닉네임은 두 낱말과 두 자리 숫자로 만든다", () => {
  expect(createNickname(() => 0)).toBe("별빛탐험가 01");
});

it("도움 요청 카드가 작성 중 카드보다 앞에 온다", () => {
  expect(sortParticipants([writing, helping]).map(({ id }) => id)).toEqual(["helping", "writing"]);
});
```

- [ ] **Step 2: Firebase 초기화와 익명 인증을 구현한다.**

```ts
export async function ensureStudentIdentity(): Promise<string> {
  const auth = getAuth(getFirebaseApp());
  const credential = auth.currentUser ?? (await signInAnonymously(auth)).user;
  return credential.uid;
}

export function getDb() {
  return initializeFirestore(getFirebaseApp(), { experimentalAutoDetectLongPolling: true });
}
```

`activityStore.ts`에는 `sessions/{sessionId}/participants/{participantId}`, `helpRequests`, `cheers` 문서의 생성·갱신·구독 함수를 둔다. 학생의 문장은 400ms 디바운스로 저장하고, 도움 요청은 Firestore transaction에서 진행 중 요청이 없을 때만 만든다.

- [ ] **Step 3: Firebase 프로젝트를 만든 뒤 환경변수를 채운다.**

```env
UPSTAGE_API_KEY=
UPSTAGE_MODEL=solar-pro3-260323
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

Firebase Console에서 Anonymous와 Email/Password 로그인을 켠다. 교사 계정을 만든 뒤 Firestore의 `teachers/{uid}` 문서에 `{ active: true }`를 저장한다. 이 단계는 사용자가 Firebase 프로젝트를 만든 뒤 실행한다.

- [ ] **Step 4: 순수 저장소 로직 테스트와 빌드를 실행한다.**

Run: `npm test -- src/lib/nickname.test.ts src/lib/activityStore.test.ts && npm run build`

Expected: Firebase 환경값이 없는 경우에도 순수 함수 테스트와 프로덕션 빌드는 성공한다.

### Task 3: Solar Pro 3 도움 질문·응원 API를 만든다

**Files:**
- Create: `server/firebaseAdmin.mjs`, `server/solar.mjs`, `server/index.mjs`
- Create: `server/solar.test.mjs`, `server/index.test.mjs`

- [ ] **Step 1: AI가 답을 대신하지 않는지 검증하는 테스트를 작성한다.**

```js
it("도움 프롬프트는 질문 하나만 요구한다", () => {
  const prompt = helpPrompt({ step: 3, sentences: ["나는 버스를 탔다."] });
  expect(prompt).toContain("질문 하나만");
  expect(prompt).toContain("문장을 대신 써 주지 않는다");
});

it("응원 초안은 짧고 교사 검토용이다", () => {
  expect(cheerPrompt({ nickname: "별빛탐험가 01", step: 3 })).toContain("교사가 검토할 짧은 응원");
});
```

- [ ] **Step 2: Firebase ID 토큰 검증과 Solar API 클라이언트를 구현한다.**

```js
export async function solarChat(messages) {
  const response = await fetch("https://api.upstage.ai/v1/solar/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.UPSTAGE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: process.env.UPSTAGE_MODEL || "solar-pro3-260323", messages, temperature: 0.4 })
  });
  if (!response.ok) throw new Error(`Solar 요청 실패: ${response.status}`);
  return (await response.json()).choices[0].message.content.trim();
}
```

`POST /api/help`은 학생 본인 토큰과 단계·문장 배열을 확인하고, 20초 안에 질문 하나를 반환한다. `POST /api/cheer-draft`는 교사 토큰과 교사 권한을 확인한 뒤 응원 초안을 반환한다. 두 API 모두 입력 길이를 제한하고, 전화번호·이메일 패턴은 API 요청 전에 거절한다.

- [ ] **Step 3: 지연·실패 때 쓸 단계별 안전 질문을 구현한다.**

```js
export const fallbackQuestions = {
  2: "그 길에서 가장 먼저 눈에 들어온 것은 무엇이었나요?",
  3: "그때 들린 소리나 느껴진 날씨를 떠올려 볼까요?",
  4: "함께 있던 사람이나 스쳐 간 사람은 있었나요?",
  5: "그 길을 지나며 마지막으로 어떤 생각이 들었나요?"
};
```

- [ ] **Step 4: API 테스트를 실행한다.**

Run: `npm test -- server/solar.test.mjs server/index.test.mjs`

Expected: 인증 없는 요청은 401, 잘못된 본문은 400, Solar 실패는 fallback 질문으로 성공 응답한다.

### Task 4: 학생의 다섯 문장 활동 화면을 만든다

**Files:**
- Create: `src/components/StudentActivity.tsx`, `src/components/CharacterGuide.tsx`, `src/components/StudentActivity.test.tsx`
- Modify: `src/App.tsx`, `src/styles.css`
- Reuse: `/Volumes/exDisk/vibecoding project/17. AI_MC/assets/characters/preview-frames/pose_think.png`, `/Volumes/exDisk/vibecoding project/17. AI_MC/public/fonts/Paperlogy-*.woff2`, `/Volumes/exDisk/vibecoding project/17. AI_MC/assets/site/confesta-ice-cream-cone.png`

- [ ] **Step 1: 학생 활동 화면의 실패 테스트를 작성한다.**

```tsx
render(<StudentActivity sessionId="demo" />);
expect(screen.getByRole("heading", { name: "여기에 어떻게 오셨어요?" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "도움!" })).toBeInTheDocument();
expect(screen.getByText("1 / 5")).toBeInTheDocument();
```

- [ ] **Step 2: 한 문장씩 열리는 입력 흐름을 구현한다.**

학생은 첫 문장을 저장해야 다음 입력칸을 쓸 수 있다. 각 입력칸에는 400자 제한, 자동 저장 상태, 현재 단계 표시를 둔다. 다섯 번째 문장을 저장하면 1문장과 5문장을 나란히 보여 주고 “내 표현이 어떻게 달라졌는지 살펴보세요”라고 안내한다.

- [ ] **Step 3: 도움 말풍선과 교사 응원 말풍선을 구현한다.**

`Robot3D`는 `gesture: "idle" | "thinking" | "help" | "cheer" | "complete"`를 받고, 캐릭터와 분리된 상단 말풍선을 표시한다. 학생 문장에는 `color: #fff`, `-webkit-text-stroke: 0.65px #13091f`, `paint-order: stroke fill`을 적용한다.

- [ ] **Step 4: 학생 화면 테스트를 실행한다.**

Run: `npm test -- src/components/StudentActivity.test.tsx`

Expected: 한 단계씩 열림, 도움 버튼 중복 비활성화, 마지막 비교 화면이 통과한다.

### Task 5: 도움 요청을 앞에 두는 교사 대시보드를 만든다

**Files:**
- Create: `src/components/TeacherDashboard.tsx`, `src/components/TeacherDashboard.test.tsx`
- Modify: `src/App.tsx`, `src/styles.css`

- [ ] **Step 1: 카드 우선순위와 응원 버튼의 실패 테스트를 작성한다.**

```tsx
render(<TeacherDashboard sessionId="demo" participants={[writing, helping]} />);
expect(screen.getAllByTestId("participant-card")[0]).toHaveTextContent("별빛탐험가 01");
expect(screen.getByRole("button", { name: "캐릭터 응원 보내기" })).toBeEnabled();
```

- [ ] **Step 2: 실시간 카드와 도움 요청 대기열을 구현한다.**

카드는 `dashboardPriority`와 마지막 갱신 시각으로 정렬한다. 새 `help_requested` 상태는 즉시 첫 카드가 되고, 질문이 전달된 뒤 학생이 다음 문장을 저장하면 `writing`으로 내려간다. 상단 통계에는 참여·작성 중·도움 요청·완성 수를 표시한다.

- [ ] **Step 3: AI 응원 초안 검토·전송을 구현한다.**

교사가 도움 요청 카드를 열면 `/api/cheer-draft`가 보낸 초안을 보여 준다. `캐릭터 응원 보내기`는 `cheers` 문서를 만들고, 학생 화면 구독이 이를 말풍선으로 표시한다. 응원은 자동 전송하지 않는다.

- [ ] **Step 4: 대시보드 테스트를 실행한다.**

Run: `npm test -- src/components/TeacherDashboard.test.tsx`

Expected: 도움 요청 카드가 최상단에 오고, 전송 뒤 버튼이 `응원 전송됨`으로 바뀐다.

### Task 6: Firestore 규칙과 세션 정리를 적용한다

**Files:**
- Create: `firestore.rules`, `firestore.indexes.json`, `firebase.json`
- Create: `firestore.rules.test.mjs`
- Modify: `src/lib/activityStore.ts`, `src/components/TeacherDashboard.tsx`

- [ ] **Step 1: 규칙 시나리오를 테스트로 적는다.**

```js
it("익명 학생은 자신의 participant 문서만 고친다", async () => {
  await assertFails(updateDoc(otherStudentRef, { currentStep: 3 }));
});

it("등록된 교사는 같은 세션의 도움 요청과 응원을 읽고 쓴다", async () => {
  await assertSucceeds(setDoc(teacherCheerRef, cheer));
});
```

- [ ] **Step 2: Firestore 규칙과 인덱스를 구현한다.**

`teachers/{uid}`의 `active == true`를 교사 권한의 기준으로 삼는다. 학생은 `ownerUid == request.auth.uid`인 자기 participant 문서만 만들고 고친다. 학생은 자기 help request만 만들고 읽는다. 교사만 전체 participant·helpRequests·cheers를 읽고 세션을 초기화한다. 인덱스는 `status + updatedAt`, `ownerUid + updatedAt` 조합을 둔다.

- [ ] **Step 3: 세션 초기화를 구현한다.**

교사 전용 `resetSession(sessionId)`은 participants, helpRequests, cheers 하위 컬렉션을 400개 단위 batch로 지우고 새 `session` 문서를 만든다. 이전 sessionId를 QR 주소에서 더 이상 쓰지 않게 한다.

- [ ] **Step 4: Emulator에서 규칙 테스트를 실행한다.**

Run: `npx firebase-tools emulators:exec --only firestore "npm test -- firestore.rules.test.mjs"`

Expected: 다른 학생 문서 수정과 비교사 대시보드 접근은 실패하고, 자기 문서와 교사 작업은 성공한다.

### Task 7: 실제 수업 조건에서 검증한다

**Files:**
- Create: `scripts/load-session.mjs`, `docs/teacher-runbook.md`
- Modify: `README.md`

- [ ] **Step 1: 100명 동시 참여 시나리오를 만든다.**

`load-session.mjs`는 100개의 익명 학생 문서를 만들고, 40명이 동시에 `help_requested` 상태로 바뀌게 한다. 결과로 도움 요청 카드 수, 첫 카드 상태, 요청별 질문 상태를 출력한다.

- [ ] **Step 2: 수업 운영 안내를 작성한다.**

`docs/teacher-runbook.md`에는 교사 로그인, 세션 시작, QR 공유, 도움 요청 우선순위 확인, 응원 전송, 수업 종료·초기화 순서를 적는다. API 키나 Firebase 비밀값은 문서에 넣지 않는다.

- [ ] **Step 3: 전체 자동 검증을 실행한다.**

Run: `npm test && npm run build`

Expected: 단위·컴포넌트·서버·Firestore 규칙 테스트와 타입 검사·번들 생성이 모두 성공한다.

- [ ] **Step 4: 실제 표면에서 수동 점검한다.**

Run: `npm run dev`

학생 휴대폰에서 QR을 열어 문장 다섯 개를 쓰고, 다른 두 기기에서 동시에 도움을 누른다. 교사 대시보드에서 도움 요청 카드가 위로 올라오는지, AI 질문이 문장을 대신하지 않는지, 응원이 캐릭터 말풍선으로 도착하는지, 세션 초기화 뒤 기록이 사라지는지 확인한다.
