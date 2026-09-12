'use client'

import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import type * as THREE from 'three'
import { COLORS, MiniCar } from './mini-car'
import { CarLighting } from './car-lighting'
import type { CarModelId } from '@/lib/car-catalog'
import type { GameState } from '@/lib/game'

type CarPreviewProps = {
  color: string
  model?: CarModelId
  levels?: GameState['levels']
  inspect?: boolean
  active?: boolean
}

function Turntable({ color, model, levels, inspect }: CarPreviewProps) {
  const group = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    if (group.current && !document.hidden) group.current.rotation.y += delta * .45
  })
  return <group ref={group} rotation={[0, .6, 0]}><MiniCar color={color} model={model} levels={levels} inspect={inspect} /></group>
}

export default function CarPreviewScene({ color, model, levels, inspect, active = true }: CarPreviewProps) {
  return (
    <Canvas
      orthographic
      dpr={[1, 1.25]}
      camera={{ position: [1.6, 1.1, 1.9], zoom: 112, near: .1, far: 40 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'default' }}
      frameloop={active ? 'always' : 'never'}
    >
      <CarLighting />
      <ambientLight intensity={.35} />
      <hemisphereLight args={[COLORS.white, COLORS.navy, .65]} />
      <directionalLight position={[2, 5, 3]} intensity={2.2} />
      <directionalLight position={[-3, 2, -2]} intensity={.9} color={COLORS.white} />
      <group position={[0, -.12, 0]}>
        <Turntable color={color} model={model} levels={levels} inspect={inspect} />
      </group>
    </Canvas>
  )
}
