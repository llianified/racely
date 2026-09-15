"use client";

import { useEffect, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { View } from "@react-three/drei";
import { FittedCar } from "./car-preview-scene";
import { CarLighting } from "./car-lighting";
import { COLORS } from "./mini-car";
import { ContextMonitor, SceneBoundary } from "./scene-recovery";
import type { leaderboardCar } from "@/lib/leaderboard";

type PodiumCar = NonNullable<ReturnType<typeof leaderboardCar>>;
type Props = {
  cars: (PodiumCar | null)[];
  tracks: RefObject<HTMLDivElement | null>[];
  onReady: () => void;
  onUnavailable: () => void;
};

function Unavailable({ onUnavailable }: Pick<Props, "onUnavailable">) {
  useEffect(onUnavailable, [onUnavailable]);
  return null;
}

function RedrawViews() {
  const invalidate = useThree(state => state.invalidate);
  useEffect(() => {
    const redraw = () => invalidate();
    document.addEventListener("scroll", redraw, true);
    window.addEventListener("resize", redraw);
    return () => {
      document.removeEventListener("scroll", redraw, true);
      window.removeEventListener("resize", redraw);
    };
  }, [invalidate]);
  // View takes over rendering. Clear once before all three scissored views so
  // scrolling or changing a setup cannot leave the previous car behind.
  useFrame(({ gl }) => {
    gl.setScissorTest(false);
    gl.clear();
  }, 0);
  return null;
}

export default function LeaderboardPodiumScene({ cars, tracks, onReady, onUnavailable }: Props) {
  const fallback = <Unavailable onUnavailable={onUnavailable} />;
  // View measures viewport coordinates; a body portal avoids transformed tab
  // containers becoming the containing block of the fixed shared canvas.
  return createPortal(
    <div className="leaderboard-podium-canvas" aria-hidden="true">
      <SceneBoundary fallback={fallback}>
        <Canvas
          orthographic
          dpr={[1, 1.25]}
          frameloop="demand"
          gl={{ antialias: true, alpha: true, powerPreference: "default" }}
          fallback={fallback}
          onCreated={onReady}
        >
          <RedrawViews />
          {cars.map((car, index) => car && (
            <View key={index} index={index + 1} track={tracks[index] as RefObject<HTMLElement>}>
              <CarLighting />
              <ambientLight intensity={.35} />
              <hemisphereLight args={[COLORS.white, COLORS.navy, .65]} />
              <directionalLight position={[2, 5, 3]} intensity={2.2} />
              <directionalLight position={[-3, 2, -2]} intensity={.9} color={COLORS.white} />
              <FittedCar {...car} interactive={false} />
            </View>
          ))}
          <ContextMonitor onLost={onUnavailable} />
        </Canvas>
      </SceneBoundary>
    </div>,
    document.body,
  );
}
