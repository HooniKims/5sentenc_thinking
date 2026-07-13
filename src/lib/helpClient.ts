import ky from "ky";
import { z } from "zod";
import { isSingleThinkingQuestion, type HelpGuidanceInput } from "./helpGuidance";
import { getStudentIdToken } from "./firebase";

const responseSchema = z.object({ question: z.string().min(1).max(120) });

class InvalidGuidanceResponseError extends Error {
  constructor() {
    super("The guidance response must be one safe Korean thinking question.");
    this.name = "InvalidGuidanceResponseError";
  }
}

export async function requestGuidanceQuestion(input: HelpGuidanceInput): Promise<string> {
  const token = await getStudentIdToken();
  const response = await ky
    .post("/api/help", {
      json: input,
      headers: { Authorization: `Bearer ${token}` },
      retry: 0,
      timeout: 12_000
    })
    .json<unknown>();
  const question = responseSchema.parse(response).question;
  if (!isSingleThinkingQuestion(question)) {
    throw new InvalidGuidanceResponseError();
  }

  return question;
}
