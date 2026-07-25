import ky from "ky";
import { z } from "zod";
import { getStudentIdToken } from "./firebase";

const responseSchema = z.object({ paragraph: z.string().min(1) });

class InvalidRefineResponseError extends Error {
  constructor() {
    super("The refine response must include a paragraph.");
    this.name = "InvalidRefineResponseError";
  }
}

// 학생 문장을 서버(Solar)로 보내 "의미는 그대로, 표현만 유려하게" 다듬은 한 문단을 받는다.
// 완료 화면에서 학생이 직접 "AI로 다듬어 보기"를 누를 때만 호출한다.
export async function requestRefinedParagraph(sentences: readonly string[]): Promise<string> {
  const token = await getStudentIdToken();
  const response = await ky
    .post("/api/refine", {
      json: { sentences },
      headers: { Authorization: `Bearer ${token}` },
      retry: 0,
      timeout: 22_000
    })
    .json<unknown>();
  const parsed = responseSchema.safeParse(response);
  if (!parsed.success) {
    throw new InvalidRefineResponseError();
  }

  return parsed.data.paragraph;
}
