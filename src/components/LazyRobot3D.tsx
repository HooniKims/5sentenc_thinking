import { lazy, Suspense } from "react";
import type { RobotGesture } from "./Robot3D";

const Robot3D = lazy(async () => {
  const module = await import("./Robot3D");
  return { default: module.Robot3D };
});

interface LazyRobot3DProps {
  readonly gesture: RobotGesture;
  readonly lipFrame?: number;
}

export function LazyRobot3D({ gesture, lipFrame }: LazyRobot3DProps): React.JSX.Element {
  const robot = lipFrame === undefined
    ? <Robot3D gesture={gesture} />
    : <Robot3D gesture={gesture} lipFrame={lipFrame} />;

  return (
    <Suspense fallback={<div aria-hidden="true" className="robot-canvas" data-testid="robot-loading" />}>
      {robot}
    </Suspense>
  );
}
