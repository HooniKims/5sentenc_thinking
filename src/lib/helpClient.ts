import ky from "ky";
import { z } from "zod";
import { contextualHelpQuestion, type HelpGuidanceInput } from "./helpGuidance";
import { getStudentIdToken } from "./firebase";

const responseSchema = z.object({ variant: z.enum(["0", "1", "2"]) });

class InvalidGuidanceResponseError extends Error {
  constructor() {
    super("The guidance response must select one safe thinking direction.");
    this.name = "InvalidGuidanceResponseError";
  }
}

function guidanceVariantFrom(value: "0" | "1" | "2"): 0 | 1 | 2 {
  switch (value) {
    case "0":
      return 0;
    case "1":
      return 1;
    case "2":
      return 2;
  }
}

export async function requestGuidanceQuestion(
  input: HelpGuidanceInput,
  sentences: readonly string[]
): Promise<string> {
  const token = await getStudentIdToken();
  const response = await ky
    .post("/api/help", {
      json: input,
      headers: { Authorization: `Bearer ${token}` },
      retry: 0,
      timeout: 12_000
    })
    .json<unknown>();
  const parsed = responseSchema.safeParse(response);
  if (!parsed.success) {
    throw new InvalidGuidanceResponseError();
  }

  return contextualHelpQuestion(input.step, sentences, guidanceVariantFrom(parsed.data.variant));
}
