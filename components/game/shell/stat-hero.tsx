import type { ReactNode } from "react";

export type StatHeroStat = { label: string; value: ReactNode };

/**
 * Kartu angka utama untuk tab Hadiah dan Dompet. Satu komponen supaya kedua
 * tab berbagi grid yang sama: eyebrow + info di baris atas, angka besar
 * sejajar dengan tombol aksi, lalu strip dua statistik di bawah.
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
  figure: string;
  unit?: string;
  info?: ReactNode;
  action: ReactNode;
  stats: [StatHeroStat, StatHeroStat];
  ariaLabel: string;
}) {
  return (
    <section className="stat-hero" aria-label={ariaLabel}>
      <div className="stat-hero-head">
        <span className="eyebrow">{label}</span>
        {info}
      </div>
      <div className="stat-hero-main">
        <strong className="stat-hero-figure">
          {figure} <span>{unit}</span>
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
