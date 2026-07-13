import { AnimationClip, NumberKeyframeTrack } from "three";
import { describe, expect, it } from "vitest";
import { filterClipToBones, helpMotionAt, idleMotionAt } from "./Robot3D";

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
