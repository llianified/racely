"use client";

<<<<<<< HEAD
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
=======
import { useCallback, useState, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrthographicCamera } from "@react-three/drei";
import { CAR_CATALOG } from "@/lib/car-catalog";
import type { LeaderboardEntry } from "@/lib/leaderboard";
import { COLORS, MiniCar } from "./mini-car";
import { CarLighting } from "./car-lighting";
import { ContextMonitor, SceneBoundary } from "./scene-recovery";

function PodiumCars({ entries }: { entries: LeaderboardEntry[] }) {
  const size = useThree((state) => state.size);
  const columnWidth = 1.5;
  const zoom = size.width / (columnWidth * 3);

  return <>
    <OrthographicCamera makeDefault position={[0, .65, 10]} zoom={zoom} near={.1} far={30} />
    {entries.map((entry, index) => {
      const height = index === 0 ? .7 : index === 1 ? .4 : .22;
      const x = index === 0 ? 0 : index === 1 ? -columnWidth : columnWidth;
      const color = entry.rank === 1 ? COLORS.gold : index === 1 ? COLORS.white : COLORS.muted;
      return (
        <group key={index} position={[x, -.4, 0]}>
          <group rotation={[.45, -.35, 0]}>
            <mesh position={[0, height / 2, 0]}>
              <boxGeometry args={[1.14, height, .84]} />
              <meshStandardMaterial color={color} metalness={.45} roughness={.4} />
            </mesh>
            <mesh position={[0, height + .014, 0]}>
              <boxGeometry args={[1.17, .028, .87]} />
              <meshStandardMaterial color={color} metalness={.6} roughness={.3} />
            </mesh>
            {entry.carModel && (
              <group position={[0, height + .045, 0]} rotation={[0, -.25, 0]}>
                <MiniCar model={entry.carModel} color={CAR_CATALOG[entry.carModel].defaultColor} />
              </group>
            )}
          </group>
        </group>
      );
    })}
  </>;
}

export default function LeaderboardPodiumScene({ entries, fallback }: { entries: LeaderboardEntry[]; fallback: ReactNode }) {
  const [lost, setLost] = useState(false);
  const onLost = useCallback(() => setLost(true), []);
  if (lost) return fallback;

  return (
    <SceneBoundary fallback={fallback}>
      <Canvas
        orthographic
        frameloop="demand"
        dpr={[1, 1.25]}
        gl={{ alpha: true, antialias: true, powerPreference: "default" }}
        fallback={fallback}
        aria-label="Mobil tiga besar di atas podium; detail pembalap ada di bawah"
        style={{ pointerEvents: "none" }}
      >
        <CarLighting />
        <ambientLight intensity={.7} />
        <hemisphereLight args={[COLORS.white, COLORS.navy, .8]} />
        <directionalLight position={[2, 5, 4]} intensity={2.5} />
        <directionalLight position={[-3, 2, -2]} intensity={1} color={COLORS.white} />
        <PodiumCars entries={entries} />
        <ContextMonitor onLost={onLost} />
      </Canvas>
    </SceneBoundary>
>>>>>>> origin/main
  );
}
