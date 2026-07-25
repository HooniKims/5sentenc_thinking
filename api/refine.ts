import ky from "ky";
import { z } from "zod";
import { verifyStudentToken } from "../server/firebaseAuth.js";
import { buildRefinePrompt } from "../server/refinePrompt.js";

const requestSchema = z
  .object({
    sentences: z.array(z.string().min(1).max(280)).min(1).max(12)
  })
  .strict();
const upstageResponseSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().min(1) }) })).min(1)
});

const RATE_LIMIT_WINDOW_MS = 60_000;
const MAXIMUM_REQUESTS_PER_WINDOW = 6;
const MAXIMUM_REQUESTS_PER_NETWORK_PER_WINDOW = 40;

interface RateLimitEntry {
  readonly startedAt: number;
  readonly count: number;
}

const requestsByStudent = new Map<string, RateLimitEntry>();
const requestsByNetwork = new Map<string, RateLimitEntry>();

interface VercelRequestLike {
  readonly method?: string;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string | readonly string[] | undefined>>;
}

interface VercelResponseLike {
  status(code: number): VercelResponseLike;
  json(body: Readonly<Record<string, string>>): void;
}

function authorizationFrom(request: VercelRequestLike): string | undefined {
  const value = request.headers?.["authorization"];
  return typeof value === "string" ? value : value?.[0];
}

function headerValue(request: VercelRequestLike, name: string): string | undefined {
  const value = request.headers?.[name];
  return typeof value === "string" ? value : value?.[0];
}

function networkKey(request: VercelRequestLike): string {
  const forwardedFor = headerValue(request, "x-forwarded-for");
  const firstAddress = forwardedFor?.split(",")[0]?.trim();
  return firstAddress || headerValue(request, "x-real-ip") || "unknown";
}

function consumesRateLimit(
  requests: Map<string, RateLimitEntry>,
  key: string,
  maximum: number,
  now: number
): boolean {
  const entry = requests.get(key);
  if (!entry || now - entry.startedAt >= RATE_LIMIT_WINDOW_MS) {
    requests.set(key, { startedAt: now, count: 1 });
    return true;
  }

  if (entry.count >= maximum) {
    return false;
  }

  requests.set(key, { startedAt: entry.startedAt, count: entry.count + 1 });
  return true;
}

export function resetRefineRateLimitForTests(): void {
  requestsByStudent.clear();
  requestsByNetwork.clear();
}

export default async function handler(request: VercelRequestLike, response: VercelResponseLike): Promise<void> {
  if (request.method !== "POST") {
    response.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const student = await verifyStudentToken(authorizationFrom(request));
  if (!student) {
    response.status(401).json({ error: "unauthorized" });
    return;
  }

  const parsed = requestSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "invalid_request" });
    return;
  }

  const now = Date.now();
  if (
    !consumesRateLimit(requestsByStudent, student.uid, MAXIMUM_REQUESTS_PER_WINDOW, now) ||
    !consumesRateLimit(requestsByNetwork, networkKey(request), MAXIMUM_REQUESTS_PER_NETWORK_PER_WINDOW, now)
  ) {
    response.status(429).json({ error: "rate_limited" });
    return;
  }

  const apiKey = process.env["UPSTAGE_API_KEY"];
  const model = process.env["UPSTAGE_MODEL"];
  if (!apiKey || !model) {
    response.status(503).json({ error: "refine_unavailable" });
    return;
  }

  try {
    const result = await ky
      .post("https://api.upstage.ai/v1/chat/completions", {
        headers: { Authorization: `Bearer ${apiKey}` },
        json: {
          model,
          messages: [{ role: "user", content: buildRefinePrompt(parsed.data) }],
          temperature: 0.4,
          max_tokens: 600
        },
        retry: 0,
        timeout: 20_000
      })
      .json<unknown>();
    const content = upstageResponseSchema.parse(result).choices[0]?.message.content?.trim();
    if (!content) {
      response.status(502).json({ error: "invalid_refine" });
      return;
    }

    response.status(200).json({ paragraph: content });
  } catch (error) {
    console.error("Upstage refine request failed", error instanceof Error ? error.message : "unknown_error");
    response.status(502).json({ error: "refine_unavailable" });
  }
}
