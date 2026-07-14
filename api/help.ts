import ky from "ky";
import { z } from "zod";
import { verifyStudentToken } from "../server/firebaseAuth.js";
import { buildGuidancePrompt } from "../server/helpGuidance.js";

const detailKinds = ["scene", "sense", "action", "change"] as const;
const requestSchema = z
  .object({
    step: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    confirmedSentenceCount: z.number().int().min(0).max(5),
    draftLength: z.union([z.literal("empty"), z.literal("short"), z.literal("developing")]),
    detailKinds: z.array(z.enum(detailKinds)).max(detailKinds.length),
    repeatsKnownWords: z.boolean()
  })
  .strict();
const upstageResponseSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().min(1) }) })).min(1)
});

const RATE_LIMIT_WINDOW_MS = 60_000;
const MAXIMUM_REQUESTS_PER_WINDOW = 8;
const MAXIMUM_REQUESTS_PER_NETWORK_PER_WINDOW = 60;

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

function variantFrom(content: string): 0 | 1 | 2 | null {
  switch (content.trim()) {
    case "0":
      return 0;
    case "1":
      return 1;
    case "2":
      return 2;
    default:
      return null;
  }
}

export function resetHelpRateLimitForTests(): void {
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
    response.status(503).json({ error: "guide_unavailable" });
    return;
  }

  try {
    const result = await ky
      .post("https://api.upstage.ai/v1/chat/completions", {
        headers: { Authorization: `Bearer ${apiKey}` },
        json: {
          model,
          messages: [{ role: "user", content: buildGuidancePrompt(parsed.data) }],
          temperature: 0,
          max_tokens: 4
        },
        retry: 0,
        timeout: 15_000
      })
      .json<unknown>();
    const content = upstageResponseSchema.parse(result).choices[0]?.message.content;
    const variant = content ? variantFrom(content) : null;
    if (variant === null) {
      response.status(502).json({ error: "invalid_guide" });
      return;
    }

    response.status(200).json({ variant: String(variant) });
  } catch (error) {
    console.error("Upstage guide request failed", error instanceof Error ? error.message : "unknown_error");
    response.status(502).json({ error: "guide_unavailable" });
  }
}
