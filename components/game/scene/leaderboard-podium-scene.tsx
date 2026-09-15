"use client";

import { useCallback, useState, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrthographicCamera } from "@react-three/drei";
import { CAR_CATALOG } from "@/lib/car-catalog";
import { leaderboardCar, type LeaderboardEntry } from "@/lib/leaderboard";
import { COLORS, MiniCar } from "./mini-car";
import { CarLighting } from "./car-lighting";
import { ContextMonitor, SceneBoundary } from "./scene-recovery";

function PodiumCar({ entry }: { entry: LeaderboardEntry }) {
  // Tampilan terpasang pemain kalau server mengirimnya; respons server lama
  // hanya membawa model, jadi mobilnya jatuh ke warna standar katalog.
  const car = leaderboardCar(entry);
  if (car) return <MiniCar model={car.model} color={car.color} levels={car.levels} equipped={car.equipped} roller={car.roller} />;
  if (entry.carModel) return <MiniCar model={entry.carModel} color={CAR_CATALOG[entry.carModel].defaultColor} />;
  return null;
}

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
            <group position={[0, height + .045, 0]} rotation={[0, -.25, 0]}>
              <PodiumCar entry={entry} />
            </group>
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
  );
}
