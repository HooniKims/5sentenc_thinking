import { AnimationClip, NumberKeyframeTrack } from "three";
import { describe, expect, it } from "vitest";
import { filterClipToBones, helpMotionAt, idleMotionAt, nextClipName, stripBoneTranslation } from "./Robot3D";

describe("nextClipName", () => {
  it("풀에 여러 동작이 있으면 지금 동작과 다른 것을 고른다", () => {
    expect(nextClipName(["a", "b"], "a", () => 0)).toBe("b");
    expect(nextClipName(["a", "b", "c"], "b", () => 0.99)).toBe("c");
  });

  it("동작이 하나뿐이면 그대로 유지한다", () => {
    expect(nextClipName(["a"], "a", () => 0.5)).toBe("a");
  });
});

describe("stripBoneTranslation", () => {
  it("루트 본의 이동 트랙만 빼서 전신 동작은 살리고 캐릭터는 제자리에 둔다", () => {
    const clip = new AnimationClip("walk", 1, [
      new NumberKeyframeTrack("Root.position", [0, 1], [0, 1]),
      new NumberKeyframeTrack("Root.quaternion", [0, 1], [0, 1]),
      new NumberKeyframeTrack("Hip.position", [0, 1], [0, 1]),
      new NumberKeyframeTrack("L_Thigh.quaternion", [0, 1], [0, 1])
    ]);

    const result = stripBoneTranslation(clip, new Set(["Root"]));

    expect(result.tracks.map((track) => track.name)).toEqual([
      "Root.quaternion",
      "Hip.position",
      "L_Thigh.quaternion"
    ]);
  });
});

describe("filterClipToBones", () => {
  it("도움 제스처에서는 팔 트랙만 남겨 캐릭터가 걷지 않게 한다", () => {
    const clip = new AnimationClip("help", 1, [
      new NumberKeyframeTrack("Root.position", [0, 1], [0, 1]),
      new NumberKeyframeTrack("0_Left_Limb_0.rotation", [0, 1], [0, 1]),
      new NumberKeyframeTrack("0_Right_Limb_0.rotation", [0, 1], [0, 1]),
      new NumberKeyframeTrack("0_Left_Leg_0.rotation", [0, 1], [0, 1])
    ]);

    const result = filterClipToBones(clip, new Set(["0_Left_Limb_0", "0_Right_Limb_0"]));

    expect(result.tracks.map((track) => track.name)).toEqual([
      "0_Left_Limb_0.rotation",
      "0_Right_Limb_0.rotation"
    ]);
  });
});

describe("idleMotionAt", () => {
  it("idle 상태에서는 발을 옮기지 않고 몸을 미세하게 움직인다", () => {
    const motion = idleMotionAt(1);

    expect(motion.positionY).toBe(0);
    expect(motion.turnY).not.toBe(0);
    expect(motion.scaleY).not.toBe(1);
  });
});

describe("helpMotionAt", () => {
  it("도움 질문을 건넬 때는 발을 옮기지 않고 몸을 더 크게 움직인다", () => {
    const motion = helpMotionAt(1);

    expect(motion.positionY).toBe(0);
    expect(Math.abs(motion.turnY)).toBeGreaterThan(Math.abs(idleMotionAt(1).turnY));
    expect(motion.scaleY).not.toBe(1);
  });
});
