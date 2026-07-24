import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { collection, getFirestore, onSnapshot, setLogLevel, terminate } from "firebase/firestore";

declare const Bun: {
  readonly env: Readonly<Record<string, string | undefined>>;
};

setLogLevel("silent");

// ---------- 설정 ----------

const STUDENT_COUNT = Number(Bun.env["LOAD_TEST_STUDENTS"] ?? "100");
const JOIN_WINDOW_MS = Number(Bun.env["LOAD_TEST_JOIN_WINDOW_MS"] ?? "10000");
const HELP_ENDPOINT = Bun.env["LOAD_TEST_HELP_ENDPOINT"] ?? "https://5sentenc-thinking.vercel.app/api/help";
const SKIP_HELP_ENDPOINT = Bun.env["LOAD_TEST_SKIP_HELP"] === "1";
const HELP_REQUEST_RATIO = 0.3;
const DELETE_BATCH_SIZE = 400;

function requiredEnvironment(name: string): string {
  const value = Bun.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

const apiKey = requiredEnvironment("VITE_FIREBASE_API_KEY");
const projectId = requiredEnvironment("VITE_FIREBASE_PROJECT_ID");
const firestoreBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

// ---------- 계측 ----------

interface OperationSample {
  readonly op: string;
  readonly ms: number;
  readonly ok: boolean;
  readonly code: number;
}

const samples: OperationSample[] = [];
const helpStatusCounts = new Map<number, number>();

function record(op: string, ms: number, ok: boolean, code: number): void {
  samples.push({ op, ms, ok, code });
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(minimum: number, maximum: number): number {
  return minimum + Math.random() * (maximum - minimum);
}

// ---------- Firebase Auth REST ----------

interface AuthTokens {
  readonly idToken: string;
  readonly uid: string;
}

async function signUpAnonymously(): Promise<AuthTokens> {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const startedAt = performance.now();
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnSecureToken: true })
    });
    const elapsed = performance.now() - startedAt;
    if (response.ok) {
      record("auth:anonymous", elapsed, true, response.status);
      const body = (await response.json()) as { idToken: string; localId: string };
      return { idToken: body.idToken, uid: body.localId };
    }
    record("auth:anonymous", elapsed, false, response.status);
    await response.text();
    await sleep(500 * attempt + Math.random() * 500);
  }
  throw new Error("anonymous sign-up failed after retries");
}

async function signInTeacher(email: string, password: string): Promise<AuthTokens> {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  if (!response.ok) {
    throw new Error(`teacher sign-in failed: ${response.status} ${await response.text()}`);
  }
  const body = (await response.json()) as { idToken: string; localId: string };
  return { idToken: body.idToken, uid: body.localId };
}

// ---------- Firestore REST ----------

type FirestoreValue =
  | { readonly stringValue: string }
  | { readonly integerValue: string }
  | { readonly arrayValue: { readonly values?: readonly FirestoreValue[] } };

interface FirestoreWrite {
  readonly update?: { readonly name: string; readonly fields: Readonly<Record<string, FirestoreValue>> };
  readonly updateTransforms?: readonly { readonly fieldPath: string; readonly setToServerValue: "REQUEST_TIME" }[];
  readonly delete?: string;
}

async function commit(op: string, idToken: string, writes: readonly FirestoreWrite[]): Promise<boolean> {
  const startedAt = performance.now();
  let status = 0;
  try {
    const response = await fetch(`${firestoreBase}:commit`, {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ writes })
    });
    status = response.status;
    await response.text();
    record(op, performance.now() - startedAt, response.ok, status);
    return response.ok;
  } catch {
    record(op, performance.now() - startedAt, false, status);
    return false;
  }
}

const documentRoot = `projects/${projectId}/databases/(default)/documents`;

function documentName(...segments: readonly string[]): string {
  return `${documentRoot}/${segments.join("/")}`;
}

function participantWrite(sessionId: string, uid: string, nickname: string, sentences: readonly string[], step: number, status: string): FirestoreWrite {
  return {
    update: {
      name: documentName("sessions", sessionId, "participants", uid),
      fields: {
        ownerUid: { stringValue: uid },
        nickname: { stringValue: nickname },
        sentences: sentences.length > 0 ? { arrayValue: { values: sentences.map((sentence) => ({ stringValue: sentence })) } } : { arrayValue: {} },
        currentStep: { integerValue: String(step) },
        status: { stringValue: status }
      }
    },
    updateTransforms: [{ fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" }]
  };
}

function helpRequestWrite(sessionId: string, uid: string, step: number): FirestoreWrite {
  return {
    update: {
      name: documentName("sessions", sessionId, "helpRequests", `${uid}-${step}-${crypto.randomUUID()}`),
      fields: {
        ownerUid: { stringValue: uid },
        step: { integerValue: String(step) },
        status: { stringValue: "requested" }
      }
    },
    updateTransforms: [{ fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" }]
  };
}

async function listDocumentNames(idToken: string, sessionId: string, collectionId: string): Promise<readonly string[]> {
  const names: string[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${firestoreBase}/sessions/${sessionId}/${collectionId}`);
    url.searchParams.set("pageSize", "300");
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }
    const response = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
    if (!response.ok) {
      throw new Error(`list ${collectionId} failed: ${response.status} ${await response.text()}`);
    }
    const body = (await response.json()) as { documents?: readonly { name: string }[]; nextPageToken?: string };
    for (const document of body.documents ?? []) {
      names.push(document.name);
    }
    pageToken = body.nextPageToken;
  } while (pageToken);
  return names;
}

// ---------- 학생 시나리오 ----------

const SENTENCES = [
  "버스 창밖으로 노을이 번지고 있었어요.",
  "정류장에 내리자 바람이 살짝 차가웠어요.",
  "골목을 걸으며 오늘 발표할 내용을 떠올렸어요.",
  "문 앞에서 크게 숨을 한 번 쉬었어요.",
  "자리에 앉으니 마음이 조금씩 차분해졌어요."
] as const;

interface StudentResult {
  readonly index: number;
  readonly joined: boolean;
  readonly completed: boolean;
  readonly helpFirestoreOk: boolean | null;
  readonly helpEndpointStatus: number | null;
}

async function callHelpEndpoint(idToken: string, step: number): Promise<number> {
  const startedAt = performance.now();
  try {
    const response = await fetch(HELP_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        step,
        confirmedSentenceCount: step - 1,
        draftLength: "short",
        detailKinds: ["scene"],
        repeatsKnownWords: false
      }),
      signal: AbortSignal.timeout(20_000)
    });
    await response.text();
    record("api:help", performance.now() - startedAt, response.ok, response.status);
    helpStatusCounts.set(response.status, (helpStatusCounts.get(response.status) ?? 0) + 1);
    return response.status;
  } catch {
    record("api:help", performance.now() - startedAt, false, 0);
    helpStatusCounts.set(0, (helpStatusCounts.get(0) ?? 0) + 1);
    return 0;
  }
}

async function runStudent(index: number, sessionId: string): Promise<StudentResult> {
  await sleep(Math.random() * JOIN_WINDOW_MS);

  let tokens: AuthTokens;
  try {
    tokens = await signUpAnonymously();
  } catch {
    return { index, joined: false, completed: false, helpFirestoreOk: null, helpEndpointStatus: null };
  }

  const nickname = `무지개탐험가${index + 1}`;
  const joined = await commit(`fs:join`, tokens.idToken, [participantWrite(sessionId, tokens.uid, nickname, [], 1, "writing")]);
  if (!joined) {
    return { index, joined: false, completed: false, helpFirestoreOk: null, helpEndpointStatus: null };
  }

  const wantsHelp = Math.random() < HELP_REQUEST_RATIO;
  const helpStep = 2 + Math.floor(Math.random() * 3);
  let helpFirestoreOk: boolean | null = null;
  let helpEndpointStatus: number | null = null;

  let allSavesOk = true;
  for (let step = 1; step <= 5; step += 1) {
    await sleep(jitter(500, 2000));
    const sentences = SENTENCES.slice(0, step);
    const ok = await commit(
      "fs:saveSentence",
      tokens.idToken,
      [participantWrite(sessionId, tokens.uid, nickname, sentences, Math.min(step + 1, 5), "writing")]
    );
    allSavesOk = allSavesOk && ok;

    if (wantsHelp && step === helpStep) {
      helpFirestoreOk = await commit("fs:helpRequest", tokens.idToken, [
        participantWrite(sessionId, tokens.uid, nickname, sentences, step, "help_requested"),
        helpRequestWrite(sessionId, tokens.uid, step)
      ]);
      if (!SKIP_HELP_ENDPOINT) {
        helpEndpointStatus = await callHelpEndpoint(tokens.idToken, step);
      }
    }
  }

  await sleep(jitter(300, 1200));
  const completed = await commit(
    "fs:complete",
    tokens.idToken,
    [participantWrite(sessionId, tokens.uid, nickname, [...SENTENCES], 5, "completed")]
  );

  return { index, joined, completed: completed && allSavesOk, helpFirestoreOk, helpEndpointStatus };
}

// ---------- 교사 대시보드 리스너 ----------

interface DashboardObservation {
  snapshotCount: number;
  maximumParticipants: number;
  timeToAllJoinedMs: number | null;
  timeToAllCompletedMs: number | null;
  listenerError: string | null;
}

// ---------- 메인 ----------

const teacherEmail = requiredEnvironment("TEACHER_EMAIL");
const teacherPassword = requiredEnvironment("TEACHER_PASSWORD");

console.log(`부하 테스트 시작: 학생 ${STUDENT_COUNT}명, 접속 분산 ${JOIN_WINDOW_MS}ms, 도움 비율 ${HELP_REQUEST_RATIO * 100}%`);
console.log(`/api/help 대상: ${SKIP_HELP_ENDPOINT ? "생략" : HELP_ENDPOINT}`);

const teacher = await signInTeacher(teacherEmail, teacherPassword);
const sessionId = `session-loadtest-${crypto.randomUUID()}`;

const sessionCreated = await commit("fs:createSession", teacher.idToken, [
  {
    update: {
      name: documentName("sessions", sessionId),
      fields: { state: { stringValue: "active" } }
    },
    updateTransforms: [{ fieldPath: "openedAt", setToServerValue: "REQUEST_TIME" }]
  }
]);
if (!sessionCreated) {
  throw new Error("테스트 세션 생성에 실패했습니다.");
}
console.log(`테스트 세션 생성: ${sessionId}`);

const dashboardApp = initializeApp(
  {
    apiKey,
    authDomain: requiredEnvironment("VITE_FIREBASE_AUTH_DOMAIN"),
    projectId,
    storageBucket: requiredEnvironment("VITE_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: requiredEnvironment("VITE_FIREBASE_MESSAGING_SENDER_ID"),
    appId: requiredEnvironment("VITE_FIREBASE_APP_ID")
  },
  "load-test-dashboard"
);
await signInWithEmailAndPassword(getAuth(dashboardApp), teacherEmail, teacherPassword);
const dashboardDb = getFirestore(dashboardApp);

const observation: DashboardObservation = {
  snapshotCount: 0,
  maximumParticipants: 0,
  timeToAllJoinedMs: null,
  timeToAllCompletedMs: null,
  listenerError: null
};
const dashboardStartedAt = performance.now();
const unsubscribe = onSnapshot(
  collection(dashboardDb, "sessions", sessionId, "participants"),
  (snapshot) => {
    observation.snapshotCount += 1;
    observation.maximumParticipants = Math.max(observation.maximumParticipants, snapshot.size);
    const completedCount = snapshot.docs.filter((participant) => participant.data()["status"] === "completed").length;
    if (snapshot.size >= STUDENT_COUNT && observation.timeToAllJoinedMs === null) {
      observation.timeToAllJoinedMs = performance.now() - dashboardStartedAt;
    }
    if (completedCount >= STUDENT_COUNT && observation.timeToAllCompletedMs === null) {
      observation.timeToAllCompletedMs = performance.now() - dashboardStartedAt;
    }
  },
  (error) => {
    observation.listenerError = error.message;
  }
);

const results = await Promise.all(
  Array.from({ length: STUDENT_COUNT }, (_, index) => runStudent(index, sessionId))
);

// 마지막 스냅숏 반영 대기
for (let waited = 0; waited < 15_000 && observation.timeToAllCompletedMs === null; waited += 500) {
  await sleep(500);
}
unsubscribe();
await terminate(dashboardDb);

// ---------- 정리 ----------

console.log("테스트 데이터 정리 중...");
let deletedTotal = 0;
for (const collectionId of ["participants", "helpRequests", "cheers", "deletedParticipants"]) {
  const names = await listDocumentNames(teacher.idToken, sessionId, collectionId);
  for (let start = 0; start < names.length; start += DELETE_BATCH_SIZE) {
    const batch = names.slice(start, start + DELETE_BATCH_SIZE).map((name) => ({ delete: name }));
    const ok = await commit("fs:cleanupDelete", teacher.idToken, batch);
    if (!ok) {
      throw new Error(`정리 실패: ${collectionId}`);
    }
    deletedTotal += batch.length;
  }
}
const sessionDeleted = await commit("fs:cleanupDelete", teacher.idToken, [
  { delete: documentName("sessions", sessionId) }
]);
if (!sessionDeleted) {
  throw new Error("세션 문서 삭제 실패");
}
const remaining = await listDocumentNames(teacher.idToken, sessionId, "participants");
console.log(`정리 완료: 하위 문서 ${deletedTotal}개 + 세션 1개 삭제, 잔여 participants ${remaining.length}개`);

// ---------- 리포트 ----------

const joinedCount = results.filter((result) => result.joined).length;
const completedCount = results.filter((result) => result.completed).length;
const helpFirestoreAttempts = results.filter((result) => result.helpFirestoreOk !== null);
const helpFirestoreOkCount = helpFirestoreAttempts.filter((result) => result.helpFirestoreOk === true).length;

console.log("\n===== 결과 요약 =====");
console.log(`참여 성공: ${joinedCount}/${STUDENT_COUNT}`);
console.log(`5문장 완료: ${completedCount}/${STUDENT_COUNT}`);
console.log(`도움 요청(Firestore): ${helpFirestoreOkCount}/${helpFirestoreAttempts.length} 성공`);

const operations = [...new Set(samples.map((sample) => sample.op))].sort();
console.log("\n작업별 지연(ms):");
for (const op of operations) {
  const opSamples = samples.filter((sample) => sample.op === op);
  const okSamples = opSamples.filter((sample) => sample.ok);
  const failures = opSamples.length - okSamples.length;
  const sorted = okSamples.map((sample) => sample.ms).sort((left, right) => left - right);
  const p50 = percentile(sorted, 50).toFixed(0);
  const p95 = percentile(sorted, 95).toFixed(0);
  const max = (sorted[sorted.length - 1] ?? 0).toFixed(0);
  console.log(`  ${op.padEnd(18)} n=${String(opSamples.length).padStart(4)} 실패=${String(failures).padStart(3)} p50=${p50} p95=${p95} max=${max}`);
  if (failures > 0) {
    const codes = new Map<number, number>();
    for (const sample of opSamples.filter((entry) => !entry.ok)) {
      codes.set(sample.code, (codes.get(sample.code) ?? 0) + 1);
    }
    console.log(`    실패 코드: ${[...codes.entries()].map(([code, count]) => `${code}×${count}`).join(", ")}`);
  }
}

if (!SKIP_HELP_ENDPOINT) {
  console.log("\n/api/help 응답 코드 분포:");
  for (const [code, count] of [...helpStatusCounts.entries()].sort((left, right) => left[0] - right[0])) {
    console.log(`  ${code === 0 ? "네트워크 오류/타임아웃" : code}: ${count}`);
  }
}

console.log("\n교사 대시보드(onSnapshot):");
console.log(`  스냅숏 수신 횟수: ${observation.snapshotCount}`);
console.log(`  최대 동시 참여자: ${observation.maximumParticipants}`);
console.log(`  전원 참여 감지: ${observation.timeToAllJoinedMs === null ? "미도달" : `${(observation.timeToAllJoinedMs / 1000).toFixed(1)}s`}`);
console.log(`  전원 완료 감지: ${observation.timeToAllCompletedMs === null ? "미도달" : `${(observation.timeToAllCompletedMs / 1000).toFixed(1)}s`}`);
if (observation.listenerError) {
  console.log(`  리스너 오류: ${observation.listenerError}`);
}

const firestoreFailures = samples.filter((sample) => sample.op.startsWith("fs:") && !sample.ok && sample.op !== "fs:cleanupDelete").length;
if (joinedCount === STUDENT_COUNT && completedCount === STUDENT_COUNT && firestoreFailures === 0) {
  console.log("\n판정: 통과 — 전원 참여·완료, Firestore 쓰기 실패 없음");
} else {
  console.log(`\n판정: 확인 필요 — 참여 ${joinedCount}, 완료 ${completedCount}, Firestore 실패 ${firestoreFailures}`);
  process.exitCode = 1;
}
