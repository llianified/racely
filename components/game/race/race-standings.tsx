import type { GameState } from '@/lib/game'
import { raceOrder } from '@/lib/race-opponents'

export function RaceStandings({ game }: { game: GameState }) {
  const rivals = game.rivals
  const opponents = rivals?.opponents ?? []
  const distance = game.laps + game.progress
  const entries = raceOrder(distance, rivals, game.economy)
  const message = rivals?.status === 'unavailable'
    ? 'Data lawan belum tersedia. Sinkronisasi akan mencoba lagi.'
    : rivals?.status === 'preview'
      ? 'Preview tanpa lawan buatan. Lawan asli tersedia di sesi Telegram.'
      : !opponents.length
        ? 'Belum ada lawan di peringkat terdekat. Tidak ada bot pengganti.'
        : `${opponents.length < 2 ? 'Baru satu lawan asli tersedia. ' : ''}Lawan dari peringkat lap terdekat. Gerak diproyeksikan dari server, bukan multiplayer langsung.`
  return <section className="border-t border-border px-md py-sm text-small" aria-label="Lawan dari peringkat terdekat">
    <div className="flex items-center justify-between gap-sm">
      <h3 className="font-semibold">Posisi arena</h3>
      <span className="text-muted-foreground">Peringkat global {rivals?.rank ? `#${rivals.rank}` : '—'}</span>
    </div>
    {opponents.length > 0 && <ol className="mt-sm flex flex-col gap-sm">
      {entries.map(({ opponent, distance: racerDistance }, index) => {
        const gap = racerDistance - distance
        const tied = Math.abs(gap) < 1e-8
        return <li key={opponent?.id ?? 'player'} className="flex items-center gap-sm" aria-current={!opponent ? 'true' : undefined}>
          <span className="shrink-0 tabular-nums">P{index + 1}</span>
          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: opponent?.color ?? game.color }} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{opponent ? <><span className="text-muted-foreground">#{opponent.rank}</span> {opponent.name}</> : <strong>Kamu</strong>}</span>
          <span className="shrink-0 tabular-nums text-muted-foreground">{!opponent ? `${game.laps.toLocaleString('id-ID')} lap` : tied ? 'Sejajar' : `${Math.abs(gap).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} lap ${gap > 0 ? 'depan' : 'belakang'}`}</span>
        </li>
      })}
    </ol>}
    <p className="mt-sm text-muted-foreground">{message}</p>
  </section>
}
