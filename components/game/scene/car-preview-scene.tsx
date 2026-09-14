'use client'

import { useCallback, useEffect, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, OrthographicCamera } from '@react-three/drei'
import { CarFront, RotateCcw } from 'lucide-react'
import { COLORS, MiniCar } from './mini-car'
import { CarLighting } from './car-lighting'
import { ContextMonitor, SceneBoundary } from './scene-recovery'
import type { CarModelId } from '@/lib/car-catalog'
import type { GameState } from '@/lib/game'

type CarPreviewProps = {
  color: string
  model?: CarModelId
  levels?: GameState['levels']
  equipped?: NonNullable<GameState['bodyParts']>['equipped']
  inspect?: boolean
  active?: boolean
  /**
   * Kalimat kedua pada plakat "Preview dijeda". Panggung yang sama dijeda oleh
   * dua sebab yang berbeda -- pemain pindah tab, atau sebuah sheet mengambil
   * alih layar -- dan menyuruh pemain "buka tab Garasi" padahal ia sedang
   * BERADA di sana adalah petunjuk yang salah.
   */
  standbyHint?: string
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

/**
 * Gagalnya preview TIDAK boleh mengosongkan garasi. Sebelum ini satu-satunya
 * penanganan adalah tidak ada: context yang ditolak driver melempar saat render
 * dan lemparannya naik sampai akar, jadi pemain mendapat halaman putih --
 * bukan panggung yang bilang "coba lagi" sementara sisa garasinya tetap utuh.
 */
function PreviewError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="scene-loading car-preview-loading" role="alert">
      <CarFront aria-hidden="true" />
      <strong>Preview 3D perlu dinyalakan ulang.</strong>
      <span>Mobil dan progresmu tetap aman. Sisa garasi bisa dipakai seperti biasa.</span>
      <button type="button" onClick={onRetry} className="flex items-center gap-sm">
        <RotateCcw className="size-(--icon-sm)" aria-hidden="true" />Muat ulang preview
      </button>
    </div>
  )
}

export default function CarPreviewScene({ color, model, levels, inspect, equipped, active = true, standbyHint = 'Buka tab Garasi untuk menyalakannya lagi.' }: CarPreviewProps) {
  const [ready, setReady] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [lost, setLost] = useState(false)
  const onLost = useCallback(() => setLost(true), [])
  const retry = () => { setReady(false); setLost(false); setAttempt(value => value + 1) }

  /**
   * Sama seperti race-scene: preview DILEPAS saat panggungnya tidak aktif.
   * `garageMounted` di game-dashboard tidak pernah kembali false, jadi tanpa ini
   * preview tetap memegang WebGL context-nya sementara arena membangun
   * miliknya -- dua context hidup bersamaan, persis kondisi yang membunuh
   * renderer WebView di perangkat kelas bawah.
   *
   * `active` juga dimatikan pemanggil saat sheet modifikasi atau toko aero
   * terbuka: sheet itu membawa panggung 3D-nya SENDIRI dan menutupi panggung
   * garasi sepenuhnya, jadi membiarkan keduanya hidup berarti dua context lagi
   * -- kali ini di dalam satu tab.
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
          <span>{standbyHint}</span>
        </div>
      </div>
    )
  }

  if (lost) {
    return <div className="car-preview-root"><PreviewError onRetry={retry} /></div>
  }

  return (
    <div className="car-preview-root">
      {!ready && (
        <div className="scene-loading car-preview-loading" role="status">
          <strong>Menyiapkan mobil 3D…</strong>
          <span>Preview segera tampil.</span>
        </div>
      )}
      <SceneBoundary key={attempt} fallback={<PreviewError onRetry={retry} />}>
        <Canvas
          orthographic
          dpr={[1, 1.25]}
          camera={{ position: [1.6, 1.1, 1.9], zoom: 112, near: .1, far: 40 }}
          gl={{ antialias: true, alpha: true, powerPreference: 'default' }}
          frameloop="demand"
          fallback={<PreviewError onRetry={retry} />}
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
          <ContextMonitor onLost={onLost} />
        </Canvas>
      </SceneBoundary>
      {ready && <span className="car-preview-hint">Geser untuk memutar</span>}
    </div>
  )
}
