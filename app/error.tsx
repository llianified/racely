'use client'

import { useEffect } from 'react'
import { ArrowUpRight, RotateCcw, ShieldCheck, Wrench } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { GateFrame } from '@/components/game/shell/gate-frame'

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
    <GateFrame
      titleId="error-title"
      label="Jeda teknis"
      status="Pemulihan"
      icon={Wrench}
      title={<>Ada yang tersendat.<br /><span>Bukan akhir balapan.</span></>}
      description="Muat ulang layar untuk melanjutkan balapan dari progres yang tersimpan."
      actions={(
        <>
          <Button variant="gold" size="lg" className="w-full whitespace-normal" onClick={reset}>
            <RotateCcw data-icon="inline-start" />
            Muat ulang layar
          </Button>
          <a
            href="https://t.me/RacelyBot?startapp=play"
            className={buttonVariants({ variant: 'outline', size: 'lg', className: 'w-full whitespace-normal' })}
          >
            Buka ulang dari @RacelyBot
            <ArrowUpRight data-icon="inline-end" />
          </a>
        </>
      )}
      note="Masih tersendat? Tutup Mini App dan buka lagi dari bot."
    >
      <div className="gate-session">
        <ShieldCheck aria-hidden="true" />
        <div>
          <p className="gate-session-title">Progres tersimpan di server</p>
          <p className="gate-session-description">Koin, level, dan mobilmu tidak direset saat memuat ulang layar.</p>
        </div>
      </div>
      {/*
        Detail teknisnya IKUT ditampilkan, dilipat. Racely berjalan di dalam
        WebView Telegram: tidak ada devtools, tidak ada console yang bisa
        dibuka pemain, dan `digest` hanya terisi untuk kegagalan di server --
        jadi kegagalan di sisi client tidak meninggalkan satu pun keterangan
        yang bisa dibaca siapa pun. Tanpa baris ini, satu-satunya laporan yang
        bisa dikirim pemain adalah "garasi error", dan itu tidak cukup untuk
        memperbaiki apa pun.
      */}
      <details className="gate-details">
        <summary>Detail teknis</summary>
        <p>{error.name}: {error.message}</p>
        {error.digest && <p>Kode: {error.digest}</p>}
      </details>
    </GateFrame>
  )
}
