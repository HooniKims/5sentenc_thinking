import { collection, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, setDoc, where, writeBatch } from "firebase/firestore";
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

export type SessionReadiness = "active" | "closed";

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

export async function prepareSession(sessionId: string): Promise<SessionReadiness> {
  const sessionReference = doc(db, "sessions", sessionId);
  const snapshot = await getDoc(sessionReference);
  const data = snapshot.data();
  if (isRecord(data) && data["state"] === "closed") {
    return "closed";
  }

  await setDoc(
    sessionReference,
    {
      state: "active",
      openedAt: serverTimestamp()
    },
    { merge: true }
  );
  return "active";
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
      state: "closed",
      closedAt: serverTimestamp()
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
