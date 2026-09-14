'use client'

import { Component, useEffect, type ReactNode } from 'react'
import { useThree } from '@react-three/fiber'

/**
 * Dua penjaga yang dipakai BERSAMA oleh `race-scene.tsx` dan
 * `car-preview-scene.tsx`. Keduanya lahir di arena; preview garasi lama tidak
 * punya keduanya sama sekali, jadi context yang hilang di sana berakhir sebagai
 * halaman putih tanpa jalan kembali. Menyalinnya berarti dua versi yang bisa
 * berbeda diam-diam, jadi satu-satunya salinan tinggal di sini.
 */

/**
 * Membangun Canvas bisa MELEMPAR saat render -- driver menolak memberi context
 * WebGL, atau context yang sudah dipegang hilang di tengah commit. Tanpa
 * boundary, lemparan itu naik sampai akar dan membongkar seluruh app: pemain
 * melihat halaman kosong, bukan panel yang rusak.
 *
 * Fallback-nya diserahkan pemanggil: arena dan garasi punya tata letak dan
 * kalimat yang berbeda, dan boundary ini tidak perlu tahu keduanya.
 */
export class SceneBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/**
 * Tanpa preventDefault: itu meminta browser menyiapkan context restoration
 * lewat 'webglcontextrestored', padahal onLost() membongkar Canvas-nya dan
 * retry membangun context yang benar-benar baru. Memintanya lalu pergi cuma
 * menyuruh browser menyiapkan sesuatu yang tidak akan pernah dipakai.
 */
export function ContextMonitor({ onLost }: { onLost: () => void }) {
  const { gl } = useThree()
  useEffect(() => {
    const canvas = gl.domElement
    const lost = () => onLost()
    canvas.addEventListener('webglcontextlost', lost)
    return () => canvas.removeEventListener('webglcontextlost', lost)
  }, [gl, onLost])
  return null
}
