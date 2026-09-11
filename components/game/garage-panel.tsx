"use client";

import dynamic from "next/dynamic";
import { memo } from "react";
import { ArrowUp, BatteryMedium, Check, Cog, CircleDot, Lock, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CAR_CATALOG, type CarColor } from "@/lib/car-catalog";
import { CarColorPicker } from "./car-color-picker";
import { InfoHint } from "./info-hint";
import { coins, formatCoins, lapReward, lapSeconds, totalLevel, upgradeCost, type GameState, type Upgrade } from "@/lib/game";

const CarPreviewScene = dynamic(() => import("./car-preview-scene"), { ssr: false });

export const PARTS = [
  { key: "engine" as Upgrade, title: "Mesin", subtitle: "+15% tenaga dasar", icon: Cog },
  { key: "tires" as Upgrade, title: "Ban & roller", subtitle: "+10% tenaga dasar", icon: CircleDot },
  { key: "battery" as Upgrade, title: "Baterai", subtitle: "+0,01 koin / putaran", icon: BatteryMedium },
];

export const BODY_COLORS = CAR_CATALOG["neo-falcon"].colors;

export const GaragePanel = memo(function GaragePanel({
  game,
  onChooseColor,
  disabled = false,
}: {
  game: GameState;
  onChooseColor: (color: CarColor, name: string) => void;
  disabled?: boolean;
}) {
  const model = game.carSelection?.model ?? "neo-falcon";
  const car = CAR_CATALOG[model];
  const colorName = car.colors.find((choice) => choice.color === game.color)?.name ?? "pilihan";
  return (
    <section id="body-colors" tabIndex={-1} className="panel garage-panel" aria-label="Mobil kamu">
      <div className="car-stage" role="img" aria-label={`${car.name} warna ${colorName}, model 3D yang sama dengan di lintasan`}>
        <CarPreviewScene color={game.color} model={model} />
        <Badge variant="secondary">LV. {totalLevel(game)}</Badge>
      </div>
      <div className="car-identity">
        <div className="car-identity-head">
          <h2>{car.name}</h2>
          <p>{car.chassis}</p>
          <p>{car.description}</p>
        </div>
        <InfoHint title="Mobil kamu">Kecepatan dasar tanpa boost. Model 3D ini sama dengan mobil di lintasan. Ganti warna bodi gratis dan langsung aktif.</InfoHint>
      </div>
      <CarColorPicker model={model} color={game.color} disabled={disabled} onChoose={onChooseColor} />
      <dl className="garage-stats">
        <div><dt>Kecepatan dasar</dt><dd><strong>{(192 / lapSeconds({ ...game, boostLeft: 0 })).toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</strong> km/j</dd></div>
        <div><dt>Hasil per putaran</dt><dd><strong>{formatCoins(lapReward(game))}</strong> koin</dd></div>
      </dl>
    </section>
  );
});

export function UpgradePanel({ game, onUpgrade, disabled = false }: { game: GameState; onUpgrade: (key: Upgrade) => void; disabled?: boolean }) {
  const baseSeconds = lapSeconds({ ...game, boostLeft: 0 });
  return (
    <section id="upgrades" tabIndex={-1} className="panel upgrade-panel">
      <div className="panel-heading">
        <h2><Wrench aria-hidden="true" />Upgrade performa</h2>
        <InfoHint title="Tuning mobil">Mesin dan ban mempercepat putaran. Baterai menambah hasil koin. Upgrade langsung aktif, tersimpan, dan maksimal level 10.</InfoHint>
      </div>
      <div className="upgrade-list">
        {PARTS.map(({ key, title, icon: Icon }) => {
          const level = game.levels[key];
          const max = level >= 10;
          const cost = upgradeCost(key, level);
          const affordable = game.balance >= cost;
          const next = { ...game, boostLeft: 0, levels: { ...game.levels, [key]: level + 1 } };
          const benefit = key === "battery"
            ? `${formatCoins(lapReward(game))} → ${formatCoins(lapReward(next))} koin/lap`
            : `${baseSeconds.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} → ${lapSeconds(next).toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} dtk/lap`;
          return (
            <div key={key} className="upgrade-row">
              <div className="upgrade-info">
                <div className="upgrade-name"><Icon size={16} aria-hidden="true" /><h3>{title}</h3><span className="level-label">Lv. {level}</span></div>
                <p>{max ? "Performa maksimal" : benefit}</p>
                <div className="level-segments" aria-label={`Level ${level} dari 10`}>
                  {Array.from({ length: 10 }, (_, i) => <span key={i} className={i < level ? "filled" : undefined} />)}
                </div>
              </div>
              <div className="upgrade-action">
                <Button
                  variant="gold"
                  className="upgrade-buy"
                  data-short={!max && !affordable ? "" : undefined}
                  onClick={() => onUpgrade(key)}
                  disabled={disabled || max || !affordable}
                  aria-label={max ? `${title} level maksimal` : affordable ? `Upgrade ${title}, ${coins(cost)}` : `Upgrade ${title} butuh ${coins(cost)}, kurang ${coins(cost - Math.floor(game.balance))}`}
                >
                  {max ? <Check data-icon="inline-start" /> : affordable ? <ArrowUp data-icon="inline-start" /> : <Lock data-icon="inline-start" />}
                  {max ? "MAX" : affordable ? `${formatCoins(cost)} koin` : `Kurang ${formatCoins(cost - Math.floor(game.balance))}`}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
