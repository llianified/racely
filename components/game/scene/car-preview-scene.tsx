'use client'

import { useEffect, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, OrthographicCamera } from '@react-three/drei'
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
}

function PreviewCar({ color, model, levels, inspect, equipped }: CarPreviewProps) {
  return <group rotation={[0, -.35, 0]}><MiniCar color={color} model={model} levels={levels} inspect={inspect} equipped={equipped} /></group>
}

function PreviewCamera() {
  const { size } = useThree()
  return <>
    <OrthographicCamera makeDefault position={[1.6, 1.1, 1.9]} zoom={Math.min(size.width / 1.15, size.height / .8)} near={.1} far={40} />
    <OrbitControls makeDefault enablePan={false} enableZoom={false} enableDamping={false} minPolarAngle={.15} maxPolarAngle={Math.PI / 2.1} />
  </>
}

export default function CarPreviewScene({ color, model, levels, inspect, equipped, active = true }: CarPreviewProps) {
  const [ready, setReady] = useState(false)

  /**
   * Sama seperti race-scene: preview DILEPAS saat tab Garasi tidak aktif.
   * `garageMounted` di game-dashboard tidak pernah kembali false, jadi tanpa ini
   * preview tetap memegang WebGL context-nya sementara arena membangun
   * miliknya -- dua context hidup bersamaan, persis kondisi yang membunuh
   * renderer WebView di perangkat kelas bawah.
   */
  useEffect(() => {
    if (active) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(false)
  }, [active])

  if (!active) {
    return (
      <div className="car-preview-root">
        <div className="scene-loading car-preview-loading" role="status">
          <strong>Preview dijeda.</strong>
          <span>Buka tab Garasi untuk menyalakannya lagi.</span>
        </div>
      </div>
    )
  }

  return (
    <div className="car-preview-root">
      {!ready && (
        <div className="scene-loading car-preview-loading" role="status">
          <strong>Menyiapkan mobil 3D…</strong>
          <span>Preview segera tampil.</span>
        </div>
      )}
      <Canvas
        orthographic
        dpr={[1, 1.25]}
        camera={{ position: [1.6, 1.1, 1.9], zoom: 112, near: .1, far: 40 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'default' }}
        frameloop="demand"
        onCreated={() => setReady(true)}
        aria-label="Preview mobil 3D. Geser untuk memutar."
      >
        <PreviewCamera />
        <CarLighting />
        <ambientLight intensity={.35} />
        <hemisphereLight args={[COLORS.white, COLORS.navy, .65]} />
        <directionalLight position={[2, 5, 3]} intensity={2.2} />
        <directionalLight position={[-3, 2, -2]} intensity={.9} color={COLORS.white} />
        <group position={[0, -.12, 0]}>
          <PreviewCar color={color} model={model} levels={levels} inspect={inspect} equipped={equipped} />
        </group>
      </Canvas>
      {ready && <span className="car-preview-hint">Geser untuk memutar</span>}
    </div>
  )
}
