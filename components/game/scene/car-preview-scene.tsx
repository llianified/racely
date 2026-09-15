'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import type { Group } from 'three'
import { PreviewZoomControls, usePreviewZoom } from '../car/preview-zoom-controls'
import { PreviewCamera, type PreviewCameraControls } from './preview-camera'
import { measurePreview, previewFitZoom } from './car-preview-framing'
import { CarFront, RotateCcw } from 'lucide-react'
import { COLORS, MiniCar } from './mini-car'
import { CarLighting } from './car-lighting'
import { ContextMonitor, createSafePointerEvents, SceneBoundary } from './scene-recovery'
import type { CarModelId } from '@/lib/car-catalog'
import type { GameState } from '@/lib/game'

type CarPreviewProps = {
  color: string
  model?: CarModelId
  roller?: NonNullable<GameState['setup']>['roller']
  levels?: GameState['levels']
  equipped?: NonNullable<GameState['bodyParts']>['equipped']
  inspect?: boolean
  interactive?: boolean
  active?: boolean
  /**
   * Kalimat kedua pada plakat "Preview dijeda". Panggung yang sama dijeda oleh
   * dua sebab yang berbeda -- pemain pindah tab, atau sebuah sheet mengambil
   * alih layar -- dan menyuruh pemain "buka tab Garasi" padahal ia sedang
   * BERADA di sana adalah petunjuk yang salah.
   */
  standbyHint?: string
  /**
   * Dipanggil sekali panggungnya benar-benar berdiri (atau menyerah). Onboarding
   * memakainya untuk menahan boot screen sampai mobilnya siap, bukan menampilkan
   * layar kosong yang masih memuat.
   */
  onReady?: () => void
}

function PreviewCar({ color, model, levels, inspect, equipped, roller }: CarPreviewProps) {
  return <group rotation={[0, -.35, 0]}><MiniCar roller={roller} color={color} model={model} levels={levels} inspect={inspect} equipped={equipped} /></group>
}

/** Dipakai sampai pengukuran pertama selesai; seukuran bodi standar. */
const FALLBACK_BOUNDS = { width: 1.6, height: 1.6, safeWidth: 1.6, safeHeight: 1.6 }

/**
 * Mengukur mobil yang sedang tampil lalu menggeser porosnya ke titik tengah
 * batas geometrinya. Ukuran bodi berubah menurut model, level, dan aero kit yang
 * terpasang, jadi angka mati tidak pernah cocok untuk semua kombinasi --
 * apalagi ketika pemain memutarnya.
 */
export function FittedCar(props: CarPreviewProps & PreviewCameraControls) {
  const car = useRef<Group>(null)
  const [bounds, setBounds] = useState(FALLBACK_BOUNDS)
  const size = useThree(state => state.size)
  const invalidate = useThree(state => state.invalidate)
  const { model, inspect } = props
  // Bentuk dari level/part datang sebagai objek baru tiap render; yang menandai
  // perubahan ukuran adalah isinya, bukan identitasnya.
  const shape = JSON.stringify([props.levels, props.equipped, props.roller])

  useLayoutEffect(() => {
    const group = car.current
    if (!group) return
    group.position.set(0, 0, 0)
    const measured = measurePreview(group)
    group.position.copy(measured.center).negate()
    setBounds({ width: measured.width, height: measured.height, safeWidth: measured.safeWidth, safeHeight: measured.safeHeight })
    invalidate()
  }, [model, shape, inspect, invalidate])

  return <>
    <PreviewCamera baseZoom={previewFitZoom(size.width, size.height, bounds)} interactive={props.interactive ?? true} zoom={props.zoom} resetKey={props.resetKey} onZoomChange={props.onZoomChange} />
    <group ref={car}><PreviewCar {...props} /></group>
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

export default function CarPreviewScene({ color, model, levels, inspect, equipped, roller, interactive = true, active = true, standbyHint = 'Buka tab Garasi untuk menyalakannya lagi.', onReady }: CarPreviewProps) {
  const zoomControls = usePreviewZoom()
  const [ready, setReady] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [lost, setLost] = useState(false)
  const onLost = useCallback(() => { setLost(true); onReady?.() }, [onReady])
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
        <div className="car-preview-viewport">
        <Canvas
          orthographic
          dpr={[1, 1.25]}
          events={createSafePointerEvents}
          camera={{ position: [1.6, 1.1, 1.9], zoom: 112, near: .1, far: 40 }}
          gl={{ antialias: true, alpha: true, powerPreference: 'default' }}
          frameloop="demand"
          fallback={<PreviewError onRetry={retry} />}
          onCreated={() => { setReady(true); onReady?.() }}
          aria-label={interactive ? 'Preview mobil 3D. Geser untuk memutar, cubit atau scroll untuk zoom.' : 'Preview mobil 3D.'}
        >
          <CarLighting />
          <ambientLight intensity={.35} />
          <hemisphereLight args={[COLORS.white, COLORS.navy, .65]} />
          <directionalLight position={[2, 5, 3]} intensity={2.2} />
          <directionalLight position={[-3, 2, -2]} intensity={.9} color={COLORS.white} />
          <FittedCar roller={roller} color={color} model={model} levels={levels} inspect={inspect} equipped={equipped} interactive={interactive} zoom={zoomControls.zoom} resetKey={zoomControls.resetKey} onZoomChange={zoomControls.onZoomChange} />
          <ContextMonitor onLost={onLost} />
        </Canvas>
        </div>
        {interactive && ready && <PreviewZoomControls {...zoomControls} />}
      </SceneBoundary>
    </div>
  )
}
