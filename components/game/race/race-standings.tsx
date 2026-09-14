import type { GameState } from '@/lib/game'
import { opponentDistance } from '@/lib/race-opponents'

export function RaceStandings({ game }: { game: GameState }) {
  const rivals = game.rivals
  const opponents = rivals?.opponents ?? []
  const message = rivals?.status === 'unavailable'
    ? 'Data lawan belum tersedia. Sinkronisasi akan mencoba lagi.'
    : rivals?.status === 'preview'
      ? 'Preview tanpa lawan buatan. Lawan asli tersedia di sesi Telegram.'
      : !opponents.length
        ? 'Belum ada lawan di peringkat terdekat. Tidak ada bot pengganti.'
        : 'Lawan dari peringkat lap terdekat. Gerak diproyeksikan dari progres server, bukan multiplayer langsung.'
  return <section className="border-t border-border px-md py-sm text-small" aria-label="Lawan dari peringkat terdekat">
    <div className="flex items-center justify-between gap-sm">
      <h3 className="font-semibold">Lawan terdekat</h3>
      <span className="text-muted-foreground">Peringkatmu {rivals?.rank ? `#${rivals.rank}` : '—'}</span>
    </div>
    {opponents.length > 0 && <ul className="mt-sm flex flex-col gap-sm">
      {opponents.map(opponent => {
        const gap = opponentDistance(opponent, game.economy, rivals?.elapsedSeconds) - game.laps - game.progress
        return <li key={opponent.id} className="flex items-center gap-sm">
          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: opponent.color }} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate"><span className="text-muted-foreground">#{opponent.rank}</span> {opponent.name}</span>
          <span className="shrink-0 tabular-nums text-muted-foreground">{Math.abs(gap).toLocaleString('id-ID', { maximumFractionDigits: 1 })} lap {gap >= 0 ? 'di depan' : 'di belakang'}</span>
        </li>
      })}
    </ul>}
    <p className="mt-sm text-muted-foreground">{message}</p>
  </section>
}
