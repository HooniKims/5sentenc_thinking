import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  verifyStudentToken: vi.fn<() => Promise<{ readonly uid: string } | null>>()
}));

vi.mock("../../server/firebaseAuth", () => ({ verifyStudentToken: auth.verifyStudentToken }));

const { default: handler, resetHelpRateLimitForTests } = await import("../../api/help");

interface FakeResponse {
  readonly response: {
    status(code: number): FakeResponse["response"];
    json(body: Readonly<Record<string, string>>): void;
  };
  readonly result: () => { readonly statusCode: number; readonly body: Readonly<Record<string, string>> | null };
}

function createFakeResponse(): FakeResponse {
  let statusCode = 0;
  let body: Readonly<Record<string, string>> | null = null;
  const response = {
    status(code: number) {
      statusCode = code;
      return response;
    },
    json(nextBody: Readonly<Record<string, string>>) {
      body = nextBody;
    }
  };

  return { response, result: () => ({ statusCode, body }) };
}

const safeRequest = {
  step: 2,
  confirmedSentenceCount: 1,
  draftLength: "developing",
  detailKinds: ["scene", "sense"],
  repeatsKnownWords: false
} as const;

let originalApiKey: string | undefined;
let originalModel: string | undefined;

beforeEach(() => {
  originalApiKey = process.env["UPSTAGE_API_KEY"];
  originalModel = process.env["UPSTAGE_MODEL"];
  delete process.env["UPSTAGE_API_KEY"];
  delete process.env["UPSTAGE_MODEL"];
  auth.verifyStudentToken.mockResolvedValue({ uid: "student-1" });
  resetHelpRateLimitForTests();
});

afterEach(() => {
  vi.clearAllMocks();
  if (originalApiKey === undefined) {
    delete process.env["UPSTAGE_API_KEY"];
  } else {
    process.env["UPSTAGE_API_KEY"] = originalApiKey;
  }
  if (originalModel === undefined) {
    delete process.env["UPSTAGE_MODEL"];
  } else {
    process.env["UPSTAGE_MODEL"] = originalModel;
  }
});

describe("도움 API 입력 경계", () => {
  it("학생 토큰이 없으면 모델 설정을 확인하기 전에 거절한다", async () => {
    auth.verifyStudentToken.mockResolvedValueOnce(null);
    const response = createFakeResponse();

    await handler({ method: "POST", body: safeRequest }, response.response);

    expect(response.result()).toEqual({ statusCode: 401, body: { error: "unauthorized" } });
  });

  it("원문이나 알 수 없는 필드가 담긴 요청은 제공자 호출 전에 거절한다", async () => {
    const unknownFieldResponse = createFakeResponse();
    await handler(
      { method: "POST", body: { ...safeRequest, thought: "이전 요청 형식" } },
      unknownFieldResponse.response
    );
    expect(unknownFieldResponse.result()).toEqual({ statusCode: 400, body: { error: "invalid_request" } });

    const rawTextResponse = createFakeResponse();
    await handler(
      { method: "POST", body: { ...safeRequest, sentences: ["버스를 탔어요."], draft: "창밖을 봤어요." } },
      rawTextResponse.response
    );
    expect(rawTextResponse.result()).toEqual({ statusCode: 400, body: { error: "invalid_request" } });
  });

  it("인증된 안전 요청은 모델 설정이 없을 때만 503으로 멈춘다", async () => {
    const response = createFakeResponse();
    await handler({ method: "POST", body: safeRequest }, response.response);

    expect(response.result()).toEqual({ statusCode: 503, body: { error: "guide_unavailable" } });
  });

  it("같은 학생의 짧은 시간 반복 요청을 제한한다", async () => {
    for (let requestNumber = 0; requestNumber < 8; requestNumber += 1) {
      const response = createFakeResponse();
      await handler({ method: "POST", body: safeRequest }, response.response);
      expect(response.result().statusCode).toBe(503);
    }

    const limitedResponse = createFakeResponse();
    await handler({ method: "POST", body: safeRequest }, limitedResponse.response);
    expect(limitedResponse.result()).toEqual({ statusCode: 429, body: { error: "rate_limited" } });
  });
});
