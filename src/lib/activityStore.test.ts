import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClassSession, SessionParticipant } from "./activityStore";

interface MockDocumentReference {
  readonly path: string;
}

interface MockQuerySnapshot {
  readonly docs: readonly { readonly ref: MockDocumentReference }[];
}

interface MockDocumentSnapshot {
  exists(): boolean;
  data(): unknown;
}

interface MockWhereConstraint {
  readonly field: string;
  readonly operator: string;
  readonly value: unknown;
}

interface MockCollectionReference {
  readonly path: string;
}

class MockFirestoreSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MockFirestoreSetupError";
  }
}

const firestore = vi.hoisted(() => {
  const responses: MockQuerySnapshot[] = [];
  const collectionPaths: string[] = [];
  const queryConstraints: MockWhereConstraint[] = [];
  const committedBatches: MockDocumentReference[][] = [];
  const deletedDocuments: MockDocumentReference[] = [];
  const setDocCalls: unknown[][] = [];
  const commitOutcomes: (Error | null)[] = [];
  let responseIndex = 0;

  return {
    reset(nextResponses: readonly MockQuerySnapshot[], nextCommitOutcomes: readonly (Error | null)[] = []): void {
      responses.splice(0, responses.length, ...nextResponses);
      collectionPaths.splice(0);
      queryConstraints.splice(0);
      committedBatches.splice(0);
      deletedDocuments.splice(0);
      setDocCalls.splice(0);
      commitOutcomes.splice(0, commitOutcomes.length, ...nextCommitOutcomes);
      responseIndex = 0;
    },
    collection(_database: unknown, ...segments: string[]): MockCollectionReference {
      const path = segments.join("/");
      collectionPaths.push(path);
      return { path };
    },
    doc(_database: unknown, ...segments: string[]): MockDocumentReference {
      return { path: segments.join("/") };
    },
    where(field: string, operator: string, value: unknown): MockWhereConstraint {
      return { field, operator, value };
    },
    query(collection: MockCollectionReference, constraint: MockWhereConstraint): MockCollectionReference {
      queryConstraints.push(constraint);
      return collection;
    },
    async getDocs(_source: MockCollectionReference): Promise<MockQuerySnapshot> {
      const response = responses[responseIndex];
      responseIndex += 1;
      if (!response) {
        throw new MockFirestoreSetupError("A Firestore query did not have a configured response.");
      }
      return response;
    },
    async getDoc(_reference: MockDocumentReference): Promise<MockDocumentSnapshot> {
      return { exists: () => false, data: () => undefined };
    },
    async setDoc(...arguments_: readonly unknown[]): Promise<void> {
      setDocCalls.push([...arguments_]);
    },
    async deleteDoc(reference: MockDocumentReference): Promise<void> {
      deletedDocuments.push(reference);
    },
    serverTimestamp(): string {
      return "server-timestamp";
    },
    writeBatch(_database: unknown): { readonly delete: (reference: MockDocumentReference) => void; readonly commit: () => Promise<void> } {
      const selected: MockDocumentReference[] = [];
      return {
        delete(reference: MockDocumentReference): void {
          selected.push(reference);
        },
        async commit(): Promise<void> {
          committedBatches.push([...selected]);
          const outcome = commitOutcomes.shift();
          if (outcome) {
            throw outcome;
          }
        }
      };
    },
    collectionPaths,
    queryConstraints,
    committedBatches,
    deletedDocuments,
    setDocCalls
  };
});

vi.mock("./firebase", () => ({ db: { name: "activity-store-test" } }));
vi.mock("firebase/firestore", () => firestore);

const {
  createSession,
  InvalidDeleteBatchMaximumError,
  UnsafeStudentTextError,
  deleteArchivedSession,
  deleteParticipantHistory,
  deleteSessionHistory,
  saveParticipant,
  splitIntoDeleteBatches
} = await import("./activityStore");

function snapshot(paths: readonly string[]): MockQuerySnapshot {
  return {
    docs: paths.map((path) => ({ ref: { path } }))
  };
}

function participant(): SessionParticipant {
  return {
    id: "participant-document-id",
    ownerUid: "owner-uid",
    nickname: "규칙확인",
    sentences: ["첫 문장"],
    currentStep: 1,
    status: "writing",
    updatedAtMs: 0
  };
}

function helpRequestPaths(count: number): readonly string[] {
  return Array.from(
    { length: count },
    (_, index) => `sessions/session-1/helpRequests/request-${index + 1}`
  );
}

beforeEach(() => {
  firestore.reset([]);
});

describe("새 수업 열기", () => {
  it("새 수업에는 추측하기 어려운 id와 활성 상태를 저장한다", async () => {
    // Given: 새로운 수업을 시작할 운영자
    const randomUuid = vi.spyOn(crypto, "randomUUID").mockReturnValue("53d41958-f6b5-4dd6-a08d-89e833a6b3d6");

    // When: 새 수업을 열면
    const sessionId = await createSession();

    // Then: 학생 기록과 분리된 활성 수업 문서가 만들어진다
    expect(sessionId).toBe("session-53d41958-f6b5-4dd6-a08d-89e833a6b3d6");
    expect(firestore.setDocCalls).toEqual([
      [
        { path: "sessions/session-53d41958-f6b5-4dd6-a08d-89e833a6b3d6" },
        { state: "active", openedAt: "server-timestamp" }
      ]
    ]);
    randomUuid.mockRestore();
  });
});

describe("삭제 배치 분할", () => {
  it("801개 항목을 400개 이하의 세 배치로 나눈다", () => {
    // Given: Firestore 삭제 한도를 넘는 801개 항목
    const items = Array.from({ length: 801 }, (_, index) => index + 1);

    // When: 기본 삭제 배치 크기로 나누면
    const batches = splitIntoDeleteBatches(items);

    // Then: 400개, 400개, 1개 배치가 된다
    expect(batches.map((batch) => batch.length)).toEqual([400, 400, 1]);
  });

  it("빈 항목은 빈 배치 목록으로 반환한다", () => {
    // Given: 삭제할 항목이 없는 경우
    const items: readonly string[] = [];

    // When: 삭제 배치로 나누면
    const batches = splitIntoDeleteBatches(items);

    // Then: 커밋할 배치도 없다
    expect(batches).toEqual([]);
  });

  it("원본 항목 순서와 배열은 바꾸지 않는다", () => {
    // Given: 순서가 있는 삭제 대상 배열
    const items = ["first", "second", "third"];

    // When: 두 개씩 삭제 배치로 나누면
    const batches = splitIntoDeleteBatches(items, 2);

    // Then: 새 배치를 반환하고 원본은 그대로 남는다
    expect(batches).toEqual([["first", "second"], ["third"]]);
    expect(batches[0]).not.toBe(items);
    expect(items).toEqual(["first", "second", "third"]);
  });

  it("사용자 지정 최대치 1에서 항목마다 한 배치를 만든다", () => {
    // Given: 세 개의 삭제 대상과 최소 허용 배치 크기
    const items = ["first", "second", "third"];

    // When: 최대치를 1로 지정하면
    const batches = splitIntoDeleteBatches(items, 1);

    // Then: 각 항목이 독립 배치가 된다
    expect(batches).toEqual([["first"], ["second"], ["third"]]);
  });

  it.each([0, -1, 1.5, 401])("허용 범위 밖 최대치 %s를 거부한다", (maximum) => {
    // Given: Firestore 안전 한도 밖의 배치 최대치
    const items = ["first"];

    // When: 그 최대치로 배치를 나누면
    const split = () => splitIntoDeleteBatches(items, maximum);

    // Then: 호출자가 처리할 수 있는 형식의 오류를 던진다
    expect(split).toThrow(InvalidDeleteBatchMaximumError);
  });
});

describe("참여자 기록 삭제", () => {
  it("참여자 문서 id와 같은 세션의 ownerUid 기록만 선택한다", async () => {
    // Given: 문서 id와 ownerUid가 다른 참여자 및 관련 기록
    firestore.reset([
      snapshot(["sessions/session-1/helpRequests/request-1"]),
      snapshot(["sessions/session-1/cheers/cheer-1"])
    ]);

    // When: 참여자 기록을 삭제하면
    await deleteParticipantHistory("session-1", participant());

    // Then: 세션 내부의 참여자·도움 요청·응원 문서만 한 커밋에 삭제한다
    expect(firestore.collectionPaths).toEqual([
      "sessions/session-1/helpRequests",
      "sessions/session-1/cheers"
    ]);
    expect(firestore.queryConstraints).toEqual([
      { field: "ownerUid", operator: "==", value: "owner-uid" },
      { field: "ownerUid", operator: "==", value: "owner-uid" }
    ]);
    expect(firestore.setDocCalls[0]?.[0]).toEqual({ path: "sessions/session-1/deletedParticipants/owner-uid" });
    expect(firestore.committedBatches).toEqual([
      [
        { path: "sessions/session-1/participants/participant-document-id" },
        { path: "sessions/session-1/helpRequests/request-1" },
        { path: "sessions/session-1/cheers/cheer-1" }
      ]
    ]);
  });

  it("401개 문서를 두 번 커밋하고 각 커밋 뒤 진행 상황을 알린다", async () => {
    // Given: 참여자 문서와 400개의 도움 요청 문서
    firestore.reset([snapshot(helpRequestPaths(400)), snapshot([])]);
    const progress: number[][] = [];

    // When: 참여자 기록을 삭제하면
    await deleteParticipantHistory("session-1", participant(), (completed, total) => {
      progress.push([completed, total]);
    });

    // Then: Firestore 안전 크기의 두 커밋과 누적 진행 상황을 남긴다
    expect(firestore.committedBatches.map((batch) => batch.length)).toEqual([400, 1]);
    expect(progress).toEqual([[400, 401], [401, 401]]);
  });

  it("커밋 실패를 전파하고 실패한 배치 뒤에는 진행 상황을 알리지 않는다", async () => {
    // Given: 두 번째 커밋이 실패할 401개 문서
    const commitError = new MockFirestoreSetupError("Second batch failed.");
    firestore.reset([snapshot(helpRequestPaths(400)), snapshot([])], [null, commitError]);
    const progress: number[][] = [];

    // When: 참여자 기록을 삭제하면
    const deletion = deleteParticipantHistory("session-1", participant(), (completed, total) => {
      progress.push([completed, total]);
    });

    // Then: 실패를 호출자에게 전달하고 첫 커밋의 진행 상황만 남긴다
    await expect(deletion).rejects.toBe(commitError);
    expect(progress).toEqual([[400, 401]]);
  });
});

describe("학생 기록 저장 경계", () => {
  it("개인정보로 보이는 확정 문장은 Firestore에 쓰지 않는다", async () => {
    const saving = saveParticipant("session-1", "owner-uid", "규칙확인", ["010-1234-5678"], 1);

    await expect(saving).rejects.toBeInstanceOf(UnsafeStudentTextError);
    expect(firestore.setDocCalls).toEqual([]);
  });
});

describe("수업 보관", () => {
  it("학생 기록을 지운 뒤에만 수업 메타데이터를 보관 상태로 남긴다", async () => {
    // Given: 세션 안의 참여자·도움 요청·응원 문서
    firestore.reset([
      snapshot(["sessions/session-1/participants/participant-1"]),
      snapshot(["sessions/session-1/helpRequests/request-1"]),
      snapshot(["sessions/session-1/cheers/cheer-1"]),
      snapshot(["sessions/session-1/deletedParticipants/owner-uid"])
    ]);

    // When: 세션 기록을 삭제하면
    await deleteSessionHistory("session-1");

    expect(firestore.collectionPaths).toEqual([
      "sessions/session-1/participants",
      "sessions/session-1/helpRequests",
      "sessions/session-1/cheers",
      "sessions/session-1/deletedParticipants"
    ]);
    expect(firestore.setDocCalls).toEqual([
      [
        { path: "sessions/session-1" },
        { state: "archiving", archivingAt: "server-timestamp" },
        { merge: true }
      ],
      [
        { path: "sessions/session-1" },
        { state: "archived", archivedAt: "server-timestamp" },
        { merge: true }
      ]
    ]);
    expect(firestore.committedBatches).toEqual([
      [
        { path: "sessions/session-1/participants/participant-1" },
        { path: "sessions/session-1/helpRequests/request-1" },
        { path: "sessions/session-1/cheers/cheer-1" },
        { path: "sessions/session-1/deletedParticipants/owner-uid" }
      ]
    ]);
  });

  it("삭제가 실패하면 수업을 보관하지 않고 정리 중 상태로 남긴다", async () => {
    const commitError = new MockFirestoreSetupError("Delete batch failed.");
    firestore.reset([
      snapshot(["sessions/session-1/participants/participant-1"]),
      snapshot([]),
      snapshot([]),
      snapshot([])
    ], [commitError]);

    await expect(deleteSessionHistory("session-1")).rejects.toBe(commitError);

    expect(firestore.setDocCalls).toEqual([
      [
        { path: "sessions/session-1" },
        { state: "archiving", archivingAt: "server-timestamp" },
        { merge: true }
      ]
    ]);
  });
});

describe("보관 수업 삭제", () => {
  it("혹시 남아 있는 하위 기록까지 지운 뒤 보관 수업을 완전히 삭제한다", async () => {
    const archivedSession: ClassSession = {
      id: "session-1",
      state: "archived",
      openedAtMs: 1,
      archivedAtMs: 2
    };
    firestore.reset([
      snapshot(["sessions/session-1/participants/participant-1"]),
      snapshot(["sessions/session-1/helpRequests/request-1"]),
      snapshot(["sessions/session-1/cheers/cheer-1"]),
      snapshot(["sessions/session-1/deletedParticipants/owner-uid"])
    ]);

    await deleteArchivedSession(archivedSession);

    expect(firestore.collectionPaths).toEqual([
      "sessions/session-1/participants",
      "sessions/session-1/helpRequests",
      "sessions/session-1/cheers",
      "sessions/session-1/deletedParticipants"
    ]);
    expect(firestore.committedBatches).toEqual([
      [
        { path: "sessions/session-1/participants/participant-1" },
        { path: "sessions/session-1/helpRequests/request-1" },
        { path: "sessions/session-1/cheers/cheer-1" },
        { path: "sessions/session-1/deletedParticipants/owner-uid" }
      ]
    ]);
    expect(firestore.deletedDocuments).toEqual([{ path: "sessions/session-1" }]);
  });
});
