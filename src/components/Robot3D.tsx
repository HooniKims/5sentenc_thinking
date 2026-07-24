import { useAnimations, useGLTF, useTexture } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Group } from "three";
import { didiFaceForFrame, faceTextureUrls, type DidiFaceMood } from "../lib/didiFaces";

// 콘페스타 디디(아이스크림). 이전 모델로 되돌리려면 /models/robot-animated.glb + 이전 클립 매핑을 쓴다.
const MODEL_URL = "/models/didi-confesta.glb";
const MODEL_ROTATION_Y = 0;
// Tripo 리타겟 클립 14종: NlaTrack=웃음, .001=걷기, .002=하트_포즈, .003=대기, .004=둘러보기,
// .005=점프, .006=서서_휴식, .007=주문_걸기, .008=준비_운동, .009=손_흔들어_인사, .010=노래,
// .011=응원, .012=동의, .013=댄스
// 같은 상황에서도 매번 같은 동작만 반복하지 않도록 상황별 동작 풀에서 골라 재생한다.
const GESTURE_CLIPS = {
  // v4 통통 몸체, 14클립. 설명형 잔잔한 동작만 상호작용에 쓰고, 크게 숙이는 동작(#0·#10·#12)은 완성 축하에만.
  // #5=둘러보기(궁금), #9=팔짱끼기(생각), #3=손을 얼굴로(갸웃), #8=손 제스처, #2/#4/#6/#7/#13=차분한 대기
  idle: ["NlaTrack.004", "NlaTrack.002", "NlaTrack.006"],
  thinking: ["NlaTrack.005", "NlaTrack.009", "NlaTrack.003"],
  help: ["NlaTrack.011", "NlaTrack.008"],
  speaking: ["NlaTrack.011", "NlaTrack.008"],
  moving: ["NlaTrack.002"],
  cheer: ["NlaTrack.008"],
  complete: ["NlaTrack.013", "NlaTrack", "NlaTrack.010"]
} as const satisfies Record<string, readonly string[]>;

const CLIP_ROTATION_MINIMUM_MS = 9_000;
const CLIP_ROTATION_JITTER_MS = 5_000;

export function nextClipName(
  pool: readonly string[],
  current: string | null,
  random: () => number = Math.random
): string {
  const candidates = pool.length > 1 && current !== null ? pool.filter((name) => name !== current) : pool;
  const index = Math.min(candidates.length - 1, Math.floor(random() * candidates.length));
  return candidates[index] ?? pool[0] ?? "";
}

// 전신 클립은 가중치를 낮추면 T-포즈가 섞여 나오므로 항상 1을 유지한다.
const GESTURE_WEIGHT = {
  idle: 1,
  thinking: 1,
  help: 1,
  speaking: 1,
  moving: 1,
  cheer: 1,
  complete: 1
} as const;

const GESTURE_TIME_SCALE = {
  idle: 1,
  thinking: 0.9,
  help: 0.85,
  speaking: 0.85,
  moving: 1,
  cheer: 1,
  complete: 0.9
} as const;

export type RobotGesture = keyof typeof GESTURE_CLIPS;

const faceMoodByGesture: Record<RobotGesture, DidiFaceMood> = {
  idle: "idle",
  thinking: "thinking",
  help: "speaking",
  speaking: "speaking",
  moving: "speaking",
  cheer: "celebrating",
  complete: "celebrating"
};

// 새 디디가 원본보다 말라 보여 좌우 폭만 살짝 키운다.
const BODY_WIDEN = 1.0;

const FACE_PLANE = {
  width: 0.37,
  height: 0.37 * (436 / 512),
  position: new THREE.Vector3(0, 0.64, 0.262),
  tiltX: -0.05,
  // 머리 스크린이 볼록 곡면이라 얼굴도 같은 곡률로 휘어 밀착시킨다.
  curveRadiusX: 0.3,
  curveRadiusY: 0.5
};

export function curvedFacePlaneGeometry(): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(FACE_PLANE.width, FACE_PLANE.height, 24, 12);
  const position = geometry.attributes["position"];
  if (position) {
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const y = position.getY(i);
      position.setZ(i, -(x * x) / (2 * FACE_PLANE.curveRadiusX) - (y * y) / (2 * FACE_PLANE.curveRadiusY));
    }
    geometry.computeVertexNormals();
  }
  return geometry;
}

const BLINK_PERIOD_SECONDS = 3.4;
const BLINK_DURATION_SECONDS = 0.18;

export interface IdleMotion {
  readonly positionY: number;
  readonly turnY: number;
  readonly scaleY: number;
}

export function idleMotionAt(elapsed: number): IdleMotion {
  return {
    positionY: 0,
    turnY: Math.sin(elapsed * 0.9) * 0.05,
    scaleY: 1 + Math.sin(elapsed * 1.4) * 0.015
  };
}

export function helpMotionAt(elapsed: number): IdleMotion {
  return {
    positionY: 0,
    turnY: Math.sin(elapsed * 1.8) * 0.11,
    scaleY: 1 + Math.sin(elapsed * 2.4) * 0.028
  };
}

export function speakingMotionAt(elapsed: number): IdleMotion {
  return {
    positionY: 0,
    turnY: Math.sin(elapsed * 1.8) * 0.07,
    scaleY: 1 + Math.sin(elapsed * 2.8) * 0.022
  };
}

export function filterClipToBones(clip: THREE.AnimationClip, allowedBones: ReadonlySet<string>): THREE.AnimationClip {
  const tracks = clip.tracks.filter((track) => allowedBones.has(track.name.split(".")[0] ?? ""));
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

export function stripBoneTranslation(clip: THREE.AnimationClip, bones: ReadonlySet<string>): THREE.AnimationClip {
  const tracks = clip.tracks.filter((track) => {
    const [bone, property] = track.name.split(".");
    return !(bones.has(bone ?? "") && property === "position");
  });
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

const ROOT_BONES: ReadonlySet<string> = new Set(["Root"]);

function RobotModel({ gesture, lipFrame }: { readonly gesture: RobotGesture; readonly lipFrame: number }): React.JSX.Element {
  const group = useRef<Group>(null);
  const facePlane = useRef<THREE.Mesh>(null);
  const faceMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const { scene, animations } = useGLTF(MODEL_URL);
  const textures = useTexture(faceTextureUrls);
  const faceGeometry = useMemo(() => curvedFacePlaneGeometry(), []);
  const inPlaceAnimations = useMemo(
    () => animations.map((clip) => stripBoneTranslation(clip, ROOT_BONES)),
    [animations]
  );
  const { actions } = useAnimations(inPlaceAnimations, group);
  const [clip, setClip] = useState<string>(() => nextClipName(GESTURE_CLIPS[gesture], null));

  useEffect(() => {
    setClip((current) => nextClipName(GESTURE_CLIPS[gesture], current));

    const pool = GESTURE_CLIPS[gesture];
    if (pool.length < 2) {
      return;
    }

    const rotation = window.setInterval(() => {
      setClip((current) => nextClipName(pool, current));
    }, CLIP_ROTATION_MINIMUM_MS + Math.random() * CLIP_ROTATION_JITTER_MS);
    return () => window.clearInterval(rotation);
  }, [gesture]);

  useMemo(() => {
    scene.rotation.set(0, MODEL_ROTATION_Y, 0);
    scene.position.set(0, 0, 0);
    scene.scale.setScalar(1);
    scene.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const scale = size.y > 0 ? 1 / size.y : 1;
    scene.scale.set(scale * BODY_WIDEN, scale, scale * BODY_WIDEN);
    scene.updateMatrixWorld(true);

    box.setFromObject(scene);
    const center = box.getCenter(new THREE.Vector3());
    scene.position.set(-center.x, -box.min.y, -center.z);
  }, [scene]);

  useEffect(() => {
    Object.values(textures).forEach((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
    });
  }, [textures]);

  // 얼굴 평면을 머리 뼈에 붙여 고개 숙임·회전을 따라가게 한다. 뼈가 없으면 고정 위치 폴백.
  const faceAnchor = useMemo(() => {
    let headBone: THREE.Object3D | null = null;
    scene.traverse((object) => {
      if (!headBone && (object as THREE.Bone).isBone && object.name === "Head") {
        headBone = object;
      }
    });
    if (!headBone) {
      return null;
    }

    scene.updateMatrixWorld(true);
    const desired = new THREE.Matrix4()
      .makeTranslation(FACE_PLANE.position.x, FACE_PLANE.position.y, FACE_PLANE.position.z)
      .multiply(new THREE.Matrix4().makeRotationX(FACE_PLANE.tiltX));
    const offset = (headBone as THREE.Object3D).matrixWorld.clone().invert().multiply(desired);
    return { headBone: headBone as THREE.Object3D, offset };
  }, [scene]);

  useEffect(() => {
    const plane = facePlane.current;
    if (!plane) {
      return;
    }

    plane.matrixAutoUpdate = faceAnchor === null;
    plane.position.copy(FACE_PLANE.position);
    plane.rotation.set(FACE_PLANE.tiltX, 0, 0);
  }, [faceAnchor]);

  useEffect(() => {
    const action = actions[clip];
    if (!action) {
      return;
    }

    action.reset().fadeIn(0.2).play();
    action.setEffectiveWeight(GESTURE_WEIGHT[gesture]);
    action.setEffectiveTimeScale(GESTURE_TIME_SCALE[gesture]);
    return () => {
      action.fadeOut(0.2);
    };
  }, [actions, clip, gesture]);

  useFrame(({ clock }) => {
    const robot = group.current;
    if (!robot) {
      return;
    }

    if (gesture === "idle" || gesture === "help" || gesture === "speaking" || gesture === "moving") {
      const motion =
        gesture === "idle"
          ? idleMotionAt(clock.elapsedTime)
          : gesture === "help"
            ? helpMotionAt(clock.elapsedTime)
            : speakingMotionAt(clock.elapsedTime);
      robot.position.y = motion.positionY;
      robot.rotation.y = motion.turnY;
      robot.scale.set(1, motion.scaleY, 1);
    } else {
      robot.position.y = 0;
      robot.rotation.y = 0;
      robot.scale.set(1, 1, 1);
    }

    if (faceAnchor && facePlane.current) {
      robot.updateMatrixWorld(true);
      facePlane.current.matrix
        .copy(robot.matrixWorld)
        .invert()
        .multiply(faceAnchor.headBone.matrixWorld)
        .multiply(faceAnchor.offset);
    }

    const faceKey = didiFaceForFrame(
      faceMoodByGesture[gesture],
      lipFrame,
      clock.elapsedTime % BLINK_PERIOD_SECONDS < BLINK_DURATION_SECONDS
    );
    const texture = textures[faceKey];
    if (faceMaterial.current && faceMaterial.current.map !== texture) {
      faceMaterial.current.map = texture;
      faceMaterial.current.needsUpdate = true;
    }
  });

  return (
    <group ref={group}>
      <primitive object={scene} />
      <mesh ref={facePlane} rotation={[FACE_PLANE.tiltX, 0, 0]} geometry={faceGeometry} renderOrder={2}>
        <meshBasicMaterial ref={faceMaterial} map={textures.neutral} transparent toneMapped={false} depthWrite={false} depthTest={false} />
      </mesh>
    </group>
  );
}

export function Robot3D({ gesture, lipFrame = 0 }: { readonly gesture: RobotGesture; readonly lipFrame?: number }): React.JSX.Element {
  return (
    <div className="robot-canvas" data-robot-3d="true" data-gesture={gesture} data-lip-frame={lipFrame}>
      <Canvas
        camera={{ position: [0, 0.58, 1.82], fov: 33 }}
        dpr={[1.5, 2]}
        gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" }}
        onCreated={({ camera }) => camera.lookAt(0, 0.52, 0)}
      >
        <ambientLight intensity={0.9} />
        <hemisphereLight args={["#dff3ff", "#9db6cc", 0.55]} />
        <directionalLight position={[3, 5, 2]} intensity={1.15} />
        <directionalLight position={[-2.4, 2.2, 1.4]} intensity={0.4} />
        <directionalLight position={[0, 2.4, -3]} intensity={1.4} color="#c8ff3d" />
        <directionalLight position={[-2.2, 1.2, -2.2]} intensity={0.7} color="#ffd7f2" />
        <Suspense fallback={null}>
          <RobotModel gesture={gesture} lipFrame={lipFrame} />
        </Suspense>
      </Canvas>
    </div>
  );
}

useGLTF.preload(MODEL_URL);
