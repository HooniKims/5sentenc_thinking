import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";

export async function saveParticipant(
  sessionId: string,
  ownerUid: string,
  nickname: string,
  sentences: readonly string[],
  currentStep: number
): Promise<void> {
  await setDoc(
    doc(db, "sessions", sessionId, "participants", ownerUid),
    {
      ownerUid,
      nickname,
      sentences,
      currentStep,
      status: "writing",
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

export async function createHelpRequest(sessionId: string, ownerUid: string, step: number): Promise<void> {
  await setDoc(doc(db, "sessions", sessionId, "helpRequests", `${ownerUid}-${step}`), {
    ownerUid,
    step,
    status: "requested",
    createdAt: serverTimestamp()
  });
}
