import { useAnimations, useGLTF, useTexture } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Group } from "three";
import { didiFaceForFrame, faceTextureUrls, type DidiFaceMood } from "../lib/didiFaces";

const MODEL_URL = "/models/robot-animated.glb";
const MODEL_ROTATION_Y = -Math.PI / 2;
const GESTURE_CLIP = {
  idle: "NlaTrack",
  thinking: "NlaTrack",
  help: "NlaTrack.001",
  speaking: "NlaTrack.001",
  moving: "NlaTrack.001",
  cheer: "NlaTrack.002",
  complete: "NlaTrack"
} as const;

const GESTURE_WEIGHT = {
  idle: 0.2,
  thinking: 0.45,
  help: 0.8,
  speaking: 0.8,
  moving: 0.72,
  cheer: 0.65,
  complete: 0.65
} as const;

const GESTURE_TIME_SCALE = {
  idle: 0.35,
  thinking: 0.5,
  help: 0.85,
  speaking: 0.72,
  moving: 0.95,
  cheer: 0.55,
  complete: 0.55
} as const;

export type RobotGesture = keyof typeof GESTURE_CLIP;

const faceMoodByGesture: Record<RobotGesture, DidiFaceMood> = {
  idle: "idle",
  thinking: "thinking",
  help: "speaking",
  speaking: "speaking",
  moving: "speaking",
  cheer: "celebrating",
  complete: "celebrating"
};

const FACE_PLANE = {
  width: 0.41,
  height: 0.41 * (436 / 512),
  position: new THREE.Vector3(0, 0.6, 0.265),
  tiltX: -0.15
};

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

function RobotModel({ gesture, lipFrame }: { readonly gesture: RobotGesture; readonly lipFrame: number }): React.JSX.Element {
  const group = useRef<Group>(null);
  const facePlane = useRef<THREE.Mesh>(null);
  const faceMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const { scene, animations } = useGLTF(MODEL_URL);
  const textures = useTexture(faceTextureUrls);
  const armOnlyAnimations = useMemo(() => {
    const armBones = new Set<string>();
    scene.traverse((object) => {
      if (/0_(Left|Right)_Limb_0$/i.test(object.name)) {
        object.traverse((child) => armBones.add(child.name));
      }
    });
    return animations.map((clip) => filterClipToBones(clip, armBones));
  }, [animations, scene]);
  const { actions } = useAnimations(armOnlyAnimations, group);
  const clip = GESTURE_CLIP[gesture];

  useMemo(() => {
    scene.rotation.set(0, MODEL_ROTATION_Y, 0);
    scene.position.set(0, 0, 0);
    scene.scale.setScalar(1);
    scene.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const scale = size.y > 0 ? 1 / size.y : 1;
    scene.scale.setScalar(scale);
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

  useEffect(() => {
    const plane = facePlane.current;
    if (!plane) {
      return;
    }

    plane.position.copy(FACE_PLANE.position);
    plane.rotation.set(FACE_PLANE.tiltX, 0, 0);
  }, []);

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
      <mesh ref={facePlane} rotation={[FACE_PLANE.tiltX, 0, 0]}>
        <planeGeometry args={[FACE_PLANE.width, FACE_PLANE.height]} />
        <meshBasicMaterial ref={faceMaterial} map={textures.neutral} transparent toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function Robot3D({ gesture, lipFrame = 0 }: { readonly gesture: RobotGesture; readonly lipFrame?: number }): React.JSX.Element {
  return (
    <div className="robot-canvas" data-robot-3d="true" data-gesture={gesture} data-lip-frame={lipFrame}>
      <Canvas
        camera={{ position: [0, 0.62, 2], fov: 33 }}
        dpr={[1.5, 2]}
        gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" }}
        onCreated={({ camera }) => camera.lookAt(0, 0.5, 0)}
      >
        <ambientLight intensity={0.9} />
        <hemisphereLight args={["#dff3ff", "#9db6cc", 0.55]} />
        <directionalLight position={[3, 5, 2]} intensity={1.15} />
        <directionalLight position={[-2.4, 2.2, 1.4]} intensity={0.4} />
        <Suspense fallback={null}>
          <RobotModel gesture={gesture} lipFrame={lipFrame} />
        </Suspense>
      </Canvas>
    </div>
  );
}

useGLTF.preload(MODEL_URL);
