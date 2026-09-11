'use client'

import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import type * as THREE from 'three'
import { COLORS, MiniCar } from './mini-car'
import type { CarModelId } from '@/lib/car-catalog'

type CarPreviewProps = { color: string; model?: CarModelId }

function Turntable({ color, model }: CarPreviewProps) {
  const group = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    if (group.current && !document.hidden) group.current.rotation.y += delta * .45
  })
  return <group ref={group} rotation={[0, .6, 0]}><MiniCar color={color} model={model} /></group>
}

export default function CarPreviewScene({ color, model }: CarPreviewProps) {
  return (
    <Canvas
      orthographic
      dpr={[1, 1.25]}
      camera={{ position: [1.6, 1.1, 1.9], zoom: 112, near: .1, far: 40 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'default' }}
    >
      <ambientLight intensity={1.1} />
      <hemisphereLight args={[COLORS.white, COLORS.navy, 1.2]} />
      <directionalLight position={[2, 5, 3]} intensity={2.4} />
      <directionalLight position={[-3, 2, -2]} intensity={1.4} color={COLORS.blue} />
      <group position={[0, -.12, 0]}>
        <Turntable color={color} model={model} />
      </group>
    </Canvas>
  )
}
