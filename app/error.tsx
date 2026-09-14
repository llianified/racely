'use client'

import { useEffect } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'

/**
 * Sebelum file ini ada, TIDAK ADA error boundary di seluruh app. Satu lemparan
 * di panel mana pun -- panggung 3D yang contextnya ditolak, sebuah field yang
 * bentuknya tak terduga -- membongkar seluruh pohon React dan meninggalkan
 * halaman putih kosong: tanpa kalimat, tanpa tombol, tanpa petunjuk apa pun
 * bahwa progres pemain masih utuh di server.
 *
 * `reset()` merender ulang segmennya di tempat, jadi pemain yang menekannya
 * tidak kehilangan sesi Telegram-nya. Kalau lemparannya berulang, tautan ke
 * bot tetap disediakan sebagai jalan keluar terakhir.
 */
export default function GameError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Satu-satunya jejak yang tersisa dari kegagalan client di perangkat pemain.
    console.error('Racely gagal dirender:', error)
  }, [error])

  return (
    <main className="game-gate font-sans">
      <section className="panel gate-panel" aria-labelledby="error-title">
        <div className="gate-copy">
          <p className="boot-eyebrow">RACELY</p>
          <h1 id="error-title" className="text-3xl text-balance">
            Ada yang tersendat
          </h1>
          <p role="status" className="text-sm leading-relaxed text-muted-foreground">
            Koin, level, dan mobilmu tersimpan di server — tidak ada yang hilang.
            Muat ulang layar ini untuk melanjutkan.
          </p>
          {error.digest && (
            <p className="text-xs text-muted-foreground">Kode: {error.digest}</p>
          )}
        </div>
        <Button variant="gold" size="lg" className="w-full whitespace-normal" onClick={reset}>
          <RotateCcw data-icon="inline-start" />
          Muat ulang layar
        </Button>
        <a
          href="https://t.me/RacelyBot?startapp=play"
          className={buttonVariants({ variant: 'outline', size: 'lg', className: 'w-full whitespace-normal' })}
        >
          Buka ulang dari @RacelyBot
        </a>
      </section>
    </main>
  )
}
