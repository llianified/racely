'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useState } from 'react'
import { TECHNICAL_TRACK, technicalTrackPoint } from '@/lib/technical-track'

const TechnicalTrackScene = dynamic(() => import('../scene/technical-track-scene'), {
  ssr: false,
  loading: () => <p role="status" className="p-lg text-muted-foreground">Menyiapkan prototype 3D…</p>,
})

export function TechnicalTrackPreview() {
  const [progress, setProgress] = useState(0)
  const [topDown, setTopDown] = useState(true)
  const [lane, setLane] = useState(1)
  const pose = technicalTrackPoint(progress, TECHNICAL_TRACK.laneOffsets[lane])
  const section = TECHNICAL_TRACK.sections.find(section => section.id === pose.sectionId)!

  return <main className="mx-auto flex min-h-svh w-full max-w-(--app-width) flex-col gap-md p-lg text-read">
    <header className="flex flex-col gap-sm">
      <Link href="/" className="text-muted-foreground underline">Kembali ke Racely</Link>
      <p className="text-small font-bold text-accent">DEVELOPMENT · VISUAL ONLY</p>
      <h1 className="text-display font-bold">Technical circuit / 03</h1>
      <p className="text-small text-muted-foreground">Calon sirkuit, belum aktif. Tidak ada race, reward, boost, atau settlement.</p>
    </header>
    <figure className="flex flex-col gap-sm">
      <div className="aspect-square w-full overflow-hidden rounded-lg border border-border bg-card">
        <TechnicalTrackScene progress={progress} lane={lane} topDown={topDown} />
      </div>
      <figcaption className="text-small text-muted-foreground">START → straight → technical corner → S-curve → hairpin → straight → FINISH. Garis emas = racing line jalur terpilih.</figcaption>
    </figure>
    <div className="flex flex-wrap items-center gap-lg">
      <label className="flex items-center gap-sm"><input type="checkbox" checked={topDown} onChange={event => setTopDown(event.target.checked)} />Tampak atas</label>
      <label className="flex items-center gap-sm">Jalur
        <select className="rounded-md border border-border bg-card p-sm" value={lane} onChange={event => setLane(Number(event.target.value))}>
          {TECHNICAL_TRACK.laneOffsets.map((_, index) => <option key={index} value={index}>{index + 1}</option>)}
        </select>
      </label>
    </div>
    <label className="flex flex-col gap-sm" htmlFor="track-progress">
      <span>Inspeksi posisi · {Math.round(progress * 100)}% · {section.label}</span>
      <input id="track-progress" className="w-full accent-accent" type="range" min="0" max="1000" value={Math.round(progress * 1000)} onChange={event => setProgress(Number(event.target.value) / 1000)} aria-valuetext={`${Math.round(progress * 100)} persen, ${section.label}`} />
    </label>
    <p className="text-small text-muted-foreground">Slider hanya memindahkan mobil contoh di sepanjang geometri, bukan waktu putaran atau simulasi fisika.</p>
    <details className="rounded-lg border border-border p-md text-small">
      <summary className="cursor-pointer font-bold">Kontrak section & batas integrasi</summary>
      <ol className="flex list-inside list-decimal flex-col gap-sm py-md">
        {TECHNICAL_TRACK.sections.map(section => <li key={section.id}>
          <strong>{section.label}</strong> · {(section.lengthFraction * 100).toFixed(1)}% panjang centerline
          <p className="text-muted-foreground">{section.geometry.map(part => part.kind === 'line' ? `Lurus ${part.length.toFixed(2)} unit` : `${part.turn > 0 ? 'Kanan' : 'Kiri'} ${Math.round(Math.abs(part.turn) * 180 / Math.PI)}° / R${part.radius}`).join(' → ')}</p>
        </li>)}
      </ol>
      <p>Severity belum dikalibrasi. Server perlu mengadopsi batas section, panjang per jalur, tikungan dan arah sebelum circuit ini boleh diaktifkan; geometri ini tidak menentukan performa setup.</p>
    </details>
  </main>
}
