"use client";

import { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import useSWR from "swr";
import {
  ArrowRight,
  Crown,
  Flag,
  RefreshCw,
  ShieldCheck,
  Trophy,
  UserPlus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { CAR_CATALOG, isReferralCar } from "@/lib/car-catalog";
import {
  LEADERBOARD_LIMIT,
  LEADERBOARD_REFRESH_MS,
  scoreToOvertake,
  leaderboardCar,
  type Leaderboard,
  type LeaderboardMetric,
} from "@/lib/leaderboard";
import { GameRequestError, isSessionExpired, requestHeaders, type GameKey } from "../game-client";
import { LeaderboardPodium } from "./leaderboard-podium";

const PodiumScene = dynamic(() => import("../scene/leaderboard-podium-scene"), { ssr: false });

const number = (value: number) => value.toLocaleString("id-ID");

/**
 * Mobil hadiah ajakan adalah iklan berjalan: satu-satunya cara memilikinya
 * adalah membawa teman, jadi namanya ditampilkan di klasemen sebagai status.
 * Mobil biasa tidak ditandai -- semua orang punya salah satunya.
 */
function ExclusiveCarBadge({ entry }: { entry: Leaderboard["entries"][number] }) {
  if (!entry.carModel || !isReferralCar(entry.carModel)) return null;
  return <Badge><Crown data-icon="inline-start" aria-hidden="true" />{CAR_CATALOG[entry.carModel].name}</Badge>;
}

const metricCopy = {
  laps: {
    eyebrow: "Klasemen total putaran",
    description: "Balapan lebih jauh. Rebut posisi teratas.",
    scoreLabel: "Total putaran",
    unit: "putaran",
    population: "pembalap",
    performance: "Performa pembalap",
    firstStep: "Selesaikan putaran pertamamu untuk tercatat di klasemen.",
    emptyTitle: "Garis start masih terbuka.",
    emptyBody: "Belum ada putaran tercatat. Jadilah pembalap pertama di leaderboard!",
    action: "Lanjut balapan",
    startAction: "Mulai balapan",
    rules: "Hanya putaran selesai yang tercatat server; progres offline masuk setelah sinkron. Saat total sama, peringkat sama dan waktu bergabung menentukan urutan. Tanpa hadiah koin otomatis.",
  },
  referrals: {
    eyebrow: "Klasemen referral sukses",
    description: "Ajak teman balapan. Pimpin komunitas Racely.",
    scoreLabel: "Referral sukses",
    unit: "referral",
    population: "pengajak",
    performance: "Performa ajakan",
    firstStep: "Ajak teman dan bantu mereka mencapai milestone agar masuk klasemen.",
    emptyTitle: "Podium pengajak masih kosong.",
    emptyBody: "Belum ada referral yang menuntaskan milestone. Jadilah pengajak pertama!",
    action: "Ajak teman lagi",
    startAction: "Bagikan ajakan",
    rules: "Hanya referral yang sudah mencapai milestone dan dibayar server yang dihitung. Saat total sama, peringkat sama dan waktu bergabung menentukan urutan. Tanpa hadiah leaderboard otomatis.",
  },
} as const;

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

export function LeaderboardShortcut({
  initData,
  active,
  onOpen,
}: {
  initData: string;
  active: boolean;
  onOpen: () => void;
}) {
  const sessionEnded = useRef(false);
  const { data, error, isLoading, isValidating, mutate } = useSWR<Leaderboard>(
    active ? ["/api/game/leaderboard?metric=laps", initData] as const : null,
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
  const me = data?.currentPlayer;
  const rival = data?.nextRival;

  return (
    <section className="panel leaderboard-teaser" aria-labelledby="leaderboard-teaser-title" aria-busy={isLoading}>
      <header className="leaderboard-teaser-heading">
        <div className="leaderboard-teaser-emblem" aria-hidden="true"><Trophy /></div>
        <div className="leaderboard-teaser-intro">
          <div>
            <h2 id="leaderboard-teaser-title">Leaderboard</h2>
            {data?.developmentPreview && <Badge variant="outline">Preview</Badge>}
          </div>
          <p>Satu putaran lebih dekat ke puncak.</p>
        </div>
      </header>

      {isLoading && !data && (
        <p className="leaderboard-teaser-message" role="status">Mencari posisi kamu di lintasan…</p>
      )}
      {error && (
        <div className="leaderboard-teaser-message" role="status">
          <p>{expired
            ? "Sesi berakhir. Buka ulang Racely dari Telegram."
            : data ? "Koneksi terputus. Menampilkan peringkat terakhir." : "Peringkat belum bisa dimuat."}</p>
          {!expired && (
            <Button variant="outline" size="sm" onClick={() => void mutate().catch(() => undefined)} disabled={isValidating}>
              <RefreshCw data-icon="inline-start" aria-hidden="true" />
              Coba lagi
            </Button>
          )}
        </div>
      )}

      {data && !expired && (
        <>
          <div className="leaderboard-teaser-personal">
            <dl>
              <div>
                <dt>Posisimu</dt>
                <dd>{me ? <><span>#</span>{number(me.rank)}</> : <span aria-label="Belum masuk peringkat">—</span>}</dd>
              </div>
              <div>
                <dt>Total putaran</dt>
                <dd>{number(me?.score ?? 0)}</dd>
              </div>
            </dl>
            <p>
              {me && rival ? (
                <><strong>{number(scoreToOvertake(me.score, rival.score))} putaran lagi</strong> untuk menyalip <bdi>{rival.name}</bdi>.</>
              ) : !me ? (
                "Putaran pertama jadi langkahmu menuju podium."
              ) : data.developmentPreview ? (
                "Posisi ini hanya untuk sesi preview kamu."
              ) : (
                "Kamu di puncak. Terus melaju, jaga posisimu."
              )}
            </p>
          </div>

          {data.entries.length > 0 ? (
            <div className="leaderboard-teaser-standings">
              <div className="leaderboard-teaser-list-heading">
                <h3>Barisan terdepan</h3>
                <span>{number(data.totalPlayers)} pembalap</span>
              </div>
              <ol aria-label="Pembalap dengan putaran terbanyak">
                {data.entries.slice(0, 3).map((entry, index) => (
                  <li key={`${entry.rank}-${entry.name}-${index}`} data-place={entry.rank}>
                    <span className="leaderboard-teaser-position"><span className="sr-only">Peringkat </span>{number(entry.rank)}</span>
                    <RacerInitial name={entry.name} />
                    <div className="leaderboard-teaser-racer">
                      <strong className="truncate" title={entry.name}><bdi>{entry.name}</bdi></strong>
                      <span>{entry.carModel && isReferralCar(entry.carModel) ? CAR_CATALOG[entry.carModel].name : entry.isCurrentPlayer ? "Kamu" : entry.rank === 1 ? "Pemimpin klasemen" : "Penantang podium"}</span>
                    </div>
                    <div className="leaderboard-teaser-score">
                      {entry.rank === 1 && <Crown aria-hidden="true" />}
                      <strong>{number(entry.score)}<span className="sr-only"> putaran</span></strong>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <div className="leaderboard-teaser-empty">
              <Flag aria-hidden="true" />
              <div>
                <strong>Garis start masih terbuka</strong>
                <p>{data.developmentPreview ? "Selesaikan satu putaran untuk melihat peringkat preview." : "Belum ada putaran tercatat. Jadilah yang pertama!"}</p>
              </div>
            </div>
          )}
        </>
      )}

      <footer className="leaderboard-teaser-footer">
        <Button variant="ghost" className="w-full justify-between" onClick={onOpen}>
          Lihat klasemen lengkap
          <ArrowRight data-icon="inline-end" aria-hidden="true" />
        </Button>
      </footer>
    </section>
  );
}

function RacerInitial({ name }: { name: string }) {
  return <span className="leaderboard-avatar" aria-hidden="true">{Array.from(name.trim())[0]?.toUpperCase() || "R"}</span>;
}

<<<<<<< HEAD
function Podium({ data }: { data: Leaderboard }) {
  const first = useRef<HTMLDivElement>(null);
  const second = useRef<HTMLDivElement>(null);
  const third = useRef<HTMLDivElement>(null);
  const tracks = [first, second, third];
  const cars = data.entries.slice(0, 3).map(leaderboardCar);
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const onUnavailable = useCallback(() => { setReady(false); setUnavailable(true); }, []);
  const copy = metricCopy[data.metric];
  return (
    <section className="leaderboard-podium-section" aria-labelledby="podium-title">
      <div className="leaderboard-podium-heading">
        <div>
          <p className="eyebrow">Barisan terdepan</p>
          <h2 id="podium-title">Podium</h2>
        </div>
        <Badge variant="outline">Top 3</Badge>
      </div>
      <ol className="leaderboard-podium" aria-label="Tiga pemain teratas">
        {data.entries.slice(0, 3).map((entry, index) => (
          <li key={`${entry.rank}-${entry.name}-${index}`} data-place={entry.rank}>
            <div className="leaderboard-podium-mark" aria-hidden="true">
              <span>#{number(entry.rank)}</span>
              {index === 0 ? <Crown /> : <Medal />}
            </div>
            <div
              ref={tracks[index]}
              className="leaderboard-podium-car"
              role="img"
              aria-label={cars[index] ? `${CAR_CATALOG[cars[index].model].name} milik ${entry.name}, warna ${cars[index].color}, sesuai setup terpasang${unavailable ? ". Preview 3D tidak tersedia" : ""}` : `Pembalap ${entry.name}`}
            >
              {(!ready || !cars[index] || unavailable) && <RacerInitial name={entry.name} />}
            </div>
            <strong className="leaderboard-podium-name" title={entry.name}><bdi>{entry.name}</bdi></strong>
            {entry.isCurrentPlayer && <Badge variant="secondary">Kamu</Badge>}
            <ExclusiveCarBadge entry={entry} />
            <p><strong>{number(entry.score)}</strong><span>{copy.unit}</span></p>
          </li>
        ))}
      </ol>
      {!unavailable && cars.some(Boolean) && <PodiumScene cars={cars} tracks={tracks} onReady={onReady} onUnavailable={onUnavailable} />}
    </section>
  );
}

=======
>>>>>>> origin/main
function PersonalRank({
  data,
  onAction,
}: {
  data: Leaderboard;
  onAction: () => void;
}) {
  const { currentPlayer: me, nextRival: rival } = data;
  const copy = metricCopy[data.metric];
  const gap = me && rival ? scoreToOvertake(me.score, rival.score) : null;
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
          <p className="eyebrow">{copy.performance}</p>
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
          <small>{me ? `dari ${number(data.totalPlayers)} ${copy.population}` : "Belum masuk peringkat"}</small>
        </div>
        <dl className="leaderboard-lap-score">
          <div>
            <dt>{copy.scoreLabel}</dt>
            <dd>{number(me?.score ?? 0)}</dd>
          </div>
        </dl>
      </div>
      <div className="leaderboard-challenge">
        <div className="leaderboard-target-heading">
          <span>{targetLabel}</span>
          {rival && (
            <strong title={rival.name}>
              <bdi>{rival.name}</bdi>
              <small>{number(rival.score)} {copy.unit}</small>
            </strong>
          )}
        </div>
        {me && rival && gap !== null ? (
          <>
            <p><strong>{number(gap)} {copy.unit} lagi</strong> untuk menyalip.</p>
            <Progress value={Math.min(100, me.score / (rival.score + 1) * 100)} aria-label="Progres menyalip rival" aria-valuetext={`${number(gap)} ${copy.unit} lagi`} />
          </>
        ) : (
          <p>{!me ? copy.firstStep : data.developmentPreview ? "Progres preview hanya berlaku untuk sesi ini." : `Kamu di puncak. Tambah ${copy.unit} untuk menjaga jarak.`}</p>
        )}
        <Button variant="gold" className="w-full" onClick={onAction}>
          {data.metric === "laps" ? <Flag data-icon="inline-start" aria-hidden="true" /> : <UserPlus data-icon="inline-start" aria-hidden="true" />}
          {me ? copy.action : copy.startAction}
          <ArrowRight data-icon="inline-end" aria-hidden="true" />
        </Button>
      </div>
    </section>
  );
}

function Rankings({ data }: { data: Leaderboard }) {
  const copy = metricCopy[data.metric];
  return (
    <section className="panel leaderboard-rankings" aria-labelledby="rankings-title">
      <div className="leaderboard-list-heading">
        <div>
          <p className="eyebrow">Klasemen lengkap</p>
          <h2 id="rankings-title">{data.developmentPreview ? "Peringkat preview" : `Top ${LEADERBOARD_LIMIT}`}</h2>
        </div>
        <Badge variant="outline">{number(data.totalPlayers)} {copy.population}</Badge>
      </div>
      <table>
        <caption className="sr-only">Peringkat berdasarkan {copy.scoreLabel.toLowerCase()} yang dicatat server</caption>
        <thead><tr><th scope="col">Pos.</th><th scope="col">Pemain</th><th scope="col">{copy.scoreLabel}</th></tr></thead>
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
                    <ExclusiveCarBadge entry={entry} />
                  </div>
                </div>
              </th>
              <td><strong>{number(entry.score)}</strong><span className="sr-only"> {copy.unit}</span></td>
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

export function LeaderboardPanel({
  initData,
  onRace,
  onInvite,
}: {
  initData: string;
  onRace: () => void;
  onInvite: () => void;
}) {
  const [metric, setMetric] = useState<LeaderboardMetric>("laps");
  const sessionEnded = useRef(false);
  const { data, error, isLoading, isValidating, mutate } = useSWR<Leaderboard>(
    [`/api/game/leaderboard?metric=${metric}`, initData] as const,
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
  const copy = metricCopy[metric];
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
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>Leaderboard</h1>
        </div>
        <div className="leaderboard-heading-tools">
          <span className="leaderboard-sync" data-state={syncState} aria-live="polite"><i aria-hidden="true" />{syncLabel}</span>
          <Button variant="outline" size="icon-sm" aria-label="Perbarui leaderboard" title="Perbarui leaderboard" onClick={refresh} disabled={isValidating || expired}>
            <RefreshCw aria-hidden="true" />
          </Button>
        </div>
        <p className="leaderboard-heading-description">{copy.description}</p>
      </header>
      <div className="grid grid-cols-2 gap-sm" role="tablist" aria-label="Kategori leaderboard">
        <Button role="tab" aria-selected={metric === "laps"} variant={metric === "laps" ? "goldSoft" : "outline"} onClick={() => setMetric("laps")}>
          <Flag data-icon="inline-start" aria-hidden="true" />
          Putaran
        </Button>
        <Button role="tab" aria-selected={metric === "referrals"} variant={metric === "referrals" ? "goldSoft" : "outline"} onClick={() => setMetric("referrals")}>
          <UserPlus data-icon="inline-start" aria-hidden="true" />
          Referral
        </Button>
      </div>
      {data?.developmentPreview && (
        <p className="leaderboard-preview" role="note"><strong>Mode preview.</strong> Progres sesi ini tidak masuk klasemen pemain asli.</p>
      )}
      {isLoading && !data && <p className="panel leaderboard-feedback" role="status">Memuat peringkat pemain…</p>}
      {error && (
        <div className="panel leaderboard-feedback" role="alert">
          <p>{expired ? "Sesi Telegram kedaluwarsa. Buka ulang Racely dari @RacelyBot." : error instanceof GameRequestError ? error.message : "Koneksi terputus. Coba muat ulang leaderboard."}</p>
          {data && !expired && <p>Peringkat di bawah adalah data terakhir yang berhasil dimuat.</p>}
          {!expired && <Button variant="outline" onClick={refresh} disabled={isValidating}>Coba lagi</Button>}
        </div>
      )}
      {data && !expired && (
        <>
          <PersonalRank data={data} onAction={metric === "laps" ? onRace : onInvite} />
          <LeaderboardPodium entries={data.entries} unit={copy.unit} />
          {data.entries.length > 0 ? <Rankings data={data} /> : (
            <section className="panel leaderboard-empty" aria-labelledby="leaderboard-empty-title">
              <Trophy aria-hidden="true" /><h2 id="leaderboard-empty-title">{copy.emptyTitle}</h2>
              <p>{copy.emptyBody}</p>
            </section>
          )}
          <footer className="leaderboard-meta">
            <p className="leaderboard-updated">
              {isValidating ? "Memperbarui peringkat…" : <>Diperbarui <time dateTime={data.updatedAt}>{new Date(data.updatedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</time> · Otomatis tiap {number(LEADERBOARD_REFRESH_MS / 1_000)} dtk</>}
            </p>
            <div className="leaderboard-rules">
              <ShieldCheck aria-hidden="true" />
              <p>{copy.rules}</p>
            </div>
          </footer>
        </>
      )}
    </div>
  );
}
