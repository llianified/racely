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
    <section className="leaderboard-podium-section" aria-labelledby="podium-title">
      <div className="leaderboard-podium-heading">
        <div>
          <p className="eyebrow">Barisan terdepan</p>
          <h2 id="podium-title">Podium</h2>
        </div>
        <Badge variant="outline">Top 3</Badge>
      </div>
      <ol className="leaderboard-podium" aria-label="Tiga pembalap teratas">
        {entries.slice(0, 3).map((entry, index) => (
          <li key={`${entry.rank}-${entry.name}-${index}`} data-place={entry.rank}>
            <div className="leaderboard-podium-mark" aria-hidden="true">
              <span>#{number(entry.rank)}</span>
              {index === 0 ? <Crown /> : <Medal />}
            </div>
            <RacerInitial name={entry.name} />
            <strong className="leaderboard-podium-name" title={entry.name}><bdi>{entry.name}</bdi></strong>
            {entry.isCurrentPlayer && <Badge variant="secondary">Kamu</Badge>}
            <p><strong>{number(entry.laps)}</strong><span>putaran</span></p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function PersonalRank({ data, onRace }: { data: Leaderboard; onRace: () => void }) {
  const { currentPlayer: me, nextRival: rival } = data;
  const gap = me && rival ? lapsToOvertake(me.laps, rival.laps) : null;
  const targetLabel = !me
    ? "Masuk klasemen"
    : rival
      ? "Target berikutnya"
      : data.developmentPreview
        ? "Sesi preview"
        : "Pertahankan posisi";

  return (
    <section className="panel leaderboard-personal" aria-labelledby="personal-rank-title">
      <div className="leaderboard-personal-heading">
        <div>
          <p className="eyebrow">Performa pembalap</p>
          <h2 id="personal-rank-title">Posisimu</h2>
        </div>
        <Badge variant="secondary">{data.developmentPreview ? "Preview" : "Sepanjang masa"}</Badge>
      </div>
      <div className="leaderboard-personal-score">
        <div className="leaderboard-rank-score">
          <span>Peringkat</span>
          <strong>
            {me ? <><span aria-hidden="true">#</span>{number(me.rank)}</> : "—"}
          </strong>
          <small>{me ? `dari ${number(data.totalPlayers)} pembalap` : "Belum masuk peringkat"}</small>
        </div>
        <dl className="leaderboard-lap-score">
          <div>
            <dt>Total putaran</dt>
            <dd>{number(me?.laps ?? 0)}</dd>
          </div>
        </dl>
      </div>
      <div className="leaderboard-challenge">
        <div className="leaderboard-target-heading">
          <span>{targetLabel}</span>
          {rival && (
            <strong title={rival.name}>
              <bdi>{rival.name}</bdi>
              <small>{number(rival.laps)} putaran</small>
            </strong>
          )}
        </div>
        {me && rival && gap !== null ? (
          <>
            <p><strong>{number(gap)} putaran lagi</strong> untuk menyalip.</p>
            <Progress value={Math.min(100, me.laps / (rival.laps + 1) * 100)} aria-label="Progres menyalip rival" aria-valuetext={`${number(gap)} putaran lagi`} />
          </>
        ) : (
          <p>{!me ? "Selesaikan putaran pertamamu untuk tercatat di klasemen." : data.developmentPreview ? "Progres preview hanya berlaku untuk sesi ini." : "Kamu di puncak. Tambah putaran untuk menjaga jarak."}</p>
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
        <div>
          <p className="eyebrow">Klasemen lengkap</p>
          <h2 id="rankings-title">{data.developmentPreview ? "Peringkat preview" : `Top ${LEADERBOARD_LIMIT}`}</h2>
        </div>
        <Badge variant="outline">{number(data.totalPlayers)} pembalap</Badge>
      </div>
      <table>
        <caption className="sr-only">Peringkat berdasarkan total putaran yang sudah dicatat server</caption>
        <thead><tr><th scope="col">Pos.</th><th scope="col">Pembalap</th><th scope="col">Putaran</th></tr></thead>
        <tbody>
          {data.entries.map((entry, index) => (
            <tr key={`${entry.rank}-${entry.name}-${index}`} className={cn(entry.isCurrentPlayer && "leaderboard-row-self")}>
              <td><span className="leaderboard-row-rank" data-place={entry.rank}><span className="sr-only">Peringkat </span>{number(entry.rank)}</span></td>
              <th scope="row">
                <div className="leaderboard-racer">
                  <RacerInitial name={entry.name} />
                  <div>
                    <span className="leaderboard-racer-name" title={entry.name}><bdi>{entry.name}</bdi></span>
                    {entry.isCurrentPlayer && <Badge variant="secondary">Kamu</Badge>}
                  </div>
                </div>
              </th>
              <td><strong>{number(entry.laps)}</strong><span className="sr-only"> putaran</span></td>
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
  const syncLabel = expired
    ? "Sesi berakhir"
    : isValidating
      ? "Memperbarui"
      : error
        ? "Data terakhir"
        : data?.developmentPreview
          ? "Preview"
          : "Live";
  const syncState = expired || error ? "warning" : isValidating ? "updating" : "ready";

  return (
    <div className="leaderboard-layout section-enter" aria-busy={isValidating}>
      <header className="leaderboard-heading">
        <div className="leaderboard-heading-copy">
          <p className="eyebrow">Klasemen total putaran</p>
          <h1>Leaderboard</h1>
          <p>Balapan lebih jauh. Rebut posisi teratas.</p>
        </div>
        <div className="leaderboard-heading-tools">
          <span className="leaderboard-sync" data-state={syncState} aria-live="polite"><i aria-hidden="true" />{syncLabel}</span>
          <Button variant="outline" size="icon-sm" aria-label="Perbarui leaderboard" title="Perbarui leaderboard" onClick={refresh} disabled={isValidating || expired}>
            <RefreshCw aria-hidden="true" />
          </Button>
        </div>
      </header>
      {data?.developmentPreview && (
        <p className="leaderboard-preview" role="note"><strong>Mode preview.</strong> Progres sesi ini tidak masuk klasemen pemain asli.</p>
      )}
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
          <PersonalRank data={data} onRace={onRace} />
          {data.entries.length >= 3 && <Podium entries={data.entries} />}
          {data.entries.length > 0 ? <Rankings data={data} /> : (
            <section className="panel leaderboard-empty" aria-labelledby="leaderboard-empty-title">
              <Trophy aria-hidden="true" /><h2 id="leaderboard-empty-title">Garis start masih terbuka.</h2>
              <p>Belum ada putaran tercatat. Jadilah pembalap pertama di leaderboard!</p>
            </section>
          )}
          <footer className="leaderboard-meta">
            <p className="leaderboard-updated">
              {isValidating ? "Memperbarui peringkat…" : <>Diperbarui <time dateTime={data.updatedAt}>{new Date(data.updatedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</time> · Otomatis tiap {number(LEADERBOARD_REFRESH_MS / 1_000)} dtk</>}
            </p>
            <div className="leaderboard-rules">
              <ShieldCheck aria-hidden="true" />
              <p>Hanya putaran selesai yang tercatat server; progres offline masuk setelah sinkron. Saat total sama, peringkat sama dan waktu bergabung menentukan urutan. Tanpa hadiah koin otomatis.</p>
            </div>
          </footer>
        </>
      )}
    </div>
  );
}
