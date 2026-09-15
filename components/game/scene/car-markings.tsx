'use client'

import { memo } from 'react'
import * as THREE from 'three'
import type { CarModelId } from '@/lib/car-catalog'

type Marking = 'brand' | '01' | '02' | '03'

/**
 * Cache level-modul, DISENGAJA tidak pernah di-dispose.
 *
 * Isinya paling banyak tiga texture dan dipakai bersama oleh race-scene dan
 * car-preview-scene, yang bisa ter-mount bersamaan. Membuang salah satunya saat
 * satu scene unmount akan mengosongkan marking di scene yang masih hidup, jadi
 * "memperbaiki kebocoran" di sini justru merusak. Jumlahnya terbatas dan tidak
 * pernah tumbuh, jadi biarkan.
 *
 * Aman juga menyeberangi context WebGL yang hilang lalu dibuat ulang: Three
 * menyimpan state GPU per-renderer, jadi renderer baru mengunggah ulang texture
 * yang sama tanpa perlu dibuat ulang.
 */
const TEXTURES = new Map<Marking, THREE.CanvasTexture>()

function markingTexture(marking: Marking) {
  const cached = TEXTURES.get(marking)
  if (cached) return cached
  const canvas = document.createElement('canvas')
  const number = marking !== 'brand'
  canvas.width = number ? 128 : 512
  canvas.height = 128
  const ctx = canvas.getContext('2d')!
  if (number) {
    ctx.fillStyle = '#f5f4ef'
    ctx.fillRect(0, 0, 128, 128)
    ctx.fillStyle = '#25282b'
    ctx.font = '900 85px Arial'
    ctx.textAlign = 'center'
    ctx.fillText(marking, 58, 100)
    ctx.fillRect(12, 12, 104, 6)
  } else {
    ctx.fillStyle = '#f5f4ef'
    ctx.font = '900 92px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('RACELY', 250, 96)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  TEXTURES.set(marking, texture)
  return texture
}

function Marking({ text, position, rotation, size }: {
  text: Marking
  position: [number, number, number]
  rotation: [number, number, number]
  size: [number, number]
}) {
  return <mesh position={position} rotation={rotation}>
    <planeGeometry args={size} />
    <meshStandardMaterial map={markingTexture(text)} transparent alphaTest={.1} depthWrite={false} roughness={.5} polygonOffset polygonOffsetFactor={-2} />
  </mesh>
}

export const CarMarkings = memo(function CarMarkings({ model, stockWing }: { model: CarModelId; stockWing: boolean }) {
  const falcon = model === 'neo-falcon'
  const phantom = model === 'phantom-x'
  return <group name="race-markings">
    {[-1, 1].map(side => <Marking key={side} text={falcon ? '01' : phantom ? '03' : '02'}
      position={[side * (falcon ? .209 : phantom ? .229 : .15), phantom ? .203 : .162, falcon ? -.092 : phantom ? -.23 : -.076]}
      rotation={[0, side * Math.PI / 2, 0]} size={[.042, .039]} />)}
    {stockWing && <Marking text="brand" position={[0, falcon ? .318 : phantom ? .384 : .299, -.335]}
      rotation={[-Math.PI / 2, 0, 0]} size={[.18, .042]} />}
  </group>
})
