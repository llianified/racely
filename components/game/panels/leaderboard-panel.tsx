"use client";

import { useRef } from "react";
import useSWR from "swr";
import { ArrowRight, Crown, Flag, Medal, RefreshCw, ShieldCheck, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  lapsToOvertake,
  LEADERBOARD_LIMIT,
  LEADERBOARD_REFRESH_MS,
  type Leaderboard,
  type LeaderboardEntry,
} from "@/lib/leaderboard";
import { GameRequestError, isSessionExpired, requestHeaders, type GameKey } from "../game-client";

const number = (value: number) => value.toLocaleString("id-ID");

async function fetchLeaderboard([url, initData]: GameKey): Promise<Leaderboard> {
  const response = await fetch(url, {
    headers: requestHeaders(initData),
    credentials: "same-origin",
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null) as { error?: string } | null;
    throw new GameRequestError(result?.error || "Leaderboard belum bisa dimuat. Coba lagi.", response.status);
  }
  return response.json();
}

export function LeaderboardShortcut({ onOpen }: { onOpen: () => void }) {
  return (
    <Button variant="menuDirect" className="leaderboard-shortcut w-full" onClick={onOpen}>
      <Trophy data-icon="inline-start" aria-hidden="true" />
      <span><strong>Leaderboard</strong><small>Kejar putaran. Rebut peringkat.</small></span>
      <ArrowRight data-icon="inline-end" aria-hidden="true" />
    </Button>
  );
}

function RacerInitial({ name }: { name: string }) {
  return <span className="leaderboard-avatar" aria-hidden="true">{Array.from(name.trim())[0]?.toUpperCase() || "R"}</span>;
}

function Podium({ entries }: { entries: LeaderboardEntry[] }) {
  return (
    <ol className="leaderboard-podium" aria-label="Podium pembalap">
      {entries.slice(0, 3).map((entry, index) => (
        <li key={index} data-place={entry.rank}>
          <div className="leaderboard-podium-medal" aria-hidden="true">
            {entry.rank === 1 ? <Crown /> : <Medal />}
          </div>
          <RacerInitial name={entry.name} />
          <strong className="leaderboard-podium-name" title={entry.name}><bdi>{entry.name}</bdi></strong>
          {entry.isCurrentPlayer && <Badge variant="secondary">Kamu</Badge>}
          <p><strong>{number(entry.laps)}</strong><span>putaran</span></p>
          <span className="leaderboard-podium-place"><span className="sr-only">Peringkat </span>#{number(entry.rank)}</span>
        </li>
      ))}
    </ol>
  );
}

function PersonalRank({ data, onRace }: { data: Leaderboard; onRace: () => void }) {
  const { currentPlayer: me, nextRival: rival } = data;
  const gap = me && rival ? lapsToOvertake(me.laps, rival.laps) : null;
  return (
    <section className="panel leaderboard-personal" aria-labelledby="personal-rank-title">
      <div className="leaderboard-personal-heading">
        <h2 id="personal-rank-title">Posisimu</h2>
        <Badge variant="secondary">{data.developmentPreview ? "Preview" : "Sepanjang masa"}</Badge>
      </div>
      <div className="leaderboard-personal-stats">
        <div><strong>{me ? `#${number(me.rank)}` : "—"}</strong><span>{me ? `dari ${number(data.totalPlayers)} pembalap` : "Belum masuk peringkat"}</span></div>
        <div><strong>{number(me?.laps ?? 0)}</strong><span>putaran tercatat</span></div>
      </div>
      <div className="leaderboard-challenge">
        {me && rival && gap ? (
          <>
            <p><strong>{number(gap)} putaran lagi</strong> untuk menyalip <bdi>{rival.name}</bdi>.</p>
            <Progress value={Math.min(100, me.laps / (rival.laps + 1) * 100)} aria-label="Progres menyalip rival" aria-valuetext={`${number(gap)} putaran lagi`} />
          </>
        ) : (
          <p>{!me ? "Selesaikan putaran pertamamu untuk masuk peringkat." : data.developmentPreview ? "Progres preview tidak masuk peringkat global." : "Kamu di puncak! Terus tambah putaran untuk mempertahankan posisi."}</p>
        )}
        <Button variant="gold" className="w-full" onClick={onRace}>
          <Flag data-icon="inline-start" aria-hidden="true" />
          {me ? "Lanjut balapan" : "Mulai balapan"}
          <ArrowRight data-icon="inline-end" aria-hidden="true" />
        </Button>
      </div>
    </section>
  );
}

function Rankings({ data }: { data: Leaderboard }) {
  return (
    <section className="panel leaderboard-rankings" aria-labelledby="rankings-title">
      <div className="leaderboard-list-heading">
        <h2 id="rankings-title">{data.developmentPreview ? "Peringkat preview" : `Top ${LEADERBOARD_LIMIT} pembalap`}</h2>
        <span>{number(data.totalPlayers)} pembalap</span>
      </div>
      <table>
        <caption className="sr-only">Peringkat berdasarkan total putaran yang sudah dicatat server</caption>
        <thead><tr><th scope="col">Pos.</th><th scope="col">Pembalap</th><th scope="col">Putaran</th></tr></thead>
        <tbody>
          {data.entries.map((entry, index) => (
            <tr key={index} className={cn(entry.isCurrentPlayer && "leaderboard-row-self")}>
              <td><span className="leaderboard-row-rank" data-place={entry.rank}>#{number(entry.rank)}</span></td>
              <th scope="row">
                <div className="leaderboard-racer">
                  <RacerInitial name={entry.name} />
                  <div><span className="leaderboard-racer-name" title={entry.name}><bdi>{entry.name}</bdi></span>{entry.isCurrentPlayer && <Badge variant="secondary">Kamu</Badge>}</div>
                </div>
              </th>
              <td>{number(entry.laps)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.currentPlayer && !data.entries.some((entry) => entry.isCurrentPlayer) && (
        <p className="leaderboard-list-note">Posisimu #{number(data.currentPlayer.rank)} tetap ditampilkan di kartu Posisimu, meski belum masuk Top {LEADERBOARD_LIMIT}.</p>
      )}
    </section>
  );
}

export function LeaderboardPanel({ initData, onRace }: { initData: string; onRace: () => void }) {
  const sessionEnded = useRef(false);
  const { data, error, isLoading, isValidating, mutate } = useSWR<Leaderboard>(
    ["/api/game/leaderboard", initData] as const,
    fetchLeaderboard,
    {
      refreshInterval: LEADERBOARD_REFRESH_MS,
      refreshWhenHidden: false,
      revalidateOnFocus: true,
      dedupingInterval: 5_000,
      errorRetryCount: 2,
      shouldRetryOnError: (cause) => !(cause instanceof GameRequestError) || cause.status >= 500,
      isPaused: () => sessionEnded.current,
      onError: (cause) => { sessionEnded.current = isSessionExpired(cause); },
    },
  );
  const expired = isSessionExpired(error);
  const refresh = () => void mutate().catch(() => undefined);

  return (
    <div className="leaderboard-layout section-enter">
      <header className="leaderboard-heading">
        <div><p className="eyebrow">Mobil kecil. Ambisi besar.</p><h1>Leaderboard</h1><p>Tambah putaran. Tinggalkan lawan.</p></div>
        <span className="leaderboard-emblem" aria-hidden="true"><Trophy /></span>
      </header>
      {data?.developmentPreview && (
        <p className="leaderboard-preview" role="note">Mode preview · Hanya progres sesi ini. Tidak terhubung ke peringkat pemain asli.</p>
      )}
      <div className="leaderboard-toolbar">
        <Badge variant="outline">Total putaran · Sepanjang masa</Badge>
        <Button variant="ghost" size="icon-lg" aria-label="Perbarui leaderboard" title="Perbarui leaderboard" onClick={refresh} disabled={isValidating || expired}>
          <RefreshCw aria-hidden="true" />
        </Button>
      </div>
      {isLoading && !data && <p className="panel leaderboard-feedback" role="status">Memuat peringkat pembalap…</p>}
      {error && (
        <div className="panel leaderboard-feedback" role="alert">
          <p>{expired ? "Sesi Telegram kedaluwarsa. Buka ulang Racely dari @RacelyBot." : error instanceof GameRequestError ? error.message : "Koneksi terputus. Coba muat ulang leaderboard."}</p>
          {data && !expired && <p>Peringkat di bawah adalah data terakhir yang berhasil dimuat.</p>}
          {!expired && <Button variant="outline" onClick={refresh} disabled={isValidating}>Coba lagi</Button>}
        </div>
      )}
      {data && !expired && (
        <>
          {data.entries.length > 0 && <Podium entries={data.entries} />}
          <PersonalRank data={data} onRace={onRace} />
          {data.entries.length > 0 ? <Rankings data={data} /> : (
            <section className="panel leaderboard-empty" aria-labelledby="leaderboard-empty-title">
              <Trophy aria-hidden="true" /><h2 id="leaderboard-empty-title">Garis start masih terbuka.</h2>
              <p>Belum ada putaran tercatat. Jadilah pembalap pertama di leaderboard!</p>
            </section>
          )}
          <p className="leaderboard-updated" role="status">
            {isValidating ? "Memperbarui peringkat…" : <>Diperbarui <time dateTime={data.updatedAt}>{new Date(data.updatedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</time> · Otomatis setiap 30 detik</>}
          </p>
        </>
      )}
      <footer className="leaderboard-rules">
        <ShieldCheck aria-hidden="true" />
        <p>Hanya putaran selesai yang sudah dicatat server. Putaran offline masuk setelah progres disinkronkan. Jumlah sama mendapat peringkat sama; urutan tampilan memakai waktu bergabung. Tidak ada hadiah koin otomatis.</p>
      </footer>
    </div>
  );
}
