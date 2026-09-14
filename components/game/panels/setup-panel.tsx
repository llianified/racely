"use client";

import { Check, Cog, Flag, TriangleAlert } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { SectionCardHeading } from "../shell/section-card-heading";
import { InfoHint } from "./info-hint";

const seconds = (value: number) =>
  `${value.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}s`;

/**
 * Setiap baris menunjukkan AKIBAT pilihannya, bukan angka modifiernya. Itu
 * yang mengubah tab ini dari tabel jadi keputusan: pemain melihat "di trek ini
 * gear itu bikin gue keluar lintasan 1,4x per putaran", lalu mengganti roller
 * dan melihat angkanya jatuh.
 *
 * Pratinjaunya memakai `lapSeconds` -- fungsi yang sama persis dipakai
 * settlement server -- jadi angka di layar tidak bisa menyimpang dari yang
 * dibayar.
 */
function OptionRow({
  name,
  description,
  active,
  disabled,
  preview,
  current,
  courseOuts,
  onPick,
}: {
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
    <li className={cn("reward-row", active && "is-claimed", risky && "is-ready")}>
      <span className="reward-row-icon" aria-hidden="true">
        {risky ? <TriangleAlert /> : <Flag />}
      </span>
      <div className="reward-row-copy">
        <h3>{name}</h3>
        <p>{description}</p>
        <p>
          {seconds(preview)} per putaran
          {delta !== 0 && ` (${delta > 0 ? "+" : "−"}${seconds(Math.abs(delta))})`}
          {risky &&
            ` · keluar lintasan ${courseOuts.toLocaleString("id-ID", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}× per putaran`}
        </p>
      </div>
      <div className="reward-row-action">
        {active ? (
          <span className="mission-status">
            <Check aria-hidden="true" />
            Terpasang
          </span>
        ) : (
          <Button
            variant="secondary"
            disabled={disabled}
            onClick={onPick}
            aria-label={`Pasang ${name}, ${seconds(preview)} per putaran`}
          >
            Pasang
          </Button>
        )}
      </div>
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
  const circuitName = game.circuit ? "Midnight Speedway" : "Jakarta Raceway";

  return (
    <section className="panel rewards-list-panel" aria-label="Setup mobil">
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
              {circuitName}, memakai rumus yang sama dengan server.
            </InfoHint>
          </>
        }
      />
      {performance.courseOutsPerLap > 0 && (
        <p className="race-settings-note" role="status">
          Setup ini kelewat agresif untuk {circuitName}: mobil keluar lintasan{" "}
          {performance.courseOutsPerLap.toLocaleString("id-ID", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
          × per putaran. Roller lebih berat atau gear lebih pendek akan
          menghentikannya.
        </p>
      )}

      <h3 className="race-settings-title">Gear ratio</h3>
      <ul className="reward-list">
        {GEAR_IDS.map((gear) => (
          <OptionRow
            key={gear}
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

      <h3 className="race-settings-title">Roller</h3>
      <ul className="reward-list">
        {ROLLER_IDS.map((roller) => (
          <OptionRow
            key={roller}
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
    </section>
  );
}
