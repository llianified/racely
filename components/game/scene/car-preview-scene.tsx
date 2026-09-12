'use client'

import { useRef, useSyncExternalStore } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, OrthographicCamera } from '@react-three/drei'
import type * as THREE from 'three'
import { COLORS, MiniCar } from './mini-car'
import { CarLighting } from './car-lighting'
import type { CarModelId } from '@/lib/car-catalog'
import type { GameState } from '@/lib/game'

type CarPreviewProps = {
  color: string
  model?: CarModelId
  levels?: GameState['levels']
  equipped?: NonNullable<GameState['bodyParts']>['equipped']
  inspect?: boolean
  active?: boolean
  interactive?: boolean
}

function subscribeMotion(onChange: () => void) {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)')
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

function Turntable({ color, model, levels, inspect, equipped, interactive }: CarPreviewProps) {
  const group = useRef<THREE.Group>(null)
  const reducedMotion = useSyncExternalStore(subscribeMotion, () => window.matchMedia('(prefers-reduced-motion: reduce)').matches, () => true)
  useFrame((_, delta) => {
    if (group.current && !document.hidden && !interactive && !reducedMotion) group.current.rotation.y += Math.min(delta, .05) * .45
  })
  return <group ref={group} rotation={[0, .6, 0]}><MiniCar color={color} model={model} levels={levels} inspect={inspect} equipped={equipped} /></group>
}

function ShopCamera() {
  const { size } = useThree()
  return <>
    <OrthographicCamera makeDefault position={[1.6, 1.1, 1.9]} zoom={Math.min(size.width / 1.25, size.height / .95)} near={.1} far={40} />
    <OrbitControls makeDefault enablePan={false} enableZoom={false} enableDamping={false} minPolarAngle={.15} maxPolarAngle={Math.PI / 2.1} />
  </>
}

export default function CarPreviewScene({ color, model, levels, inspect, equipped, interactive = false, active = true }: CarPreviewProps) {
  return (
    <Canvas
      orthographic
      dpr={[1, 1.25]}
      camera={{ position: [1.6, 1.1, 1.9], zoom: 112, near: .1, far: 40 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'default' }}
      frameloop={active ? 'always' : 'never'}
    >
      {interactive && <ShopCamera />}
      <CarLighting />
      <ambientLight intensity={.35} />
      <hemisphereLight args={[COLORS.white, COLORS.navy, .65]} />
      <directionalLight position={[2, 5, 3]} intensity={2.2} />
      <directionalLight position={[-3, 2, -2]} intensity={.9} color={COLORS.white} />
      <group position={[0, -.12, 0]}>
        <Turntable color={color} model={model} levels={levels} inspect={inspect} equipped={equipped} interactive={interactive} />
      </group>
    </Canvas>
  )
}
