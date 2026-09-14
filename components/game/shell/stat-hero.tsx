"use client";

import type { ReactNode } from "react";
import { formatCoins } from "@/lib/game";
import { useCountUp } from "./use-count-up";

export type StatHeroStat = { label: string; value: ReactNode };

/**
 * Kartu angka utama untuk tab Hadiah dan Dompet. Satu komponen supaya kedua
 * tab berbagi grid yang sama: eyebrow + info di baris atas, angka besar
 * sejajar dengan tombol aksi, lalu strip dua statistik di bawah.
 *
 * `figure` berupa angka, bukan teks yang sudah diformat, karena angkanya
 * digulirkan saat berubah -- formatnya baru dipasang per frame di sini.
 */
export function StatHero({
  label,
  figure,
  unit = "koin",
  info,
  action,
  stats,
  ariaLabel,
}: {
  label: string;
  figure: number;
  unit?: string;
  info?: ReactNode;
  action: ReactNode;
  stats: [StatHeroStat, StatHeroStat];
  ariaLabel: string;
}) {
  const animated = useCountUp(figure);

  return (
    <section className="stat-hero" aria-label={ariaLabel}>
      <div className="stat-hero-head">
        <span className="eyebrow">{label}</span>
        {info}
      </div>
      <div className="stat-hero-main">
        <strong className="stat-hero-figure">
          {/* Pembaca layar mendapat nilai akhir; angka yang bergulir hanya untuk mata. */}
          <span aria-hidden="true">{formatCoins(animated)}</span>
          <span className="sr-only">{formatCoins(figure)}</span>
          <span className="stat-hero-unit">{unit}</span>
        </strong>
        {action}
      </div>
      <dl className="stat-hero-stats">
        {stats.map((stat) => (
          <div key={stat.label}>
            <dt>{stat.label}</dt>
            <dd>{stat.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
