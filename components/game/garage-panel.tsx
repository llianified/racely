"use client";

import dynamic from "next/dynamic";
import { memo } from "react";
import { ArrowUp, BatteryMedium, Check, Cog, CircleDot } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoHint } from "./info-hint";
import { lapReward, lapSeconds, totalLevel, upgradeCost, rupiah, type GameState, type Upgrade } from "@/lib/game";

const CarPreviewScene = dynamic(() => import("./car-preview-scene"), { ssr: false });

export const PARTS = [
  { key: "engine" as Upgrade, title: "Mesin", subtitle: "+15% tenaga dasar", icon: Cog },
  { key: "tires" as Upgrade, title: "Ban & roller", subtitle: "+10% tenaga dasar", icon: CircleDot },
  { key: "battery" as Upgrade, title: "Baterai", subtitle: "+Rp100 / putaran", icon: BatteryMedium },
];

export const GaragePanel = memo(function GaragePanel({ game }: { game: GameState }) {
  return (
    <section className="panel garage-panel" aria-label="Mobil kamu">
      <div className="garage-summary">
        <div className="car-showcase" role="img" aria-label={`Neo Falcon warna ${game.color}, model 3D yang sama dengan di lintasan`}>
          <CarPreviewScene color={game.color} />
        </div>
        <div className="car-identity">
          <Badge variant="secondary">LV. {totalLevel(game)}</Badge>
          <h2>Neo Falcon</h2>
          <p>Super-II · Mini 4WD</p>
        </div>
      </div>
      <div className="garage-stats">
        <span><strong>{(192 / lapSeconds({ ...game, boostLeft: 0 })).toFixed(1)}</strong> km/j</span>
        <span><strong>{rupiah(lapReward(game))}</strong>/lap</span>
        <InfoHint title="Mobil kamu">Kecepatan dasar ditampilkan tanpa boost. Model di atas persis mobil yang kamu pakai di lintasan, lengkap dengan warna pilihanmu.</InfoHint>
      </div>
    </section>
  );
}, (a, b) => a.game.levels === b.game.levels && a.game.color === b.game.color && a.game.circuit === b.game.circuit);

export function UpgradePanel({ game, onUpgrade, disabled = false }: { game: GameState; onUpgrade: (key: Upgrade) => void; disabled?: boolean }) {
  const baseSeconds = lapSeconds({ ...game, boostLeft: 0 });
  return (
    <section id="upgrades" tabIndex={-1} className="panel upgrade-panel">
      <div className="panel-heading">
        <h2>Upgrade performa</h2>
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
            ? `${rupiah(lapReward(game))} → ${rupiah(lapReward(next))}/lap`
            : `${baseSeconds.toFixed(2)} → ${lapSeconds(next).toFixed(2)} d/lap`;
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
                <Button variant="gold" size="sm" className="upgrade-buy" onClick={() => onUpgrade(key)} disabled={disabled || max || !affordable} aria-label={max ? `${title} level maksimal` : `Upgrade ${title}, ${rupiah(cost)} virtual`}>
                  {max ? <Check data-icon="inline-start" /> : <ArrowUp data-icon="inline-start" />}
                  {max ? "MAX" : rupiah(cost)}
                </Button>
                {!max && !affordable && <span>Kurang {rupiah(cost - game.balance)}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
