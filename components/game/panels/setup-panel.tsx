"use client";

import { Check, Cog, Disc3, Gauge, TriangleAlert, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  GEAR_CATALOG,
  GEAR_IDS,
  ROLLER_CATALOG,
  ROLLER_IDS,
  setupPerformance,
  type CarSetup,
  type GearId,
  type RollerId,
} from "@/lib/car-setup";
import { carSetup, lapSeconds, type GameState } from "@/lib/game";
import { circuitName } from "@/lib/track-layout";
import { cn } from "@/lib/utils";
import { SectionCardHeading } from "../shell/section-card-heading";
import { InfoHint } from "./info-hint";

const seconds = (value: number) =>
  `${value.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}s`;

const times = (value: number) =>
  `${value.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;

/**
 * Setiap baris menunjukkan AKIBAT pilihannya, bukan angka modifiernya. Itu
 * yang mengubah tab ini dari tabel jadi keputusan: pemain melihat "di trek ini
 * gear itu bikin gue keluar lintasan 1,4x per putaran", lalu mengganti roller
 * dan melihat angkanya jatuh.
 *
 * Pratinjaunya memakai `lapSeconds` -- fungsi yang sama persis dipakai
 * settlement server -- jadi angka di layar tidak bisa menyimpang dari yang
 * dibayar.
 *
 * Anatominya meniru .upgrade-row di Bengkel (tile ikon + nama + tombol kecil
 * di satu baris, isi di bawahnya) supaya dua panel garasi terasa satu alat.
 * Deskripsi sengaja dibiarkan melipat: ia menjelaskan trade-off yang jadi
 * dasar keputusan, bukan subjudul yang boleh dipotong.
 */
function OptionRow({
  icon: Icon,
  name,
  description,
  active,
  disabled,
  preview,
  current,
  courseOuts,
  onPick,
}: {
  icon: LucideIcon;
  name: string;
  description: string;
  active: boolean;
  disabled: boolean;
  preview: number;
  current: number;
  courseOuts: number;
  onPick: () => void;
}) {
  const delta = preview - current;
  const risky = courseOuts > 0;
  return (
    <li className={cn("upgrade-row setup-row", active && "is-active")}>
      <div className="upgrade-head">
        <span className="upgrade-icon" aria-hidden="true">
          <Icon />
        </span>
        <div className="upgrade-name">
          <h3>{name}</h3>
          <p className="setup-metric">
            <b>{seconds(preview)}</b>/putaran
            {delta !== 0 && (
              <>
                <span aria-hidden="true"> · </span>
                {delta > 0 ? "+" : "−"}
                {seconds(Math.abs(delta))}
              </>
            )}
          </p>
        </div>
        {active ? (
          <Badge variant="secondary" className="upgrade-buy">
            <Check data-icon="inline-start" aria-hidden="true" />
            Terpasang
          </Badge>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            className="upgrade-buy"
            disabled={disabled}
            onClick={onPick}
            aria-label={`Pasang ${name}, ${seconds(preview)} per putaran`}
          >
            Pasang
          </Button>
        )}
      </div>
      <p className="setup-desc">{description}</p>
      {risky && (
        <p className="setup-risk">
          <TriangleAlert aria-hidden="true" />
          Keluar lintasan {times(courseOuts)} per putaran
        </p>
      )}
    </li>
  );
}

export function SetupPanel({
  game,
  disabled = false,
  onSetup,
}: {
  game: GameState;
  disabled?: boolean;
  onSetup: (gear: GearId, roller: RollerId) => void;
}) {
  const setup = carSetup(game);
  // Boost dilepas dari pratinjau: ia berdurasi detik dan hidup mati sendiri,
  // sedangkan yang dibandingkan di sini adalah laju dasar tiap setup.
  const secondsFor = (candidate: CarSetup) =>
    lapSeconds({ ...game, setup: candidate, boostLeft: 0 });
  const current = secondsFor(setup);
  const performance = setupPerformance(setup, game.levels.tires, game.circuit);
  const trackName = circuitName(game.circuit);

  return (
    <section className="panel upgrade-panel" aria-label="Setup mobil">
      <SectionCardHeading
        icon={Cog}
        title="Setup"
        aside={
          <>
            <Badge variant="secondary">{seconds(current)}/putaran</Badge>
            <InfoHint title="Setup mobil">
              Gratis diubah, tidak pernah memberi koin. Gear panjang menang di
              trek lurus tapi masuk tikungan lebih kencang; roller berat menahan
              mobil tetap di lintasan dengan menukar sedikit laju. Setiap trek
              punya jawaban berbeda — angka di bawah dihitung untuk{" "}
              {trackName}, memakai rumus yang sama dengan server.
            </InfoHint>
          </>
        }
      />
      {performance.courseOutsPerLap > 0 && (
        <p className="setup-alert" role="status">
          <TriangleAlert aria-hidden="true" />
          <span>
            Setup ini kelewat agresif untuk {trackName}: mobil keluar lintasan{" "}
            {times(performance.courseOutsPerLap)} per putaran. Roller lebih berat
            atau gear lebih pendek akan menghentikannya.
          </span>
        </p>
      )}

      <div className="setup-group">
        <h3 className="race-settings-title">Gear ratio</h3>
        <ul className="upgrade-list">
          {GEAR_IDS.map((gear) => (
            <OptionRow
              key={gear}
              icon={Gauge}
              name={GEAR_CATALOG[gear].name}
              description={GEAR_CATALOG[gear].description}
              active={setup.gear === gear}
              disabled={disabled}
              preview={secondsFor({ ...setup, gear })}
              current={current}
              courseOuts={
                setupPerformance({ ...setup, gear }, game.levels.tires, game.circuit)
                  .courseOutsPerLap
              }
              onPick={() => onSetup(gear, setup.roller)}
            />
          ))}
        </ul>
      </div>

      <div className="setup-group">
        <h3 className="race-settings-title">Roller</h3>
        <ul className="upgrade-list">
          {ROLLER_IDS.map((roller) => (
            <OptionRow
              key={roller}
              icon={Disc3}
              name={ROLLER_CATALOG[roller].name}
              description={ROLLER_CATALOG[roller].description}
              active={setup.roller === roller}
              disabled={disabled}
              preview={secondsFor({ ...setup, roller })}
              current={current}
              courseOuts={
                setupPerformance({ ...setup, roller }, game.levels.tires, game.circuit)
                  .courseOutsPerLap
              }
              onPick={() => onSetup(setup.gear, roller)}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}
