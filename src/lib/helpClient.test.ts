import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HelpGuidanceInput } from "./helpGuidance";

const firebase = vi.hoisted(() => ({ getStudentIdToken: vi.fn<() => Promise<string>>() }));
const ky = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock("./firebase", () => ({ getStudentIdToken: firebase.getStudentIdToken }));
vi.mock("ky", () => ({ default: { post: ky.post } }));

const { requestGuidanceQuestion } = await import("./helpClient");

const guidanceInput: HelpGuidanceInput = {
  step: 2,
  confirmedSentenceCount: 1,
  draftLength: "empty",
  detailKinds: ["action"],
  repeatsKnownWords: false
};

beforeEach(() => {
  firebase.getStudentIdToken.mockReset();
  firebase.getStudentIdToken.mockResolvedValue("student-token");
  ky.post.mockReset();
});

describe("도움 질문 요청", () => {
  it("Solar가 고른 질문 방향을 기기 안의 첫 문장에 맞춰 바꾼다", async () => {
    ky.post.mockReturnValue({ json: async () => ({ variant: "0" }) });

    const question = await requestGuidanceQuestion(guidanceInput, ["버스를 타고 왔어요."]);

    expect(question).toBe("“버스를 타고 왔어요” 다음에는 버스 안이나 창밖에서 가장 먼저 보인 것은 무엇이었나요?");
    expect(ky.post).toHaveBeenCalledWith(
      "/api/help",
      expect.objectContaining({
        headers: { Authorization: "Bearer student-token" },
        json: guidanceInput
      })
    );
    expect(JSON.stringify(ky.post.mock.calls)).not.toContain("버스를 타고 왔어요");
  });
});
