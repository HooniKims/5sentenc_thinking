import { collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, setDoc, where, writeBatch } from "firebase/firestore";
import type { DocumentReference, FirestoreError, Unsubscribe } from "firebase/firestore";
import type { ParticipantStatus } from "./activity";
import { db } from "./firebase";
import { containsPersonalInformation } from "./helpGuidance";

const MAXIMUM_DELETE_BATCH_SIZE = 400;

export class InvalidDeleteBatchMaximumError extends Error {
  readonly maximum: number;

  constructor(maximum: number) {
    super(`Delete batch maximum must be an integer between 1 and ${MAXIMUM_DELETE_BATCH_SIZE}.`);
    this.name = "InvalidDeleteBatchMaximumError";
    this.maximum = maximum;
  }
}

export type DeleteProgress = (completed: number, total: number) => void;

export type SessionState = "active" | "archiving" | "archived";

export interface ClassSession {
  readonly id: string;
  readonly state: SessionState;
  readonly openedAtMs: number;
  readonly archivedAtMs: number | null;
}

export class ArchivedSessionRequiredError extends Error {
  readonly sessionId: string;

  constructor(sessionId: string) {
    super("Only archived sessions can be deleted permanently.");
    this.name = "ArchivedSessionRequiredError";
    this.sessionId = sessionId;
  }
}

export class UnsafeStudentTextError extends Error {
  constructor() {
    super("Student text must not include personal information.");
    this.name = "UnsafeStudentTextError";
  }
}

export interface SessionParticipant {
  readonly id: string;
  readonly ownerUid: string;
  readonly nickname: string;
  readonly sentences: readonly string[];
  readonly currentStep: number;
  readonly status: ParticipantStatus;
  readonly updatedAtMs: number;
}

export function splitIntoDeleteBatches<T>(
  items: readonly T[],
  maximum: number = MAXIMUM_DELETE_BATCH_SIZE
): readonly (readonly T[])[] {
  if (!Number.isInteger(maximum) || maximum <= 0 || maximum > MAXIMUM_DELETE_BATCH_SIZE) {
    throw new InvalidDeleteBatchMaximumError(maximum);
  }

  const batches: T[][] = [];
  for (let start = 0; start < items.length; start += maximum) {
    batches.push(items.slice(start, start + maximum));
  }

  return batches;
}

async function deleteDocumentReferences(
  references: readonly DocumentReference[],
  onBatchComplete?: DeleteProgress
): Promise<void> {
  const total = references.length;
  let completed = 0;

  for (const batchReferences of splitIntoDeleteBatches(references)) {
    const batch = writeBatch(db);
    for (const reference of batchReferences) {
      batch.delete(reference);
    }
    await batch.commit();
    completed += batchReferences.length;
    onBatchComplete?.(completed, total);
  }
}

function assertSafeStudentSentences(sentences: readonly string[]): void {
  if (sentences.some((sentence) => containsPersonalInformation(sentence))) {
    throw new UnsafeStudentTextError();
  }
}

export async function createSession(): Promise<string> {
  const sessionId = `session-${crypto.randomUUID()}`;
  await setDoc(doc(db, "sessions", sessionId), {
    state: "active",
    openedAt: serverTimestamp()
  });
  return sessionId;
}

export async function sessionIsActive(sessionId: string): Promise<boolean> {
  const sessionReference = doc(db, "sessions", sessionId);
  const snapshot = await getDoc(sessionReference);
  const data = snapshot.data();
  return snapshot.exists() && isRecord(data) && data["state"] === "active";
}

export async function deleteParticipantHistory(
  sessionId: string,
  participant: SessionParticipant,
  onBatchComplete?: DeleteProgress
): Promise<void> {
  await setDoc(
    doc(db, "sessions", sessionId, "deletedParticipants", participant.ownerUid),
    {
      ownerUid: participant.ownerUid,
      deletedAt: serverTimestamp()
    }
  );
  const [helpRequests, cheers] = await Promise.all([
    getDocs(query(collection(db, "sessions", sessionId, "helpRequests"), where("ownerUid", "==", participant.ownerUid))),
    getDocs(query(collection(db, "sessions", sessionId, "cheers"), where("ownerUid", "==", participant.ownerUid)))
  ]);
  const references: readonly DocumentReference[] = [
    doc(db, "sessions", sessionId, "participants", participant.id),
    ...helpRequests.docs.map((request) => request.ref),
    ...cheers.docs.map((cheer) => cheer.ref)
  ];

  await deleteDocumentReferences(references, onBatchComplete);
}

export async function deleteSessionHistory(sessionId: string, onBatchComplete?: DeleteProgress): Promise<void> {
  const sessionReference = doc(db, "sessions", sessionId);
  await setDoc(
    sessionReference,
    {
      state: "archiving",
      archivingAt: serverTimestamp()
    },
    { merge: true }
  );
  const [participants, helpRequests, cheers, deletedParticipants] = await Promise.all([
    getDocs(collection(db, "sessions", sessionId, "participants")),
    getDocs(collection(db, "sessions", sessionId, "helpRequests")),
    getDocs(collection(db, "sessions", sessionId, "cheers")),
    getDocs(collection(db, "sessions", sessionId, "deletedParticipants"))
  ]);
  const references: readonly DocumentReference[] = [
    ...participants.docs.map((participant) => participant.ref),
    ...helpRequests.docs.map((request) => request.ref),
    ...cheers.docs.map((cheer) => cheer.ref),
    ...deletedParticipants.docs.map((deletedParticipant) => deletedParticipant.ref)
  ];

  await deleteDocumentReferences(references, onBatchComplete);
  await setDoc(
    sessionReference,
    {
      state: "archived",
      archivedAt: serverTimestamp()
    },
    { merge: true }
  );
}

export async function deleteArchivedSession(
  session: ClassSession,
  onBatchComplete?: DeleteProgress
): Promise<void> {
  if (session.state !== "archived") {
    throw new ArchivedSessionRequiredError(session.id);
  }

  const sessionReference = doc(db, "sessions", session.id);
  const [participants, helpRequests, cheers, deletedParticipants] = await Promise.all([
    getDocs(collection(db, "sessions", session.id, "participants")),
    getDocs(collection(db, "sessions", session.id, "helpRequests")),
    getDocs(collection(db, "sessions", session.id, "cheers")),
    getDocs(collection(db, "sessions", session.id, "deletedParticipants"))
  ]);
  const references: readonly DocumentReference[] = [
    ...participants.docs.map((participant) => participant.ref),
    ...helpRequests.docs.map((request) => request.ref),
    ...cheers.docs.map((cheer) => cheer.ref),
    ...deletedParticipants.docs.map((deletedParticipant) => deletedParticipant.ref)
  ];

  await deleteDocumentReferences(references, onBatchComplete);
  await deleteDoc(sessionReference);
}

function isParticipantStatus(value: unknown): value is ParticipantStatus {
  return value === "writing" || value === "help_requested" || value === "help_generating" || value === "help_delivered" || value === "completed";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberFromTimestamp(value: unknown): number {
  if (typeof value === "object" && value !== null && "toMillis" in value && typeof value.toMillis === "function") {
    return value.toMillis();
  }

  return 0;
}

function participantFromSnapshot(id: string, data: unknown): SessionParticipant | null {
  if (!isRecord(data)) {
    return null;
  }

  if (
    typeof data["ownerUid"] !== "string" ||
    typeof data["nickname"] !== "string" ||
    !isParticipantStatus(data["status"])
  ) {
    return null;
  }

  const sentences = Array.isArray(data["sentences"])
    ? data["sentences"].filter((sentence): sentence is string => typeof sentence === "string")
    : [];
  const currentStep =
    typeof data["currentStep"] === "number" && data["currentStep"] >= 1 && data["currentStep"] <= 5
      ? data["currentStep"]
      : 1;

  return {
    id,
    ownerUid: data["ownerUid"],
    nickname: data["nickname"],
    sentences: sentences.filter((sentence) => !containsPersonalInformation(sentence)),
    currentStep,
    status: data["status"],
    updatedAtMs: numberFromTimestamp(data["updatedAt"])
  };
}

function sessionFromSnapshot(id: string, data: unknown): ClassSession | null {
  if (!isRecord(data)) {
    return null;
  }

  if (data["state"] === "active") {
    return {
      id,
      state: "active",
      openedAtMs: numberFromTimestamp(data["openedAt"]),
      archivedAtMs: null
    };
  }

  if (data["state"] === "archiving") {
    return {
      id,
      state: "archiving",
      openedAtMs: numberFromTimestamp(data["openedAt"]),
      archivedAtMs: null
    };
  }

  if (data["state"] === "archived" || data["state"] === "closed") {
    return {
      id,
      state: "archived",
      openedAtMs: numberFromTimestamp(data["openedAt"]),
      archivedAtMs: numberFromTimestamp(data["archivedAt"] ?? data["closedAt"])
    };
  }

  return null;
}

export async function saveParticipant(
  sessionId: string,
  ownerUid: string,
  nickname: string,
  sentences: readonly string[],
  currentStep: number,
  status: ParticipantStatus = "writing"
): Promise<void> {
  assertSafeStudentSentences(sentences);
  await setDoc(
    doc(db, "sessions", sessionId, "participants", ownerUid),
    {
      ownerUid,
      nickname,
      sentences,
      currentStep,
      status,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

export async function createHelpRequest(
  sessionId: string,
  ownerUid: string,
  nickname: string,
  sentences: readonly string[],
  step: number
): Promise<void> {
  assertSafeStudentSentences(sentences);
  const batch = writeBatch(db);
  batch.set(
    doc(db, "sessions", sessionId, "participants", ownerUid),
    {
      ownerUid,
      nickname,
      sentences,
      currentStep: step,
      status: "help_requested",
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
  batch.set(doc(db, "sessions", sessionId, "helpRequests", `${ownerUid}-${step}-${crypto.randomUUID()}`), {
    ownerUid,
    step,
    status: "requested",
    createdAt: serverTimestamp()
  });
  await batch.commit();
}

export function subscribeToParticipants(
  sessionId: string,
  onChange: (participants: readonly SessionParticipant[]) => void,
  onError: (error: FirestoreError) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, "sessions", sessionId, "participants"),
    (snapshot) => {
      const participants = snapshot.docs.flatMap((participant) => {
        const parsed = participantFromSnapshot(participant.id, participant.data());
        return parsed ? [parsed] : [];
      });
      onChange(participants);
    },
    onError
  );
}

export function subscribeToSessions(
  onChange: (sessions: readonly ClassSession[], fromCache: boolean) => void,
  onError: (error: FirestoreError) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, "sessions"),
    { includeMetadataChanges: true },
    (snapshot) => {
      const sessions = snapshot.docs
        .map((session) => sessionFromSnapshot(session.id, session.data()))
        .filter((session): session is ClassSession => session !== null)
        .sort((left, right) => right.openedAtMs - left.openedAtMs);
      onChange(sessions, snapshot.metadata.fromCache);
    },
    onError
  );
}
