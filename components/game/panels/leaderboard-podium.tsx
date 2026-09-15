"use client";

import dynamic from "next/dynamic";
import { CarFront, Crown, Medal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CAR_CATALOG, isReferralCar } from "@/lib/car-catalog";
import type { LeaderboardEntry } from "@/lib/leaderboard";

const PodiumScene = dynamic(() => import("../scene/leaderboard-podium-scene"), {
  ssr: false,
  loading: () => <div className="leaderboard-podium-loading" role="status">Menyiapkan mobil podium…</div>,
});

export function LeaderboardPodium({ entries, unit }: { entries: LeaderboardEntry[]; unit: string }) {
  const leaders = entries.slice(0, 3);
  if (!leaders.length) return null;

  const fallback = (
    <div className="leaderboard-podium-fallback">
      {leaders.map((entry, index) => (
        <span key={index} data-slot={index}>
          <CarFront aria-hidden="true" />
        </span>
      ))}
      <p>Preview 3D tidak tersedia. Detail mobil tetap tampil di bawah.</p>
    </div>
  );

  return (
    <section className="leaderboard-podium-section" aria-labelledby="podium-title">
      <div className="leaderboard-podium-heading">
        <div>
          <p className="eyebrow">Barisan terdepan</p>
          <h2 id="podium-title">Podium pembalap</h2>
        </div>
        <Badge variant="outline"><Crown data-icon="inline-start" aria-hidden="true" />Top 3</Badge>
      </div>
      <div className="leaderboard-podium-showcase">
        <div className="leaderboard-podium-stage">
          <PodiumScene entries={leaders} fallback={fallback} />
        </div>
        <ol className="leaderboard-podium" aria-label="Tiga pemain teratas dan mobil mereka">
          {leaders.map((entry, index) => (
            <li key={`${entry.rank}-${entry.name}-${index}`} data-slot={index} data-place={entry.rank}>
              <div className="leaderboard-podium-mark">
                {entry.rank === 1 ? <Crown aria-hidden="true" /> : <Medal aria-hidden="true" />}
                <span><span className="sr-only">Peringkat </span>#{entry.rank.toLocaleString("id-ID")}</span>
              </div>
              <strong className="leaderboard-podium-name" title={entry.name}><bdi>{entry.name}</bdi></strong>
              <span className="leaderboard-podium-car" data-exclusive={entry.carModel ? isReferralCar(entry.carModel) : false}>
                {entry.carModel ? CAR_CATALOG[entry.carModel]?.name ?? "Mobil tidak dikenal" : "Mobil belum dipilih"}
              </span>
              <p><strong>{entry.score.toLocaleString("id-ID")}</strong><span>{unit}</span></p>
              {entry.isCurrentPlayer && <Badge variant="secondary">Kamu</Badge>}
            </li>
          ))}
        </ol>
        <p className="leaderboard-podium-caption">Mobil podium tampil sesuai warna dan modifikasi terpasang pemain.</p>
      </div>
    </section>
  );
}

