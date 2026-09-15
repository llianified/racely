'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Html, OrbitControls, OrthographicCamera } from '@react-three/drei'
import * as THREE from 'three'
import { TECHNICAL_TRACK, TECHNICAL_TRACK_SAMPLES, technicalTrackPoint } from '@/lib/technical-track'
import { MiniCar } from './mini-car'
import { ContextMonitor, createSafePointerEvents, SceneBoundary } from './scene-recovery'

const HALF_WIDTH = TECHNICAL_TRACK.laneWidth * 1.5
const JOINT_COUNT = Math.ceil(TECHNICAL_TRACK.totalLength / .65)

function TrackBand({ from, to, height, color, y = 0 }: { from: number; to: number; height: number; color: string; y?: number }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape()
    const hole = new THREE.Path()
    TECHNICAL_TRACK_SAMPLES.forEach((progress, index) => {
      const outer = technicalTrackPoint(progress, from)
      const inner = technicalTrackPoint(TECHNICAL_TRACK_SAMPLES[TECHNICAL_TRACK_SAMPLES.length - 1 - index], to)
      if (index === 0) {
        shape.moveTo(outer.x, -outer.z)
        hole.moveTo(inner.x, -inner.z)
      } else {
        shape.lineTo(outer.x, -outer.z)
        hole.lineTo(inner.x, -inner.z)
      }
    })
    shape.closePath()
    hole.closePath()
    shape.holes.push(hole)
    return new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, steps: 1 })
  }, [from, to, height])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]}>
    <meshStandardMaterial color={color} roughness={.75} />
  </mesh>
}

function InspectionCamera({ topDown }: { topDown: boolean }) {
  const { size } = useThree()
  return <>
    <OrthographicCamera makeDefault position={topDown ? [2.5, 24, 3.401] : [12, 18, 17]} zoom={Math.min(size.width / 15, size.height / 14)} near={.1} far={80} />
    <OrbitControls key={String(topDown)} makeDefault target={[2.5, 0, 3.4]} enableRotate={!topDown} enablePan={false} enableZoom={false} enableDamping={false} maxPolarAngle={Math.PI / 2.4} />
  </>
}

function Track({ progress, lane }: { progress: number; lane: number }) {
  const offset = TECHNICAL_TRACK.laneOffsets[lane]
  const car = technicalTrackPoint(progress, offset)
  const start = technicalTrackPoint(0)
  return <>
    <TrackBand from={-HALF_WIDTH - .08} to={HALF_WIDTH + .08} height={.08} color="#302952" />
    {TECHNICAL_TRACK.laneOffsets.map((offset, index) => <TrackBand key={offset} from={offset - .23} to={offset + .23} height={.025} y={.08} color={index === 1 ? '#494078' : '#302952'} />)}
    {[-HALF_WIDTH, -.23, .23, HALF_WIDTH].map(offset => <TrackBand key={offset} from={offset - .025} to={offset + .025} height={.22} y={.08} color="#b2a5d9" />)}
    <TrackBand from={offset - .018} to={offset + .018} height={.004} y={.107} color="#ffce00" />
    {Array.from({ length: JOINT_COUNT }, (_, index) => {
      const pose = technicalTrackPoint(index / JOINT_COUNT)
      return <mesh key={index} position={[pose.x, .106, pose.z]} rotation={[0, -pose.heading, 0]}>
        <boxGeometry args={[.016, .004, HALF_WIDTH * 2]} />
        <meshStandardMaterial color="#090c1d" />
      </mesh>
    })}
    <group position={[start.x, .115, start.z]} rotation={[0, -start.heading, 0]}>
      {Array.from({ length: 12 }, (_, index) => <mesh key={index} position={[(Math.floor(index / 6) - .5) * .15, 0, (index % 6 - 2.5) * .23]}>
        <boxGeometry args={[.15, .012, .23]} />
        <meshStandardMaterial color={(index % 6 + Math.floor(index / 6)) % 2 ? '#090c1d' : '#f9f8ff'} />
      </mesh>)}
      <Html position={[0, .1, -1.1]} center><span className="whitespace-nowrap rounded-md bg-background px-sm py-xs text-small font-bold text-accent">START / FINISH →</span></Html>
    </group>
    <group position={[car.x, .115, car.z]} rotation={[0, Math.PI / 2 - car.heading, 0]}>
      <MiniCar color="#ffce00" model="neo-falcon" scale={.48} />
    </group>
  </>
}

export default function TechnicalTrackScene({ progress, lane, topDown }: { progress: number; lane: number; topDown: boolean }) {
  const [attempt, setAttempt] = useState(0)
  const [lost, setLost] = useState(false)
  const onLost = useCallback(() => setLost(true), [])
  const fallback = <div role="alert" className="flex h-full flex-col justify-center gap-md p-lg text-read">
    <p>Preview 3D tidak tersedia.</p>
    <button type="button" className="underline" onClick={() => { setLost(false); setAttempt(value => value + 1) }}>Muat ulang preview</button>
  </div>
  if (lost) return fallback
  return <SceneBoundary key={attempt} fallback={fallback}>
    <Canvas orthographic dpr={[1, 1.5]} events={createSafePointerEvents} frameloop="demand" gl={{ antialias: true }} fallback={fallback} aria-label="Prototype Mini 4WD tiga jalur dengan S-curve dan hairpin; gunakan slider untuk inspeksi posisi.">
      <ContextMonitor onLost={onLost} />
      <color attach="background" args={['#1a1939']} />
      <ambientLight intensity={1.6} />
      <directionalLight position={[4, 12, -3]} intensity={2.5} />
      <InspectionCamera topDown={topDown} />
      <Track progress={progress} lane={lane} />
    </Canvas>
  </SceneBoundary>
}
