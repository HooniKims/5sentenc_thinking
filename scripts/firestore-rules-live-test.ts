import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, signInWithEmailAndPassword } from "firebase/auth";
import { collection, deleteDoc, doc, getDoc, getDocs, getFirestore, serverTimestamp, setDoc, setLogLevel, terminate } from "firebase/firestore";

declare const Bun: {
  readonly env: Readonly<Record<string, string | undefined>>;
};

setLogLevel("silent");

class FirestoreRulesLiveTestError extends Error {
  readonly detail: string;

  constructor(detail: string) {
    super(detail);
    this.name = "FirestoreRulesLiveTestError";
    this.detail = detail;
  }
}

interface CleanupFailure {
  readonly operation: string;
  readonly reason: unknown;
}

class FirestoreRulesCleanupError extends Error {
  readonly failures: readonly CleanupFailure[];

  constructor(failures: readonly CleanupFailure[]) {
    super(`Temporary Firestore rules data cleanup failed for: ${failures.map((failure) => failure.operation).join(", ")}.`);
    this.name = "FirestoreRulesCleanupError";
    this.failures = failures;
  }
}

function requiredEnvironment(name: string): string {
  const value = Bun.env[name];
  if (!value) {
    throw new FirestoreRulesLiveTestError(`${name} is required`);
  }
  return value;
}

function isPermissionDenied(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "permission-denied";
}

async function expectPermissionDenied(operation: () => Promise<unknown>, description: string): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (isPermissionDenied(error)) {
      return;
    }
    throw error;
  }

  throw new FirestoreRulesLiveTestError(`${description} was allowed`);
}

async function expectAllowed<T>(operation: () => Promise<T>, description: string): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isPermissionDenied(error)) {
      throw new FirestoreRulesLiveTestError(`${description} was denied`);
    }
    throw error;
  }
}

function cleanupFailure(operation: string, result: PromiseSettledResult<void>): readonly CleanupFailure[] {
  if (result.status === "fulfilled") {
    return [];
  }

  return [{ operation, reason: result.reason }];
}

const config = {
  apiKey: requiredEnvironment("VITE_FIREBASE_API_KEY"),
  authDomain: requiredEnvironment("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: requiredEnvironment("VITE_FIREBASE_PROJECT_ID"),
  storageBucket: requiredEnvironment("VITE_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: requiredEnvironment("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  appId: requiredEnvironment("VITE_FIREBASE_APP_ID")
};
const teacherApp = initializeApp(config, "rules-teacher");
const studentApp = initializeApp(config, "rules-student");
await signInWithEmailAndPassword(
  getAuth(teacherApp),
  requiredEnvironment("TEACHER_EMAIL"),
  requiredEnvironment("TEACHER_PASSWORD")
);
const student = (await signInAnonymously(getAuth(studentApp))).user;
const teacherDb = getFirestore(teacherApp);
const studentDb = getFirestore(studentApp);
const sessionId = `rules-probe-${crypto.randomUUID()}`;
const sessionRef = doc(teacherDb, "sessions", sessionId);
const participantRef = doc(studentDb, "sessions", sessionId, "participants", student.uid);
const squattedParticipantRef = doc(studentDb, "sessions", sessionId, "participants", "another-student");
const helpRequestRef = doc(studentDb, "sessions", sessionId, "helpRequests", `${student.uid}-1`);
const repeatedHelpRequestRef = doc(studentDb, "sessions", sessionId, "helpRequests", `${student.uid}-2`);
const cheerRef = doc(teacherDb, "sessions", sessionId, "cheers", `${student.uid}-temporary`);
const studentCheerRef = doc(studentDb, "sessions", sessionId, "cheers", `${student.uid}-temporary`);
const deletedParticipantRef = doc(teacherDb, "sessions", sessionId, "deletedParticipants", student.uid);

async function cleanupTemporarySession(): Promise<readonly CleanupFailure[]> {
  const [participantCleanup, squattedParticipantCleanup, helpRequestCleanup, repeatedHelpRequestCleanup, cheerCleanup, deletedParticipantCleanup, sessionCleanup] = await Promise.allSettled([
    expectAllowed(
      () => deleteDoc(doc(teacherDb, "sessions", sessionId, "participants", student.uid)),
      "진행자의 임시 participant 정리"
    ),
    expectAllowed(
      () => deleteDoc(doc(teacherDb, "sessions", sessionId, "helpRequests", `${student.uid}-1`)),
      "진행자의 임시 도움 요청 정리"
    ),
    expectAllowed(
      () => deleteDoc(doc(teacherDb, "sessions", sessionId, "helpRequests", `${student.uid}-2`)),
      "진행자의 추가 임시 도움 요청 정리"
    ),
    expectAllowed(
      () => deleteDoc(doc(teacherDb, "sessions", sessionId, "participants", "another-student")),
      "진행자의 임시 participant 경로 정리"
    ),
    expectAllowed(
      () => deleteDoc(doc(teacherDb, "sessions", sessionId, "cheers", `${student.uid}-temporary`)),
      "진행자의 임시 응원 정리"
    ),
    expectAllowed(() => deleteDoc(deletedParticipantRef), "진행자의 임시 삭제 표시 정리"),
    expectAllowed(() => deleteDoc(sessionRef), "진행자의 임시 세션 정리")
  ]);
  const [sessionVerification] = await Promise.allSettled([
    expectAllowed(async () => {
      const deletedSession = await getDoc(sessionRef);
      if (deletedSession.exists()) {
        throw new FirestoreRulesLiveTestError("임시 세션 문서가 정리되지 않았습니다");
      }
    }, "진행자의 임시 세션 정리 후 조회")
  ]);

  return [
    ...cleanupFailure("participant document", participantCleanup),
    ...cleanupFailure("squatted participant document", squattedParticipantCleanup),
    ...cleanupFailure("help request document", helpRequestCleanup),
    ...cleanupFailure("repeated help request document", repeatedHelpRequestCleanup),
    ...cleanupFailure("cheer document", cheerCleanup),
    ...cleanupFailure("deleted participant document", deletedParticipantCleanup),
    ...cleanupFailure("session document", sessionCleanup),
    ...cleanupFailure("session cleanup verification", sessionVerification)
  ];
}

async function terminateFirestoreClients(): Promise<readonly CleanupFailure[]> {
  const [teacherTermination, studentTermination] = await Promise.allSettled([
    terminate(teacherDb),
    terminate(studentDb)
  ]);

  return [
    ...cleanupFailure("teacher Firestore termination", teacherTermination),
    ...cleanupFailure("student Firestore termination", studentTermination)
  ];
}

let testFailure: unknown = null;

try {
  await expectAllowed(
    () => setDoc(sessionRef, { state: "active", purpose: "temporary Firestore rules probe" }),
    "진행자의 임시 세션 생성"
  );
  await expectAllowed(
    () => setDoc(participantRef, {
      ownerUid: student.uid,
      nickname: "규칙확인",
      sentences: ["규칙을 확인해요."],
      currentStep: 1,
      status: "writing",
      updatedAt: serverTimestamp()
    }),
    "익명 학생의 자기 participant 생성"
  );
  await expectAllowed(
    () => setDoc(helpRequestRef, {
      ownerUid: student.uid,
      step: 1,
      status: "requested",
      createdAt: serverTimestamp()
    }),
    "익명 학생의 자기 도움 요청 생성"
  );
  await expectPermissionDenied(
    () => setDoc(participantRef, {
      ownerUid: student.uid,
      nickname: "규칙확인",
      sentences: ["010-1234-5678"],
      currentStep: 1,
      status: "writing",
      updatedAt: serverTimestamp()
    }),
    "익명 학생의 전화번호 문장 저장"
  );
  await expectPermissionDenied(
    () => setDoc(participantRef, {
      ownerUid: student.uid,
      nickname: "규칙확인",
      sentences: ["제 이름은 김민수예요."],
      currentStep: 1,
      status: "writing",
      updatedAt: serverTimestamp()
    }),
    "익명 학생의 이름 문장 저장"
  );
  await expectPermissionDenied(
    () => setDoc(participantRef, {
      ownerUid: student.uid,
      nickname: "홍길동",
      sentences: ["버스를 타고 왔어요."],
      currentStep: 1,
      status: "writing",
      updatedAt: serverTimestamp()
    }),
    "익명 학생의 이름 닉네임 저장"
  );
  await expectPermissionDenied(
    () => setDoc(squattedParticipantRef, {
      ownerUid: student.uid,
      nickname: "규칙확인",
      sentences: ["경로를 빌려 확인해요."],
      currentStep: 1,
      status: "writing",
      updatedAt: serverTimestamp()
    }),
    "익명 학생의 다른 사람 participant 경로 생성"
  );
  await expectAllowed(
    () => setDoc(cheerRef, {
      ownerUid: student.uid,
      message: "temporary rules probe"
    }),
    "진행자의 임시 응원 생성"
  );

  await expectPermissionDenied(() => deleteDoc(participantRef), "익명 학생의 자기 participant 삭제");
  await expectPermissionDenied(() => deleteDoc(helpRequestRef), "익명 학생의 자기 도움 요청 삭제");
  await expectPermissionDenied(() => deleteDoc(studentCheerRef), "익명 학생의 임시 응원 삭제");

  await expectAllowed(
    () => setDoc(deletedParticipantRef, { ownerUid: student.uid, deletedAt: serverTimestamp() }),
    "진행자의 임시 삭제 표시 생성"
  );
  await expectPermissionDenied(
    () => setDoc(repeatedHelpRequestRef, {
      ownerUid: student.uid,
      step: 1,
      status: "requested",
      createdAt: serverTimestamp()
    }),
    "삭제 표시 뒤 익명 학생의 도움 요청 재생성"
  );

  await expectAllowed(
    () => setDoc(sessionRef, { state: "closed" }, { merge: true }),
    "진행자의 임시 세션 닫기"
  );
  await expectPermissionDenied(
    () => setDoc(participantRef, {
      ownerUid: student.uid,
      nickname: "규칙확인",
      sentences: ["닫힌 수업에는 남지 않아요."],
      currentStep: 1,
      status: "writing",
      updatedAt: serverTimestamp()
    }),
    "닫힌 세션에 익명 학생 기록 다시 쓰기"
  );

  await expectAllowed(
    () => deleteDoc(doc(teacherDb, "sessions", sessionId, "participants", student.uid)),
    "진행자의 participant 삭제"
  );
  await expectAllowed(
    () => deleteDoc(doc(teacherDb, "sessions", sessionId, "helpRequests", `${student.uid}-1`)),
    "진행자의 도움 요청 삭제"
  );
  await expectAllowed(
    () => deleteDoc(doc(teacherDb, "sessions", sessionId, "cheers", `${student.uid}-temporary`)),
    "진행자의 응원 삭제"
  );

  const [participants, helpRequests, cheers] = await Promise.all([
    expectAllowed(
      () => getDocs(collection(teacherDb, "sessions", sessionId, "participants")),
      "진행자의 participant 삭제 후 조회"
    ),
    expectAllowed(
      () => getDocs(collection(teacherDb, "sessions", sessionId, "helpRequests")),
      "진행자의 도움 요청 삭제 후 조회"
    ),
    expectAllowed(
      () => getDocs(collection(teacherDb, "sessions", sessionId, "cheers")),
      "진행자의 응원 삭제 후 조회"
    )
  ]);
  if (participants.size !== 0 || helpRequests.size !== 0 || cheers.size !== 0) {
    throw new FirestoreRulesLiveTestError("임시 규칙 검증 데이터가 모두 삭제되지 않았습니다");
  }
} catch (error) {
  testFailure = error;
}

const cleanupFailures = await cleanupTemporarySession();
const terminationFailures = await terminateFirestoreClients();
const failures = [...cleanupFailures, ...terminationFailures];
if (failures.length > 0) {
  throw new FirestoreRulesCleanupError(failures);
}
if (testFailure) {
  throw testFailure;
}

console.log("Firestore 규칙 실환경 검증 통과");
